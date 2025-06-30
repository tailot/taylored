// lib/git-patch-offset-updater.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, ExecOptions as ChildProcessExecOptions } from 'child_process';
import * as util from 'util';
import { handleApplyOperation } from './apply-logic';
import { TAYLORED_DIR_NAME } from './constants';
import { extractMessageFromPatch } from './utils';

const execAsync = util.promisify(exec);

/**
 * Quotes an argument for safe use in a shell command string.
 */
function quoteForShell(arg: string): string {
  if (!/[ \t\n\r"'();&|<>*?#~=%\\]/.test(arg)) {
    return arg;
  }
  const escaped = arg
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/`/g, '\\`')
    .replace(/\$/g, '\\$');
  return `"${escaped}"`;
}

interface ExecGitOptions {
  allowFailure?: boolean;
  ignoreStderr?: boolean;
  execOptions?: ChildProcessExecOptions;
}

interface ExecGitResult {
  stdout: string;
  stderr: string;
  success: boolean;
  error?: Error & { stdout?: string; stderr?: string; code?: number };
}

/**
 * Custom error class for Git execution failures.
 * Encapsulates the original error and provides direct access to stdout, stderr, and exit code.
 */
class GitExecutionError extends Error {
  /** The original error object, if available. */
  originalError?: Error & { stdout?: string; stderr?: string; code?: number };
  /** Standard output from the failed Git command. */
  stdout?: string;
  /** Standard error from the failed Git command. */
  stderr?: string;
  /** Exit code of the failed Git command. */
  code?: number;

  /**
   * Constructs a GitExecutionError.
   * @param {string} message - The error message.
   * @param {Error & { stdout?: string; stderr?: string; code?: number }} [originalError] - The original error from execAsync.
   */
  constructor(
    message: string,
    originalError?: Error & { stdout?: string; stderr?: string; code?: number },
  ) {
    super(message);
    this.name = 'GitExecutionError';
    if (originalError) {
      this.originalError = originalError;
      this.stdout = originalError.stdout?.trim();
      this.stderr = originalError.stderr?.trim();
      this.code = originalError.code;
    }
  }
}

/**
 * Executes a Git command asynchronously.
 * @async
 * @param {string} repoRoot - The root directory of the Git repository.
 * @param {string[]} args - An array of arguments for the Git command.
 * @param {ExecGitOptions} [options={}] - Options for execution, including whether to allow failure.
 * @returns {Promise<ExecGitResult>} A promise that resolves with the execution result.
 * @throws {GitExecutionError} If the command fails and `options.allowFailure` is not true.
 */
async function execGit(
  repoRoot: string,
  args: string[],
  options: ExecGitOptions = {},
): Promise<ExecGitResult> {
  const command = `git ${args.map(quoteForShell).join(' ')}`;
  const execOptions: ChildProcessExecOptions = {
    cwd: repoRoot,
    ...options.execOptions,
  };
  try {
    const { stdout, stderr } = await execAsync(command, execOptions);
    return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
  } catch (error: any) {
    if (options.allowFailure) {
      return {
        stdout: error.stdout ? error.stdout.trim() : '',
        stderr: error.stderr ? error.stderr.trim() : '',
        success: false,
        error: error as Error & {
          stdout?: string;
          stderr?: string;
          code?: number;
        },
      };
    }
    const errorMessage = `Error executing git command: ${command}\nRepo: ${repoRoot}\nExit Code: ${error.code}\nStdout: ${error.stdout ? error.stdout.trim() : 'N/A'}\nStderr: ${error.stderr ? error.stderr.trim() : 'N/A'}`;
    throw new GitExecutionError(errorMessage, error);
  }
}

interface HunkHeaderInfo {
  originalHeaderLine: string;
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
}

/**
 * Parses a patch content string and extracts information about each hunk.
 * @param {string | null | undefined} patchContent - The content of the patch file.
 * @returns {HunkHeaderInfo[]} An array of objects, each representing a hunk with its original header line and parsed line numbers/counts. Returns an empty array if patchContent is null, undefined, or empty.
 */
function parsePatchHunks(
  patchContent: string | null | undefined,
): HunkHeaderInfo[] {
  if (!patchContent) {
    return [];
  }
  const hunks: HunkHeaderInfo[] = [];
  const lines = patchContent.split('\n');
  const hunkHeaderRegex = /^@@ -(\d+)(,(\d+))? \+(\d+)(,(\d+))? @@/;

  for (const line of lines) {
    const match = line.match(hunkHeaderRegex);
    if (match) {
      const oldStart = parseInt(match[1], 10);
      const oldLines = match[3] !== undefined ? parseInt(match[3], 10) : 1;
      const newStart = parseInt(match[4], 10);
      const newLines = match[6] !== undefined ? parseInt(match[6], 10) : 1;

      hunks.push({
        originalHeaderLine: line,
        oldStart,
        oldLines,
        newStart,
        newLines,
      });
    }
  }
  return hunks;
}

/**
 * Helper function to embed a message as a Subject line into patch content.
 * @param diffBody The main body of the diff. Should be pre-cleaned (e.g., line endings normalized, trailing whitespace on lines removed).
 * @param message The message to embed.
 * @returns Patch content with the message embedded, or an empty string if the diffBody is effectively empty.
 */
function embedMessageInContent(
  diffBody: string,
  message: string | null,
): string {
  const trimmedDiffBody = diffBody.trim(); // Trim whitespace from the diff body

  // If there's a message, it takes precedence.
  // A patch/commit can exist with only a message and no actual code changes.
  if (message) {
    // Check if message is not null and not an empty string
    const subjectLine = `Subject: [PATCH] ${message}`;
    let content = subjectLine;

    // Append the trimmed diff body only if it's not empty
    if (trimmedDiffBody) {
      content += `\n\n${trimmedDiffBody}`;
    }

    // Ensure a final newline
    if (!content.endsWith('\n')) {
      content += '\n';
    }
    return content;
  }

  // If no message (null or empty string), return the trimmed diff body (if any) with a final newline,
  // or an empty string if the trimmed diff body is empty.
  if (trimmedDiffBody === '') {
    return '';
  }
  let content = trimmedDiffBody;
  if (!content.endsWith('\n')) {
    content += '\n';
  }
  return content;
}

/**
 * Helper function to get the actual diff body, stripping any existing Subject line.
 * @param patchFileContent The full content of the patch file.
 * @returns The diff body.
 */
function getActualDiffBody(patchFileContent: string): string {
  const lines = patchFileContent.split('\n');
  if (lines.length > 0 && lines[0].startsWith('Subject: [PATCH]')) {
    // Find the first blank line after the Subject line
    let firstBlankLineIndex = -1;
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '') {
        firstBlankLineIndex = i;
        break;
      }
    }
    // If a blank line is found and there's content after it, return that content
    if (firstBlankLineIndex !== -1 && firstBlankLineIndex + 1 < lines.length) {
      return lines.slice(firstBlankLineIndex + 1).join('\n');
    }
    // If no blank line is found after Subject, or no content after it, assume empty diff body
    return '';
  }
  return patchFileContent; // No Subject line, return the whole content
}

interface SimplifiedUpdatePatchOffsetsResult {
  outputPath: string;
}

/**
 * Updates the line number offsets in a given .taylored patch file.
 * This function performs a series of Git operations to re-calculate the diff
 * against a target branch (or 'main' by default) and then overwrites the
 * original patch file with the new diff.
 *
 * Workflow:
 * 1. Checks for uncommitted changes; throws an error if any exist.
 * 2. Verifies the existence of the patch file and the base branch.
 * 3. Saves the current Git branch/commit.
 * 4. Creates a temporary branch.
 * 5. Tries to apply the patch in reverse (remove), then attempts to apply it normally (add) if removal fails.
 * This step aims to get the codebase to a state *before* the patch was applied, or *with* the patch applied,
 * to correctly generate the forward diff later.
 * 6. If the apply/remove step is successful, stages all changes and creates a temporary commit.
 * 7. Generates a `git diff` between the specified `baseBranch` and the current `HEAD` of the temporary branch.
 * 8. Extracts the original commit message from the input patch file, if present.
 * 9. Compares hunks of the original patch and the new diff. If all hunks appear "inverted"
 * (meaning the new diff looks like the reverse of the original patch, which can happen
 * if the initial apply/remove logic resulted in the patch's effects being *added* to the
 * temporary branch instead of *removed*), it uses the body of the *original* patch content
 * for the final output, but with the (potentially new) embedded message. Otherwise, it uses the new diff content.
 *10. Writes the resulting content (either the adjusted original patch body or the new diff body,
 * with the embedded message) back to the original patch file, but only if the content has changed.
 *11. Cleans up by checking out the original branch/commit and deleting the temporary branch.
 *
 * @async
 * @param {string} patchFileName - The name of the .taylored file (e.g., "myfeature.taylored")
 * located in the .taylored/ directory.
 * @param {string} repoRoot - The absolute path to the root of the Git repository.
 * @param {string} [_customCommitMessage] - This parameter is ignored. The commit message is
 * extracted from the patch file itself if present.
 * @param {string} [branchName] - Optional. The name of the branch to diff against.
 * Defaults to 'main'.
 * @returns {Promise<SimplifiedUpdatePatchOffsetsResult>} A promise that resolves with an object
 * containing the `outputPath` of the updated patch file.
 * @throws {Error} If the repository has uncommitted changes, the patch file or base branch
 * doesn't exist, Git operations fail, or the patch cannot be processed.
 */
async function updatePatchOffsets(
  patchFileName: string,
  repoRoot: string,
  _customCommitMessage?: string, // Parameter kept for signature compatibility if called elsewhere, but ignored.
  branchName?: string,
): Promise<SimplifiedUpdatePatchOffsetsResult> {
  const baseBranch = branchName || 'main'; // Use the provided branchName or 'main' as default

  const statusResult = await execGit(repoRoot, ['status', '--porcelain']);
  if (statusResult.stdout.trim() !== '') {
    throw new Error(
      'CRITICAL ERROR: Uncommitted changes detected in the repository. Please commit or stash them before running --offset.\n' +
        statusResult.stdout,
    );
  }
  const absolutePatchFilePath = path.join(
    repoRoot,
    TAYLORED_DIR_NAME,
    patchFileName,
  );

  if (
    !fs.existsSync(absolutePatchFilePath) ||
    !fs.statSync(absolutePatchFilePath).isFile()
  ) {
    throw new Error(
      `Patch file '${absolutePatchFilePath}' not found or is not a file.`,
    );
  }

  const baseBranchExistsResult = await execGit(
    repoRoot,
    ['rev-parse', '--verify', baseBranch],
    { allowFailure: true, ignoreStderr: true },
  );
  if (!baseBranchExistsResult.success) {
    throw new GitExecutionError(
      `CRITICAL ERROR: The base branch '${baseBranch}' does not exist in the repository. Cannot calculate diff against '${baseBranch}'.`,
      baseBranchExistsResult.error,
    );
  }

  let originalBranchOrCommit: string = '';
  try {
    const symbolicRefResult = await execGit(
      repoRoot,
      ['symbolic-ref', '--short', 'HEAD'],
      { allowFailure: true, ignoreStderr: true },
    );
    if (symbolicRefResult.success && symbolicRefResult.stdout) {
      originalBranchOrCommit = symbolicRefResult.stdout;
    } else {
      originalBranchOrCommit = (await execGit(repoRoot, ['rev-parse', 'HEAD']))
        .stdout;
    }
    if (!originalBranchOrCommit) {
      throw new Error('Could not determine the current branch or commit.');
    }
  } catch (e: any) {
    throw new GitExecutionError(
      `Failed to determine current branch/commit: ${e.message}`,
      e,
    );
  }

  const tempBranchName = `temp/offset-automation-${Date.now()}`;
  let operationSucceeded = false;
  let cliEquivalentCallSucceeded = false;
  let finalOutputContentToWrite: string | null = null; // --- MODIFICA 1: Variabile per memorizzare il contenuto

  try {
    await execGit(repoRoot, [
      'checkout',
      '-b',
      tempBranchName,
      originalBranchOrCommit,
      '--quiet',
    ]);

    try {
      await handleApplyOperation(
        patchFileName,
        false,
        true,
        '--remove (invoked by offset)',
        repoRoot,
      );
      cliEquivalentCallSucceeded = true;
    } catch (removeError: any) {
      try {
        await handleApplyOperation(
          patchFileName,
          false,
          false,
          '--add (invoked by offset, after remove failed)',
          repoRoot,
        );
        cliEquivalentCallSucceeded = true;
      } catch (addError: any) {
        cliEquivalentCallSucceeded = false;
      }
    }

    if (cliEquivalentCallSucceeded) {
      await execGit(repoRoot, ['add', '.']);

      const tempCommitMessageText =
        'Internal: Staged changes for offset update';
      await execGit(repoRoot, [
        'commit',
        '--allow-empty',
        '-m',
        tempCommitMessageText,
        '--quiet',
      ]);

      const tayloredDirPath = path.join(repoRoot, TAYLORED_DIR_NAME);
      await fs.ensureDir(tayloredDirPath);

      const diffCmdResult = await execGit(
        repoRoot,
        ['diff', baseBranch, 'HEAD'],
        { allowFailure: true },
      );

      const originalPatchContent = await fs.readFile(
        absolutePatchFilePath,
        'utf-8',
      );
      const rawNewDiffContent = diffCmdResult.stdout || '';
      const effectiveMessageToEmbed: string | null =
        extractMessageFromPatch(originalPatchContent);

      if (
        diffCmdResult.error &&
        diffCmdResult.error.code !== 0 &&
        diffCmdResult.error.code !== 1
      ) {
        console.error(
          `ERROR: Execution of 'git diff ${baseBranch} HEAD' command failed with an unexpected exit code ${diffCmdResult.error.code} on the temporary branch.`,
        );
        if (diffCmdResult.stderr)
          console.error(`  Stderr: ${diffCmdResult.stderr}`);
      } else {
        const originalHunks = parsePatchHunks(originalPatchContent);
        const newHunks = parsePatchHunks(rawNewDiffContent);

        let allHunksAreConsideredInverted = false;
        if (
          originalHunks.length > 0 &&
          originalHunks.length === newHunks.length
        ) {
          let numInvertedHunks = 0;
          for (let i = 0; i < originalHunks.length; i++) {
            const origHunk = originalHunks[i];
            const newHunk = newHunks[i];
            if (
              newHunk.oldStart === origHunk.newStart &&
              newHunk.oldLines === origHunk.newLines &&
              newHunk.newStart === origHunk.oldStart &&
              newHunk.newLines === origHunk.oldLines &&
              origHunk.oldLines !== origHunk.newLines
            ) {
              numInvertedHunks++;
            }
          }
          if (
            numInvertedHunks > 0 &&
            numInvertedHunks === originalHunks.length
          ) {
            allHunksAreConsideredInverted = true;
          }
        }

        const cleanedDiffContent = rawNewDiffContent
          .split('\n')
          .map((line) => line.trimEnd())
          .join('\n');

        if (allHunksAreConsideredInverted) {
          const bodyOfOriginalPatch = getActualDiffBody(originalPatchContent);
          finalOutputContentToWrite = embedMessageInContent(
            bodyOfOriginalPatch,
            effectiveMessageToEmbed,
          );
        } else {
          finalOutputContentToWrite = embedMessageInContent(
            cleanedDiffContent,
            effectiveMessageToEmbed,
          );
        }

        operationSucceeded = true;
      }
    } else {
      console.error(
        `ERROR: Preliminary internal apply/remove operations for '${patchFileName}' failed on the temporary branch.`,
      );
    }
  } catch (error: any) {
    console.error(
      `CRITICAL ERROR during offset update process: ${error.message}`,
    );
    if (error instanceof GitExecutionError && error.stderr) {
      console.error(`Git STDERR: ${error.stderr}`);
    }
    operationSucceeded = false;
  } finally {
    try {
      await execGit(repoRoot, [
        'checkout',
        '--force',
        originalBranchOrCommit,
        '--quiet',
      ]);

      const tempBranchExistsResult = await execGit(
        repoRoot,
        ['rev-parse', '--verify', tempBranchName],
        { allowFailure: true, ignoreStderr: true },
      );
      if (tempBranchExistsResult.success) {
        await execGit(repoRoot, ['branch', '-D', tempBranchName, '--quiet']);
      }
    } catch (cleanupErr: any) {
      console.warn(
        `Warning: Failed to cleanup temporary branch: ${cleanupErr.message}`,
      );
    }
  }

  if (operationSucceeded && finalOutputContentToWrite !== null) {
    try {
      await fs.writeFile(absolutePatchFilePath, finalOutputContentToWrite);
      console.log(`Successfully updated patch file: ${patchFileName}`);
    } catch (writeError: any) {
      // Se la scrittura fallisce qui, l'utente vedrà un errore ma il repository sarà già pulito.
      throw new Error(
        `Failed to write updated patch content to ${absolutePatchFilePath}. Error: ${writeError.message}`,
      );
    }
  } else if (!operationSucceeded) {
    throw new Error(
      `WARNING: The taylored file '${patchFileName}' is obsolete or could not be processed for offset update.`,
    );
  }

  return { outputPath: absolutePatchFilePath };
}

export {
  updatePatchOffsets,
  parsePatchHunks,
  quoteForShell,
  GitExecutionError,
};

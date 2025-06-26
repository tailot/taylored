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
 * This is important to prevent command injection vulnerabilities if arguments
 * might contain spaces or special shell characters.
 * @param {string} arg - The argument string to quote.
 * @returns {string} The quoted argument, suitable for inclusion in a shell command.
 *                   If the argument contains no special characters, it's returned as is.
 */
function quoteForShell(arg: string): string {
    if (!/[ \t\n\r"'();&|<>*?#~=%\\]/.test(arg)) {
        return arg;
    }
    // Escapes backslashes, double quotes, backticks, and dollar signs.
    // Then wraps the whole string in double quotes.
    const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `"${escaped}"`;
}

/**
 * Options for executing a Git command via `execGit`.
 */
interface ExecGitOptions {
    /** If true, `execGit` will not throw an error if the Git command fails (exits non-zero).
     *  Instead, it will return a result object with `success: false` and error details.
     *  Defaults to false (throws on failure). */
    allowFailure?: boolean;
    /** If true, standard error output from the Git command will be ignored when determining
     *  whether to throw an error. This can be useful for Git commands that write informational
     *  messages to stderr even on success. Defaults to false. */
    ignoreStderr?: boolean; // This property was not actively used in the original execGit logic for throwing decisions.
    /** Additional options to pass directly to `child_process.exec`. */
    execOptions?: ChildProcessExecOptions;
}

/**
 * The result of executing a Git command via `execGit`.
 */
interface ExecGitResult {
    /** The standard output from the Git command, trimmed of whitespace. */
    stdout: string;
    /** The standard error output from the Git command, trimmed of whitespace. */
    stderr: string;
    /** True if the Git command exited with a status code of 0, false otherwise. */
    success: boolean;
    /** If the command failed (`success: false`) and `allowFailure` was true, this contains
     *  the original error object from `child_process.exec`. */
    error?: Error & { stdout?: string; stderr?: string; code?: number };
}

/**
 * Custom error class for errors specifically arising from Git command executions.
 * It extends the base `Error` class and includes additional properties like
 * `stdout`, `stderr`, and the exit `code` from the failed Git command.
 */
class GitExecutionError extends Error {
    /** The original error object from `child_process.exec`, if available. */
    originalError?: Error & { stdout?: string; stderr?: string; code?: number };
    /** Standard output from the failed Git command. */
    stdout?: string;
    /** Standard error from the failed Git command. */
    stderr?: string;
    /** Exit code of the failed Git command. */
    code?: number;

    /**
     * Creates an instance of GitExecutionError.
     * @param {string} message - The primary error message.
     * @param {Error & { stdout?: string; stderr?: string; code?: number }} [originalError] - The underlying
     *        error from `child_process.exec`, containing stdout, stderr, and exit code.
     */
    constructor(message: string, originalError?: Error & { stdout?: string; stderr?: string; code?: number }) {
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
 * Asynchronously executes a Git command.
 * @async
 * @function execGit
 * @param {string} repoRoot - The absolute path to the root of the Git repository.
 *                            The command will be executed within this directory.
 * @param {string[]} args - An array of strings representing the arguments for the Git command
 *                          (e.g., `['status', '--porcelain']`).
 * @param {ExecGitOptions} [options={}] - Optional parameters for execution.
 * @returns {Promise<ExecGitResult>} A promise that resolves with an `ExecGitResult` object.
 * @throws {GitExecutionError} If the Git command fails (exits non-zero) and `options.allowFailure` is not true.
 */
async function execGit(repoRoot: string, args: string[], options: ExecGitOptions = {}): Promise<ExecGitResult> {
    const command = `git ${args.map(quoteForShell).join(' ')}`;
    const execOptions: ChildProcessExecOptions = { cwd: repoRoot, ...options.execOptions };
    try {
        const { stdout, stderr } = await execAsync(command, execOptions);
        return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
    } catch (error: any) {
        if (options.allowFailure) {
            return {
                stdout: error.stdout ? error.stdout.trim() : '',
                stderr: error.stderr ? error.stderr.trim() : '',
                success: false,
                error: error as Error & { stdout?: string; stderr?: string; code?: number }
            };
        }
        const errorMessage = `Error executing git command: ${command}\nRepo: ${repoRoot}\nExit Code: ${error.code}\nStdout: ${error.stdout ? error.stdout.trim() : 'N/A'}\nStderr: ${error.stderr ? error.stderr.trim() : 'N/A'}`;
        throw new GitExecutionError(errorMessage, error);
    }
}

/**
 * Information extracted from a patch hunk header.
 * Example hunk header: `@@ -1,5 +1,7 @@`
 */
interface HunkHeaderInfo {
    /** The original full hunk header line (e.g., "@@ -1,5 +1,7 @@"). */
    originalHeaderLine: string;
    /** The starting line number in the old file. */
    oldStart: number;
    /** The number of lines affected in the old file. Defaults to 1 if not specified. */
    oldLines: number;
    /** The starting line number in the new file. */
    newStart: number;
    /** The number of lines affected in the new file. Defaults to 1 if not specified. */
    newLines: number;
}

/**
 * Parses the content of a patch file and extracts information from all hunk headers.
 * @function parsePatchHunks
 * @param {(string | null | undefined)} patchContent - The string content of the patch file.
 *                                                    If null or undefined, an empty array is returned.
 * @returns {HunkHeaderInfo[]} An array of `HunkHeaderInfo` objects, one for each hunk found in the patch.
 *                             Returns an empty array if no hunks are found or if `patchContent` is empty.
 */
function parsePatchHunks(patchContent: string | null | undefined): HunkHeaderInfo[] {
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
            const oldLines = match[3] !== undefined ? parseInt(match[3], 10) : 1; // Default to 1 if count is omitted
            const newStart = parseInt(match[4], 10);
            const newLines = match[6] !== undefined ? parseInt(match[6], 10) : 1; // Default to 1 if count is omitted

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
 * Helper function to embed a message as a Git patch Subject line into the patch content.
 * If a message is provided, it's formatted as "Subject: [PATCH] message" and prepended
 * to the diff body, separated by a blank line.
 *
 * @param {string} diffBody - The main body of the diff. It should ideally be pre-cleaned
 *                            (e.g., line endings normalized, trailing whitespace on lines removed).
 * @param {(string | null)} message - The message to embed as the subject. If null or an empty string,
 *                                   no Subject line is added, and only the diffBody (if any) is returned.
 * @returns {string} Patch content with the message embedded as a Subject line,
 *                   or just the (cleaned) diff body if no message is provided,
 *                   or an empty string if both `diffBody` and `message` are effectively empty.
 *                   Ensures a final newline character if content is present.
 */
function embedMessageInContent(diffBody: string, message: string | null): string {
    const trimmedDiffBody = diffBody.trim();

    if (message && message.trim()) { // Check if message is not null and not just whitespace
        const subjectLine = `Subject: [PATCH] ${message.trim()}`;
        let content = subjectLine;

        if (trimmedDiffBody) {
            content += `\n\n${trimmedDiffBody}`;
        }

        if (!content.endsWith('\n')) {
            content += '\n';
        }
        return content;
    }

    if (trimmedDiffBody === "") {
        return "";
    }
    let content = trimmedDiffBody;
    if (!content.endsWith('\n')) {
        content += '\n';
    }
    return content;
}

/**
 * Helper function to extract the actual diff body from a patch file's content,
 * stripping any existing "Subject: [PATCH]" line and the subsequent blank line.
 * @param {string} patchFileContent - The full string content of the patch file.
 * @returns {string} The diff body. If no Subject line is found, the original
 *                   `patchFileContent` is returned. If a Subject line is found but
 *                   there's no content after it and the separating blank line,
 *                   an empty string is returned.
 */
function getActualDiffBody(patchFileContent: string): string {
    const lines = patchFileContent.split('\n');
    if (lines.length > 0 && lines[0].startsWith('Subject: [PATCH]')) {
        let firstBlankLineIndex = -1;
        for (let i = 1; i < lines.length; i++) {
            if (lines[i].trim() === '') {
                firstBlankLineIndex = i;
                break;
            }
        }
        if (firstBlankLineIndex !== -1 && firstBlankLineIndex + 1 < lines.length) {
            return lines.slice(firstBlankLineIndex + 1).join('\n');
        }
        return ""; // Subject line found, but no content after it or no separating blank line.
    }
    return patchFileContent;
}

/**
 * Result object for the `updatePatchOffsets` function.
 */
interface SimplifiedUpdatePatchOffsetsResult {
    /** The absolute path to the updated (or original, if no changes were made) patch file. */
    outputPath: string;
}

/**
 * Updates the line number offsets in a given `.taylored` patch file.
 * This function is designed to regenerate a patch file by calculating a new diff
 * between a temporary state (where the patch is applied/unapplied) and a specified base branch.
 * This is useful when the underlying code has changed, and the original patch
 * no longer applies cleanly due to shifted line numbers.
 *
 * The process involves:
 * 1. Checking for uncommitted changes in the repository (fails if any exist).
 * 2. Verifying the existence of the patch file and the base branch.
 * 3. Recording the current branch/commit.
 * 4. Creating a temporary branch from the current branch/commit.
 * 5. Attempting to unapply (`git apply -R`) the patch. If this fails, it attempts to apply it.
 *    This step aims to reach a state representing the code *without* the patch's changes,
 *    relative to the temporary branch's starting point.
 * 6. Committing the changes (or lack thereof, if the apply/unapply failed gracefully or did nothing)
 *    on the temporary branch. This commit represents the state to be diffed against the base branch.
 * 7. Calculating the diff between the `baseBranch` and the `HEAD` of the temporary branch.
 * 8. Reconstructing the patch content using this new diff. The original commit message
 *    (Subject line) from the patch is preserved.
 * 9. Overwriting the original patch file with the new content if it has changed.
 * 10. Cleaning up by checking out the original branch/commit and deleting the temporary branch.
 *
 * Note: The `_customCommitMessage` parameter is ignored as the function now always
 * attempts to preserve the original patch's message.
 *
 * @async
 * @function updatePatchOffsets
 * @param {string} patchFileName - The name of the `.taylored` patch file (e.g., "myfeature.taylored").
 * @param {string} repoRoot - The absolute path to the root of the Git repository.
 * @param {string} [_customCommitMessage] - Ignored. Kept for signature compatibility.
 * @param {string} [branchName='main'] - The name of the base branch to diff against. Defaults to 'main'.
 * @returns {Promise<SimplifiedUpdatePatchOffsetsResult>} A promise that resolves with an object
 *          containing the `outputPath` of the processed patch file.
 * @throws {Error} If uncommitted changes are present, the patch file or base branch is not found,
 *                 or if a critical error occurs during the Git operations or file system interactions.
 *                 Specifically throws a `GitExecutionError` for Git-related failures.
 *                 Also throws an error if the patch is deemed "obsolete" or could not be processed,
 *                 indicated by `operationSucceeded` being false at the end.
 */
async function updatePatchOffsets(
    patchFileName: string,
    repoRoot: string,
    _customCommitMessage?: string, // Parameter kept for signature compatibility if called elsewhere, but ignored.
    branchName?: string
): Promise<SimplifiedUpdatePatchOffsetsResult> {
    const baseBranch = branchName || 'main';

    const statusResult = await execGit(repoRoot, ['status', '--porcelain']);
    if (statusResult.stdout.trim() !== '') {
        throw new Error("CRITICAL ERROR: Uncommitted changes detected in the repository. Please commit or stash them before running --offset.\n" + statusResult.stdout);
    }
    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    if (!fs.existsSync(absolutePatchFilePath) || !fs.statSync(absolutePatchFilePath).isFile()) {
        throw new Error(`Patch file '${absolutePatchFilePath}' not found or is not a file.`);
    }
    
    const baseBranchExistsResult = await execGit(repoRoot, ['rev-parse', '--verify', baseBranch], { allowFailure: true, ignoreStderr: true });
    if (!baseBranchExistsResult.success) {
        throw new GitExecutionError(`CRITICAL ERROR: The base branch '${baseBranch}' does not exist in the repository. Cannot calculate diff against '${baseBranch}'.`, baseBranchExistsResult.error);
    }

    let originalBranchOrCommit: string = '';
    try {
        const symbolicRefResult = await execGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true, ignoreStderr: true });
        if (symbolicRefResult.success && symbolicRefResult.stdout) {
            originalBranchOrCommit = symbolicRefResult.stdout;
        } else {
            originalBranchOrCommit = (await execGit(repoRoot, ['rev-parse', 'HEAD'])).stdout;
        }
        if (!originalBranchOrCommit) {
            throw new Error("Could not determine the current branch or commit.");
        }
    } catch (e: any) {
        throw new GitExecutionError(`Failed to determine current branch/commit: ${e.message}`, e);
    }

    const tempBranchName = `temp/offset-automation-${Date.now()}`;
    let operationSucceeded = false;
    let cliEquivalentCallSucceeded = false;

    try {
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, originalBranchOrCommit, '--quiet']);

        try {
            await handleApplyOperation(patchFileName, false, true, '--remove (invoked by offset)', repoRoot);
            cliEquivalentCallSucceeded = true;
        } catch (removeError: any) {
            // Error during initial 'remove' attempt.
            // The original code had an empty if block here.
            // Now, attempting 'add' as a fallback.
            try {
                await handleApplyOperation(patchFileName, false, false, '--add (invoked by offset, after remove failed)', repoRoot);
                cliEquivalentCallSucceeded = true;
            } catch (addError: any) {
                // Error during fallback 'add' attempt.
                // The original code had an empty if block here.
                cliEquivalentCallSucceeded = false;
            }
        }

        if (cliEquivalentCallSucceeded) {
            await execGit(repoRoot, ['add', '.']);

            const tempCommitMessageText = "Internal: Staged changes for offset update";
            await execGit(repoRoot, ['commit', '--allow-empty', '-m', tempCommitMessageText, '--quiet']);

            const tayloredDirPath = path.join(repoRoot, TAYLORED_DIR_NAME);
            await fs.ensureDir(tayloredDirPath);

            const diffCmdResult = await execGit(repoRoot, ['diff', baseBranch, 'HEAD'], { allowFailure: true });

            const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
            const rawNewDiffContent = diffCmdResult.stdout || "";

            // Custom commit message is no longer supported for --offset.
            // Always extract from the original patch if present.
            const effectiveMessageToEmbed: string | null = extractMessageFromPatch(originalPatchContent);

            if (diffCmdResult.error && diffCmdResult.error.code !== 0 && diffCmdResult.error.code !== 1) {
                console.error(`ERROR: Execution of 'git diff ${baseBranch} HEAD' command failed with an unexpected exit code ${diffCmdResult.error.code} on the temporary branch.`);
                if (diffCmdResult.stderr) console.error(`  Stderr: ${diffCmdResult.stderr}`);
            } else {
                const originalHunks = parsePatchHunks(originalPatchContent);
                const newHunks = parsePatchHunks(rawNewDiffContent);

                let allHunksAreConsideredInverted = false;
                if (originalHunks.length > 0 && originalHunks.length === newHunks.length) {
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
                    if (numInvertedHunks > 0 && numInvertedHunks === originalHunks.length) {
                        allHunksAreConsideredInverted = true;
                    }
                }

                let finalOutputContentToWrite: string;
                const cleanedDiffContent = rawNewDiffContent.split('\n').map(line => line.trimEnd()).join('\n');

                if (allHunksAreConsideredInverted) {
                    const bodyOfOriginalPatch = getActualDiffBody(originalPatchContent);
                    finalOutputContentToWrite = embedMessageInContent(bodyOfOriginalPatch, effectiveMessageToEmbed);
                } else {
                    // The original code had an empty 'if' block here checking for
                    // mismatched hunk lengths under certain conditions.
                    // This condition (originalHunks.length !== newHunks.length etc.)
                    // didn't change the program flow as the block was empty.
                    // If specific handling for this case is needed, it would be added here.
                    finalOutputContentToWrite = embedMessageInContent(cleanedDiffContent, effectiveMessageToEmbed);
                }

                // Refined write condition
                if (finalOutputContentToWrite === originalPatchContent) {
                    // Content is identical, no need to write the file.
                    // Original code had an empty 'if' branch here.
                } else {
                    await fs.writeFile(absolutePatchFilePath, finalOutputContentToWrite);
                }
                operationSucceeded = true;
            }
        } else { 
            console.error(`ERROR: Preliminary internal apply/remove operations for '${patchFileName}' failed on the temporary branch.`);
        }

    } catch (error: any) {
        console.error(`CRITICAL ERROR during offset update process: ${error.message}`);
        if (error instanceof GitExecutionError && error.stderr) {
            console.error(`Git STDERR: ${error.stderr}`);
        }
        operationSucceeded = false;
    } finally {
        try {
            await execGit(repoRoot, ['checkout', '--force', originalBranchOrCommit, '--quiet']);

            const tempBranchExistsResult = await execGit(repoRoot, ['rev-parse', '--verify', tempBranchName], { allowFailure: true, ignoreStderr: true });
            if (tempBranchExistsResult.success) {
                await execGit(repoRoot, ['branch', '-D', tempBranchName, '--quiet']);
            }
        } catch (cleanupErr: any) {
            // Errors during cleanup are logged to console.error by default by execGit if not caught.
            // However, this catch block was empty, meaning cleanup errors were intentionally suppressed.
            // Consider if logging `cleanupErr.message` is appropriate here if issues arise.
            // For now, maintaining the behavior of suppressing cleanup errors.
        }
    }

    if (!operationSucceeded) {
        throw new Error(`WARNING: The taylored file '${patchFileName}' is obsolete or could not be processed for offset update.`);
    }

    return { outputPath: absolutePatchFilePath };
}

export { updatePatchOffsets, parsePatchHunks, quoteForShell, GitExecutionError };

// lib/git-patch-offset-updater.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, ExecOptions as ChildProcessExecOptions } from 'child_process';
import * as util from 'util';
import { handleApplyOperation } from './apply-logic';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './constants';
import { extractMessageFromPatch } from './utils';

const execAsync = util.promisify(exec);

/**
 * Quotes an argument for safe use in a shell command string.
 */
function quoteForShell(arg: string): string {
    if (!/[ \t\n\r"'();&|<>*?#~=%\\]/.test(arg)) {
        return arg;
    }
    const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
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

class GitExecutionError extends Error {
    originalError?: Error & { stdout?: string; stderr?: string; code?: number };
    stdout?: string;
    stderr?: string;
    code?: number;

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

interface HunkHeaderInfo {
    originalHeaderLine: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
}

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
function embedMessageInContent(diffBody: string, message: string | null): string {
    const trimmedDiffBody = diffBody.trim();

    if (trimmedDiffBody === "") {
        return ""; 
    }

    let contentWithPotentialMessage = diffBody;

    if (message) { 
        const subjectLine = `Subject: [PATCH] ${message}`;
        contentWithPotentialMessage = `${subjectLine}\n\n${diffBody}`;
    }

    if (contentWithPotentialMessage !== "" && !contentWithPotentialMessage.endsWith('\n')) {
        contentWithPotentialMessage += '\n';
    }
    return contentWithPotentialMessage;
}

/**
 * Helper function to get the actual diff body, stripping any existing Subject line.
 * @param patchFileContent The full content of the patch file.
 * @returns The diff body.
 */
function getActualDiffBody(patchFileContent: string): string {
    const lines = patchFileContent.split('\n');
    if (lines.length > 0 && lines[0].startsWith('Subject: [PATCH]')) {
        if (lines.length > 1 && lines[1] === '') { 
            return lines.slice(2).join('\n'); 
        }
        return ""; 
    }
    return patchFileContent; 
}


interface SimplifiedUpdatePatchOffsetsResult {
    outputPath: string;
}

async function updatePatchOffsets(
    patchFileName: string,
    repoRoot: string,
    customCommitMessage?: string
): Promise<SimplifiedUpdatePatchOffsetsResult> {
    const statusResult = await execGit(repoRoot, ['status', '--porcelain']);
    if (statusResult.stdout.trim() !== '') {
        throw new Error("CRITICAL ERROR: Uncommitted changes detected in the repository. Please commit or stash them before running --offset.\n" + statusResult.stdout);
    }

    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    if (!fs.existsSync(absolutePatchFilePath) || !fs.statSync(absolutePatchFilePath).isFile()) {
        throw new Error(`Patch file '${absolutePatchFilePath}' not found or is not a file.`);
    }

    const mainBranchExistsResult = await execGit(repoRoot, ['rev-parse', '--verify', 'main'], { allowFailure: true, ignoreStderr: true });
    if (!mainBranchExistsResult.success) {
        throw new GitExecutionError("CRITICAL ERROR: The 'main' branch does not exist in the repository. Cannot calculate diff against 'main'.", mainBranchExistsResult.error);
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
            if (removeError.message) {
            }

            try {
                await handleApplyOperation(patchFileName, false, false, '--add (invoked by offset, after remove failed)', repoRoot);
                cliEquivalentCallSucceeded = true;
            } catch (addError: any) {
                if (addError.message) {
                }
                cliEquivalentCallSucceeded = false;
            }
        }

        if (cliEquivalentCallSucceeded) {
            await execGit(repoRoot, ['add', '.']);

            const tempCommitMessageText = "Internal: Staged changes for offset update";
            await execGit(repoRoot, ['commit', '--allow-empty', '-m', tempCommitMessageText, '--quiet']);

            const tayloredDirPath = path.join(repoRoot, TAYLORED_DIR_NAME);
            await fs.ensureDir(tayloredDirPath);

            const diffCmdResult = await execGit(repoRoot, ['diff', 'main', 'HEAD'], { allowFailure: true });

            const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
            const rawNewDiffContent = diffCmdResult.stdout || "";

            let effectiveMessageToEmbed: string | null = null;
            if (customCommitMessage) {
                effectiveMessageToEmbed = customCommitMessage;
            } else {
                effectiveMessageToEmbed = extractMessageFromPatch(originalPatchContent);
            }

            if (diffCmdResult.error && diffCmdResult.error.code !== 0 && diffCmdResult.error.code !== 1) {
                console.error(`ERROR: Execution of 'git diff main HEAD' command failed with an unexpected exit code ${diffCmdResult.error.code} on the temporary branch.`);
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
                    if (originalHunks.length !== newHunks.length && !(originalHunks.length === 0 && newHunks.length > 0) && !(originalHunks.length > 0 && newHunks.length === 0) ) {
                    }
                    finalOutputContentToWrite = embedMessageInContent(cleanedDiffContent, effectiveMessageToEmbed);
                }

                // Refined write condition
                if (finalOutputContentToWrite === originalPatchContent) {
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
        }
    }

    if (!operationSucceeded) {
        throw new Error(`WARNING: The taylored file '${patchFileName}' is obsolete or could not be processed for offset update.`);
    }

    return { outputPath: absolutePatchFilePath };
}

export { updatePatchOffsets, parsePatchHunks, quoteForShell, GitExecutionError };

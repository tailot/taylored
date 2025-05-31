// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, ExecOptions as ChildProcessExecOptions } from 'child_process';
import * as util from 'util';
import * as os from 'os';
import * as parseDiffModule from 'parse-diff';

const execAsync = util.promisify(exec);

/**
 * Quotes an argument for safe use in a shell command string.
 * If the argument contains spaces or special shell characters, it will be double-quoted,
 * with internal backslashes and double-quotes escaped.
 * @param arg - The argument string to quote.
 * @returns The quoted argument string.
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

/**
 * Executes a Git command asynchronously.
 * @param repoRoot - The root directory of the Git repository.
 * @param args - Arguments for the git command.
 * @param options - Options for execution.
 * @returns Promise<{stdout: string, stderr: string, success: boolean, error?: Error}>
 */
async function execGit(repoRoot: string, args: string[], options: ExecGitOptions = {}): Promise<ExecGitResult> {
    const command = `git ${args.map(quoteForShell).join(' ')}`;
    const execOptions: ChildProcessExecOptions = { cwd: repoRoot, ...options.execOptions };
    try {
        const { stdout, stderr } = await execAsync(command, execOptions);
        if (stderr && !options.ignoreStderr && stderr.trim() !== "") {
            console.warn(`Git command stderr for "${command}":\n${stderr.trim()}`);
        }
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
        const errorMessage = `Error executing git command: ${command}\nRepo: ${repoRoot}\nExit Code: ${error.code}\nStdout: ${error.stdout ? error.stdout.trim() : ''}\nStderr: ${error.stderr ? error.stderr.trim() : ''}`;
        throw new GitExecutionError(errorMessage, error);
    }
}

/**
 * Extracts the commit message (Subject line) from patch content.
 * @param patchContent - The content of the patch file.
 * @returns The extracted commit message or null if not found.
 */
function extractMessageFromPatch(patchContent: string | null | undefined): string | null {
    if (!patchContent || typeof patchContent !== 'string') {
        return null;
    }
    const lines = patchContent.split('\n');
    for (const line of lines) {
        if (line.startsWith('Subject:')) {
            let message = line.substring('Subject:'.length).trim();
            message = message.replace(/^\[PATCH(?:\s+\d+\/\d+)?\]\s*/, '');
            if (message) {
                return message;
            }
        }
    }

    let inHeader = true;
    const potentialMessageLines: string[] = [];
    let foundDiff = false;

    const commonHeaderPatterns: RegExp[] = [
        /^From[:\s]/i,
        /^Date[:\s]/i,
        /^Subject[:\s]/i,
        /^Signed-off-by:/i,
        /^Cc:/i,
        /^Reported-by:/i,
        /^Acked-by:/i,
        /^Reviewed-by:/i,
        /^Fixes:/i,
        /^Link:/i,
        /^[a-zA-Z0-9-]+:/
    ];

    for (const line of lines) {
        if (line.startsWith('---')) {
            inHeader = false;
            continue;
        }
        if (line.startsWith('diff --git')) {
            foundDiff = true;
            break;
        }
        if (!inHeader && !foundDiff && line.trim() !== '') {
            const trimmedLine = line.trim();
            let isHeader = false;
            for (const pattern of commonHeaderPatterns) {
                if (pattern.test(trimmedLine)) {
                    isHeader = true;
                    break;
                }
            }
            if (!isHeader) {
                if (potentialMessageLines.length < 10) {
                    potentialMessageLines.push(trimmedLine);
                }
            }
        }
    }

    if (potentialMessageLines.length > 0) {
        for (const pLine of potentialMessageLines) {
            const colonIndex = pLine.indexOf(':');
            if (colonIndex === -1 || colonIndex > 30) {
                return pLine;
            }
        }
        return potentialMessageLines[0];
    }

    return null;
}

interface UpdatePatchOffsetsResult {
    outputPath: string;
    operationType: "forwards" | "backwards (revert)" | "empty (fallback post -R no diff)" | "empty (fallback post -R failed)" | "unknown";
    patchGeneratedNonEmpty: boolean;
}

/**
 * Updates the offsets of a specified patch file to apply cleanly against
 * the current state of the target Git repository.
 * @param patchFilePathArg - Path to the patch file.
 * @param repositoryPathArg - Optional path to the Git repository.
 * @param customCommitMessage - Optional custom commit message for temporary commits.
 * @returns Promise object representing operation result.
 */
async function updatePatchOffsets(
    patchFilePathArg: string,
    repositoryPathArg?: string,
    customCommitMessage?: string
): Promise<UpdatePatchOffsetsResult> {
    if (!patchFilePathArg) {
        throw new Error("Patch file path argument is required.");
    }

    const currentInvocationDir = process.cwd();
    let absolutePatchFilePath = path.resolve(currentInvocationDir, patchFilePathArg);

    try {
        absolutePatchFilePath = fs.realpathSync(absolutePatchFilePath);
    } catch (e: any) {
        throw new Error(`Patch file '${absolutePatchFilePath}' (resolved from '${patchFilePathArg}') not found or inaccessible: ${e.message}`);
    }

    if (!fs.existsSync(absolutePatchFilePath) || !fs.statSync(absolutePatchFilePath).isFile()) {
        throw new Error(`Patch file '${absolutePatchFilePath}' (resolved from '${patchFilePathArg}') not found or is not a file.`);
    }

    let repoRoot: string;
    const gitArgsForRepoRoot = ['rev-parse', '--show-toplevel'];
    if (repositoryPathArg) {
        const absoluteRepoPath = path.resolve(currentInvocationDir, repositoryPathArg);
        if (!fs.existsSync(absoluteRepoPath) || !fs.statSync(absoluteRepoPath).isDirectory()) {
            throw new Error(`Specified repository directory '${absoluteRepoPath}' (resolved from '${repositoryPathArg}') does not exist or is not a directory.`);
        }
        try {
            const { stdout } = await execAsync(`git -C "${quoteForShell(absoluteRepoPath)}" ${gitArgsForRepoRoot.join(' ')}`);
            repoRoot = stdout.trim();
        } catch (err: any) {
            throw new Error(`Specified path '${absoluteRepoPath}' does not appear to be a valid Git repository: ${err.message || err}`);
        }
    } else {
        try {
            await execAsync('git rev-parse --is-inside-work-tree', { cwd: currentInvocationDir });
            const { stdout } = await execAsync(`git ${gitArgsForRepoRoot.join(' ')}`, { cwd: currentInvocationDir });
            repoRoot = stdout.trim();
        } catch (err: any) {
            throw new Error(`Not inside a Git repository and no repository_path specified, or failed to determine repository root: ${err.message || err}`);
        }
    }
    console.log(`Operating on Git repository in: ${repoRoot}`);

    const outputDirName = ".taylored";
    const patchBasename = path.basename(absolutePatchFilePath);
    const finalOutputDirPath = path.join(repoRoot, outputDirName);
    const finalOutputPatchPath = path.join(finalOutputDirPath, patchBasename);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-offset-'));
    const tempGeneratedPatchFile = path.join(tempDir, patchBasename);

    const tempBranchName = "temp/patch-offset-automation";
    let originalBranchOrCommit: string = '';
    let patchGeneratedNonEmpty: boolean = false;
    let operationType: UpdatePatchOffsetsResult["operationType"] = "unknown";
    let onTempBranchAtStartOfCleanup: boolean = false;

    const originalPatchContent = fs.readFileSync(absolutePatchFilePath, 'utf8');
    let commitMessageToUse: string | null | undefined = customCommitMessage;
    if (!commitMessageToUse) {
        commitMessageToUse = extractMessageFromPatch(originalPatchContent);
        if (commitMessageToUse) {
            console.log(`INFO: Extracted commit message from input patch: "${commitMessageToUse}"`);
        }
    }
    const defaultMsgAppliedForwards = "Temporary: Applied patch (forwards) for offset update";
    const defaultMsgAppliedBackwards = "Temporary: Applied patch (backwards) to get a non-empty diff";
    const defaultMsgNoDiff = "Temporary: Patch produced no diff (neither forwards nor backwards)";
    const defaultMsgFailedReverse = "Temporary: Failed 'apply -R'; input patch not reversible";

    const cleanup = async () => {
        console.log("\nCleaning up...");
        try {
            const headCheckResult = await execGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true, ignoreStderr: true });
            let currentHeadNow = headCheckResult.success ? headCheckResult.stdout : (await execGit(repoRoot, ['rev-parse', 'HEAD'])).stdout;

            if (currentHeadNow === tempBranchName || onTempBranchAtStartOfCleanup) {
                if (originalBranchOrCommit) {
                    console.log(`Returning to '${originalBranchOrCommit}' in repository '${repoRoot}'...`);
                    await execGit(repoRoot, ['checkout', originalBranchOrCommit, '--quiet']);
                } else {
                    console.warn("Original branch/commit unknown, cannot automatically checkout. Please check repository state.");
                }
            }

            const tempBranchExistsResult = await execGit(repoRoot, ['rev-parse', '--verify', tempBranchName], { allowFailure: true, ignoreStderr: true });
            if (tempBranchExistsResult.success) {
                console.log(`Deleting temporary branch '${tempBranchName}' from repository '${repoRoot}'...`);
                await execGit(repoRoot, ['branch', '-D', tempBranchName, '--quiet']);
            }
        } catch (cleanupErr: any) {
            console.error(`Error during Git cleanup: ${cleanupErr.message}`);
            if (cleanupErr.stdout) console.error(`Cleanup Git stdout: ${cleanupErr.stdout}`);
            if (cleanupErr.stderr) console.error(`Cleanup Git stderr: ${cleanupErr.stderr}`);
        } finally {
            try {
                if (fs.existsSync(tempGeneratedPatchFile)) {
                    fs.unlinkSync(tempGeneratedPatchFile);
                }
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (fsCleanupErr: any) {
                console.error(`Error during filesystem cleanup: ${fsCleanupErr.message}`);
            }
            console.log("Cleanup complete.");
        }
    };

    try {
        console.log(`--- Starting offset update for: ${absolutePatchFilePath} ---`);
        fs.ensureDirSync(finalOutputDirPath);

        const symbolicRefResult = await execGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true, ignoreStderr: true });
        if (symbolicRefResult.success && symbolicRefResult.stdout) {
            originalBranchOrCommit = symbolicRefResult.stdout;
        } else {
            originalBranchOrCommit = (await execGit(repoRoot, ['rev-parse', 'HEAD'])).stdout;
        }
        if (!originalBranchOrCommit) {
            throw new Error("Could not determine the current branch or commit.");
        }

        console.log(`Checking/Creating temporary branch '${tempBranchName}'...`);
        const tempBranchExistsInitialResult = await execGit(repoRoot, ['rev-parse', '--verify', tempBranchName], { allowFailure: true, ignoreStderr: true });

        if (tempBranchExistsInitialResult.success) {
            console.log(`Temporary branch '${tempBranchName}' exists. Deleting and recreating.`);
            const currentHeadCheckResult = await execGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true, ignoreStderr: true });
            const currentHeadInitial = currentHeadCheckResult.success ? currentHeadCheckResult.stdout : (await execGit(repoRoot, ['rev-parse', 'HEAD'])).stdout;

            if (currentHeadInitial === tempBranchName) {
                await execGit(repoRoot, ['checkout', originalBranchOrCommit, '--quiet']);
            }
            await execGit(repoRoot, ['branch', '-D', tempBranchName, '--quiet']);
        }
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, originalBranchOrCommit, '--quiet']);
        onTempBranchAtStartOfCleanup = true;
        console.log(`Temporary branch '${tempBranchName}' created from '${originalBranchOrCommit}'.`);

        console.log(`Attempt 1: Applying patch '${absolutePatchFilePath}' forwards (standard)...`);
        try {
            await execGit(repoRoot, ['apply', '--whitespace=fix', '--3way', absolutePatchFilePath]);
        } catch (applyError: any) {
            console.error("--------------------------------------------------------------------");
            console.error(`CRITICAL ERROR: 'git apply' (forwards) failed.`);
            console.error(`Patch '${absolutePatchFilePath}' might be corrupt, or the context/target files are missing or too different.`);
            console.error("Check git apply output above for specific messages (if any in the main error).");
            console.error("Cannot proceed with automatic offset update for this patch.");
            console.error("--------------------------------------------------------------------");
            throw applyError;
        }

        const parsedOriginalPatch: parseDiffModule.File[] = parseDiffModule.default(originalPatchContent);
        const filesToStage = new Set<string>();

        for (const fileDiff of parsedOriginalPatch) {
            if (fileDiff.from && fileDiff.from !== '/dev/null') {
                filesToStage.add(fileDiff.from);
            }
            if (fileDiff.to && fileDiff.to !== '/dev/null') {
                filesToStage.add(fileDiff.to);
            }
        }

        if (filesToStage.size > 0) {
            const filesArray = Array.from(filesToStage);
            console.log(`Staging specific files affected by patch: ${filesArray.join(', ')}`);
            await execGit(repoRoot, ['add', ...filesArray]);
        } else {
            console.log("No files to stage based on patch content analysis (original patch might be empty or only affect modes).");
        }

        const diffStagedResult = await execGit(repoRoot, ['diff', '--staged', '--quiet'], { allowFailure: true });
        const hasForwardChanges = !diffStagedResult.success;

        if (hasForwardChanges) {
            console.log("Patch produced changes when applied forwards.");
            const msg = commitMessageToUse || defaultMsgAppliedForwards;
            await execGit(repoRoot, ['commit', '-m', msg, '--quiet']);
            const formatPatchForwardResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
            fs.writeFileSync(tempGeneratedPatchFile, formatPatchForwardResult.stdout);
            patchGeneratedNonEmpty = true;
            operationType = "forwards";
        } else {
            console.log("No changes when applying patch forwards (likely already integrated or no-op).");
            console.log("Attempt 2: Generating a non-empty patch by applying the input patch backwards (-R)...");

            await execGit(repoRoot, ['reset', '--hard', 'HEAD', '--quiet']); // Reset any uncommitted changes from forward apply attempt

            const applyReverseResult = await execGit(repoRoot, ['apply', '-R', '--whitespace=fix', '--3way', absolutePatchFilePath], { allowFailure: true });

            if (applyReverseResult.success) {
                if (filesToStage.size > 0) { // filesToStage is from original patch, still relevant
                    const filesArray = Array.from(filesToStage);
                    console.log(`Staging specific files affected by reverse patch application: ${filesArray.join(', ')}`);
                    await execGit(repoRoot, ['add', ...filesArray]);
                } else {
                    console.log("No files to stage based on patch content analysis for reverse apply (original patch might be empty).");
                }

                const diffStagedReverseResult = await execGit(repoRoot, ['diff', '--staged', '--quiet'], { allowFailure: true });
                const hasReverseChanges = !diffStagedReverseResult.success;

                if (hasReverseChanges) {
                    console.log("Applying the patch backwards (-R) produced changes.");
                    const msg = commitMessageToUse || defaultMsgAppliedBackwards;
                    await execGit(repoRoot, ['commit', '-m', msg, '--quiet']);
                    const formatPatchReverseResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
                    fs.writeFileSync(tempGeneratedPatchFile, formatPatchReverseResult.stdout);
                    patchGeneratedNonEmpty = true;
                    operationType = "backwards (revert)";
                } else {
                    console.warn("Warning: Applying backwards (-R) also produced no changes.");
                    console.warn("Input patch might be empty, self-canceling, or irrelevant to the current state.");
                    console.warn("Generating an empty patch as fallback.");
                    const msg = commitMessageToUse || defaultMsgNoDiff;
                    await execGit(repoRoot, ['commit', '--allow-empty', '-m', msg, '--quiet']);
                    const formatPatchEmptyResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
                    fs.writeFileSync(tempGeneratedPatchFile, formatPatchEmptyResult.stdout);
                    patchGeneratedNonEmpty = false;
                    operationType = "empty (fallback post -R no diff)";
                }
            } else {
                console.error("ERROR: 'git apply -R' command failed for backwards patch application.");
                console.error(applyReverseResult.stderr || (applyReverseResult.error && applyReverseResult.error.message));
                console.warn("This can happen if the input patch cannot be cleanly reversed on the current state.");
                console.warn("Generating an empty patch as fallback.");
                await execGit(repoRoot, ['reset', '--hard', 'HEAD', '--quiet']); // Reset failed -R apply
                const msg = commitMessageToUse || defaultMsgFailedReverse;
                await execGit(repoRoot, ['commit', '--allow-empty', '-m', msg, '--quiet']);
                const formatPatchEmptyFallbackResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
                fs.writeFileSync(tempGeneratedPatchFile, formatPatchEmptyFallbackResult.stdout);
                patchGeneratedNonEmpty = false;
                operationType = "empty (fallback post -R failed)";
            }
        }

        console.log(`Saving updated patch to '${finalOutputPatchPath}'...`);
        fs.copySync(tempGeneratedPatchFile, finalOutputPatchPath);

        console.log("");
        if (patchGeneratedNonEmpty) {
            if (operationType === "backwards (revert)") {
                console.log("--- Offset update complete. WARNING: A REVERT PATCH was generated. ---");
            } else {
                console.log("--- Offset update completed successfully (patch applied forwards)! ---");
            }
        } else {
            console.log(`--- Offset update completed. RESULT: Empty patch (operation: ${operationType}). ---`);
        }
        console.log(`Updated patch saved to: ${finalOutputPatchPath}`);

        return {
            outputPath: finalOutputPatchPath,
            operationType,
            patchGeneratedNonEmpty
        };

    } catch (error: any) {
        console.error("\n--- Patch offset update process FAILED ---");
        if (!(error instanceof GitExecutionError)) { // Avoid re-printing GitExecutionError details if already part of its message
             if (error.message && !error.message.includes("Error executing git command")) { // Check if it's not a generic Git error message
                console.error(`An unexpected error occurred: ${error.message}`);
             }
        }
        // If it's a GitExecutionError, its constructor already formats well.
        // Otherwise, rethrow the original error.
        throw error instanceof GitExecutionError ? error : new Error(`Patch offset update failed: ${error.message}`);
    } finally {
        await cleanup();
    }
}

export { updatePatchOffsets, extractMessageFromPatch };

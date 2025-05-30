// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const util = require('util');
const os = require('os');
const crypto = require('crypto');

const execAsync = util.promisify(exec);

/**
 * Quotes an argument for safe use in a shell command string.
 * If the argument contains spaces or special shell characters, it will be double-quoted,
 * with internal backslashes and double-quotes escaped.
 * @param {string} arg - The argument string to quote.
 * @returns {string} The quoted argument string.
 */
function quoteForShell(arg) {
    // Regex to check for characters that typically need quoting in a shell.
    // This includes spaces, tabs, newlines, quotes, parentheses, shell metacharacters, etc.
    if (!/[ \t\n\r"'();&|<>*?#~=%\\]/.test(arg)) {
        return arg; // No quoting needed
    }
    // Escape backslashes, double quotes, backticks, and dollar signs, then wrap in double quotes.
    const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `"${escaped}"`;
}
/**
 * Executes a Git command asynchronously.
 * @param {string} repoRoot - The root directory of the Git repository.
 * @param {string[]} args - Arguments for the git command.
 * @param {object} [options={}] - Options for execution.
 * @param {boolean} [options.allowFailure=false] - If true, won't throw on non-zero exit code.
 * @param {boolean} [options.ignoreStderr=false] - If true, stderr from git won't be logged as a warning.
 * @param {object} [options.execOptions={}] - Additional options for child_process.exec.
 * @returns {Promise<{stdout: string, stderr: string, success: boolean, error?: Error}>}
 */
async function execGit(repoRoot, args, options = {}) {
    const command = `git ${args.map(quoteForShell).join(' ')}`;
    const execOptions = { cwd: repoRoot, ...options.execOptions };
    try {
        const { stdout, stderr } = await execAsync(command, execOptions);
        if (stderr && !options.ignoreStderr && stderr.trim() !== "") {
            // Git often uses stderr for informational messages (e.g., "Reinitialized existing Git repository")
            // or warnings that aren't critical failures.
            // We log it as a warning but don't treat it as an error unless execAsync throws.
            console.warn(`Git command stderr for "${command}":\n${stderr.trim()}`);
        }
        return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
    } catch (error) {
        if (options.allowFailure) {
            return {
                stdout: error.stdout ? error.stdout.trim() : '',
                stderr: error.stderr ? error.stderr.trim() : '',
                success: false,
                error
            };
        }
        const errorMessage = `Error executing git command: ${command}\nRepo: ${repoRoot}\nExit Code: ${error.code}\nStdout: ${error.stdout ? error.stdout.trim() : ''}\nStderr: ${error.stderr ? error.stderr.trim() : ''}`;
        const customError = new Error(errorMessage);
        customError.originalError = error;
        customError.stdout = error.stdout ? error.stdout.trim() : '';
        customError.stderr = error.stderr ? error.stderr.trim() : '';
        throw customError;
    }
}

/**
 * Updates the offsets of a specified patch file to apply cleanly against
 * the current state of the target Git repository.
 * @param {string} patchFilePathArg - Path to the patch file.
 * @param {string} [repositoryPathArg] - Optional path to the Git repository.
 * @returns {Promise<{outputPath: string, operationType: string, patchGeneratedNonEmpty: boolean}>}
 */
async function updatePatchOffsets(patchFilePathArg, repositoryPathArg) {
    if (!patchFilePathArg) {
        throw new Error("Patch file path argument is required.");
    }

    // --- Resolve Paths and Validate Inputs ---
    const currentInvocationDir = process.cwd();
    let absolutePatchFilePath = path.resolve(currentInvocationDir, patchFilePathArg);

    try {
        absolutePatchFilePath = fs.realpathSync(absolutePatchFilePath);
    } catch (e) {
        throw new Error(`Patch file '${absolutePatchFilePath}' (resolved from '${patchFilePathArg}') not found or inaccessible: ${e.message}`);
    }

    if (!fs.existsSync(absolutePatchFilePath) || !fs.statSync(absolutePatchFilePath).isFile()) {
        throw new Error(`Patch file '${absolutePatchFilePath}' (resolved from '${patchFilePathArg}') not found or is not a file.`);
    }

    let repoRoot;
    const gitArgsForRepoRoot = ['rev-parse', '--show-toplevel'];
    if (repositoryPathArg) {
        const absoluteRepoPath = path.resolve(currentInvocationDir, repositoryPathArg);
        if (!fs.existsSync(absoluteRepoPath) || !fs.statSync(absoluteRepoPath).isDirectory()) {
            throw new Error(`Specified repository directory '${absoluteRepoPath}' (resolved from '${repositoryPathArg}') does not exist or is not a directory.`);
        }
        try {
            // Check if it's a git repo by trying to get toplevel
            const { stdout } = await execAsync(`git -C "${absoluteRepoPath}" ${gitArgsForRepoRoot.join(' ')}`);
            repoRoot = stdout.trim();
        } catch (err) {
            throw new Error(`Specified path '${absoluteRepoPath}' does not appear to be a valid Git repository: ${err.message || err}`);
        }
    } else {
        try {
            // Check if current dir is in a git repo
            await execAsync('git rev-parse --is-inside-work-tree', { cwd: currentInvocationDir }); // Throws if not
            const { stdout } = await execAsync(`git ${gitArgsForRepoRoot.join(' ')}`, { cwd: currentInvocationDir });
            repoRoot = stdout.trim();
        } catch (err) {
            throw new Error(`Not inside a Git repository and no repository_path specified, or failed to determine repository root: ${err.message || err}`);
        }
    }
    console.log(`Operating on Git repository in: ${repoRoot}`);

    // --- Setup Variables ---
    const outputDirName = ".taylored";
    const patchBasename = path.basename(absolutePatchFilePath);
    const finalOutputDirPath = path.join(repoRoot, outputDirName);
    const finalOutputPatchPath = path.join(finalOutputDirPath, patchBasename);

    // Create a temporary file path for the generated patch
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'patch-offset-'));
    const tempGeneratedPatchFile = path.join(tempDir, patchBasename);

    const tempBranchName = "temp/patch-offset-automation";
    let originalBranchOrCommit = '';
    let patchGeneratedNonEmpty = false;
    let operationType = "unknown";

    // --- Cleanup Function (to be called in finally) ---
    // Variables needed for cleanup must be declared in a scope accessible to cleanup
    let onTempBranchAtStartOfCleanup = false;

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
        } catch (cleanupErr) {
            console.error(`Error during Git cleanup: ${cleanupErr.message}`);
            // Log more details if available
            if (cleanupErr.stdout) console.error(`Cleanup Git stdout: ${cleanupErr.stdout}`);
            if (cleanupErr.stderr) console.error(`Cleanup Git stderr: ${cleanupErr.stderr}`);
        } finally {
            // Filesystem cleanup
            try {
                if (fs.existsSync(tempGeneratedPatchFile)) {
                    fs.unlinkSync(tempGeneratedPatchFile);
                }
                if (fs.existsSync(tempDir)) {
                    fs.rmSync(tempDir, { recursive: true, force: true });
                }
            } catch (fsCleanupErr) {
                console.error(`Error during filesystem cleanup: ${fsCleanupErr.message}`);
            }
            console.log("Cleanup complete.");
        }
    };

    try {
        console.log(`--- Starting offset update for: ${absolutePatchFilePath} ---`);
        fs.ensureDirSync(finalOutputDirPath);

        // Get original branch or commit
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
        onTempBranchAtStartOfCleanup = true; // For cleanup logic
        console.log(`Temporary branch '${tempBranchName}' created from '${originalBranchOrCommit}'.`);

        // --- Attempt 1: Apply patch forwards ---
        console.log(`Attempt 1: Applying patch '${absolutePatchFilePath}' forwards (standard)...`);
        try {
            // Note: `git apply` can output to stderr for warnings (e.g. whitespace issues it fixed)
            // We let execGit handle logging these if not ignored. A throw means critical failure.
            await execGit(repoRoot, ['apply', '--whitespace=fix', '--3way', absolutePatchFilePath]);
        } catch (applyError) {
            console.error("--------------------------------------------------------------------");
            console.error(`CRITICAL ERROR: 'git apply' (forwards) failed.`);
            console.error(`Patch '${absolutePatchFilePath}' might be corrupt, or the context/target files are missing or too different.`);
            console.error("Check git apply output above for specific messages (if any in the main error).");
            console.error("Cannot proceed with automatic offset update for this patch.");
            console.error("Suggested actions:");
            console.error(`1. Verify the integrity and validity of the patch: ${absolutePatchFilePath}`);
            console.error(`2. Ensure the repository '${repoRoot}' is in the expected state for this patch application.`);
            console.error("3. Manual intervention might be required to fix the patch or the repository.");
            console.error("--------------------------------------------------------------------");
            // Rethrow the specific applyError to be caught by the main try/catch, which will trigger cleanup
            throw applyError;
        }

        await execGit(repoRoot, ['add', '.']);

        const diffStagedResult = await execGit(repoRoot, ['diff', '--staged', '--quiet'], { allowFailure: true });
        const hasForwardChanges = !diffStagedResult.success; // success=false (exit code 1) means there are changes

        if (hasForwardChanges) {
            console.log("Patch produced changes when applied forwards.");
            await execGit(repoRoot, ['commit', '-m', 'Temporary: Applied patch (forwards) for offset update', '--quiet']); const formatPatchForwardResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
            fs.writeFileSync(tempGeneratedPatchFile, formatPatchForwardResult.stdout);
            patchGeneratedNonEmpty = true;
            operationType = "forwards";
        } else {
            console.log("No changes when applying patch forwards (likely already integrated or no-op).");
            console.log("Attempt 2: Generating a non-empty patch by applying the input patch backwards (-R)...");

            await execGit(repoRoot, ['reset', '--hard', 'HEAD', '--quiet']); // Reset any 'git add'

            const applyReverseResult = await execGit(repoRoot, ['apply', '-R', '--whitespace=fix', '--3way', absolutePatchFilePath], { allowFailure: true });

            if (applyReverseResult.success) {
                await execGit(repoRoot, ['add', '.']);
                const diffStagedReverseResult = await execGit(repoRoot, ['diff', '--staged', '--quiet'], { allowFailure: true });
                const hasReverseChanges = !diffStagedReverseResult.success;

                if (hasReverseChanges) {
                    console.log("Applying the patch backwards (-R) produced changes.");
                    await execGit(repoRoot, ['commit', '-m', 'Temporary: Applied patch (backwards) to get a non-empty diff', '--quiet']); const formatPatchReverseResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
                    fs.writeFileSync(tempGeneratedPatchFile, formatPatchReverseResult.stdout);
                    patchGeneratedNonEmpty = true;
                    operationType = "backwards (revert)";
                } else {
                    console.warn("Warning: Applying backwards (-R) also produced no changes.");
                    console.warn("Input patch might be empty, self-canceling, or irrelevant to the current state.");
                    console.warn("Generating an empty patch as fallback.");
                    await execGit(repoRoot, ['commit', '--allow-empty', '-m', 'Temporary: Patch produced no diff (neither forwards nor backwards)', '--quiet']); const formatPatchEmptyResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
                    fs.writeFileSync(tempGeneratedPatchFile, formatPatchEmptyResult.stdout);
                    patchGeneratedNonEmpty = false; // Explicitly false for empty commit patch
                    operationType = "empty (fallback post -R no diff)";
                }
            } else {
                console.error("ERROR: 'git apply -R' command failed for backwards patch application.");
                console.error(applyReverseResult.stderr || applyReverseResult.error.message);
                console.warn("This can happen if the input patch cannot be cleanly reversed on the current state.");
                console.warn("Generating an empty patch as fallback.");
                await execGit(repoRoot, ['reset', '--hard', 'HEAD', '--quiet']); // Clean state before empty commit
                await execGit(repoRoot, ['commit', '--allow-empty', '-m', 'Temporary: Failed \'apply -R\'; input patch not reversible', '--quiet']); const formatPatchEmptyFallbackResult = await execGit(repoRoot, ['format-patch', 'HEAD~1', '--stdout']);
                fs.writeFileSync(tempGeneratedPatchFile, formatPatchEmptyFallbackResult.stdout);
                patchGeneratedNonEmpty = false;
                operationType = "empty (fallback post -R failed)";
            }
        }

        console.log(`Saving updated patch to '${finalOutputPatchPath}'...`);
        fs.copySync(tempGeneratedPatchFile, finalOutputPatchPath);

        // --- Final Logging ---
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

    } catch (error) {
        console.error("\n--- Patch offset update process FAILED ---");
        // The error message from execGit or other operations should already be detailed.
        // If not, or if it's a generic error:
        if (!error.message.includes("Error executing git command")) {
            console.error(`An unexpected error occurred: ${error.message}`);
        }
        // The main error object (error) is thrown, to be handled by the caller.
        // The 'cleanup' in 'finally' will still run.
        throw error;
    } finally {
        await cleanup();
    }
}

module.exports = { updatePatchOffsets };

// Example Usage (for testing directly):
/*
if (require.main === module) {
    (async () => {
        const patchFile = process.argv[2];
        const repoPath = process.argv[3];

        if (!patchFile) {
            console.log("Usage: node git-patch-offset-updater.js <patch_file_path> [repository_path]");
            console.log("\nUpdates the offsets of a specified patch file to apply cleanly against");
            console.log("the current state of the target Git repository.");
            process.exit(1);
        }

        try {
            const result = await updatePatchOffsets(patchFile, repoPath);
            console.log("\n--- RESULT SUMMARY ---");
            console.log(`Output Path: ${result.outputPath}`);
            console.log(`Operation Type: ${result.operationType}`);
            console.log(`Patch Generated Non-Empty: ${result.patchGeneratedNonEmpty}`);
        } catch (e) {
            console.error("\n--- SCRIPT EXECUTION FAILED ---");
            // Error message is already logged by the updatePatchOffsets function or its helpers
            // console.error(`Error in example usage: ${e.message}`);
            process.exit(1);
        }
    })();
}
*/

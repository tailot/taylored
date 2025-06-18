// lib/apply-logic.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises'; // Using fs/promises for async file operations
import * as path from 'path';
import { execSync } from 'child_process';
import { TAYLORED_DIR_NAME } from './constants';

/**
 * Handles core Taylored operations for applying, removing, and verifying patches
 * by orchestrating `git apply` commands. This function is central to the
 * `--add`, `--remove`, `--verify-add`, and `--verify-remove` CLI commands.
 *
 * It constructs and executes a `git apply` command based on the provided parameters.
 * Key `git apply` flags used include:
 *  - `--check`: For verification operations (dry-run).
 *  - `-R` (or `--reverse`): For remove/revert operations.
 *  - `--verbose`: To provide detailed output during application.
 *  - `--whitespace=fix`: To automatically fix whitespace issues when applying (not used in verify).
 *  - `--reject`: To create .rej files for conflicting hunks, aiding in debugging.
 *
 * The function first checks for the existence and accessibility of the specified
 * .taylored patch file before proceeding with the `git apply` command.
 * For more details on the user-facing commands utilizing this logic, see DOCUMENTATION.md.
 *
 * @async
 * @param {string} tayloredFileNameWithExt - The full name of the .taylored file,
 *                                           including the extension (e.g., "myfeature.taylored").
 * @param {boolean} isVerify - If true, performs a dry-run verification (`git apply --check`)
 *                             instead of actually applying changes.
 * @param {boolean} isReverse - If true, applies the patch in reverse (`git apply -R`),
 *                              effectively undoing the patch.
 * @param {string} modeName - A string identifying the calling command (e.g., "--add", "--remove").
 *                            Used for logging and error messages.
 * @param {string} CWD - The current working directory, which must be the root of a
 *                       Git repository for `git apply` to function correctly.
 * @returns {Promise<void>} A promise that resolves if the operation is successful.
 * @throws {Error} Throws an error if the specified .taylored file is not found or
 *                 is inaccessible (due to `fs.access` failure). Also re-throws errors
 *                 from `execSync` if the `git apply` command itself fails (e.g., patch
 *                 does not apply cleanly, non-zero exit code).
 */
export async function handleApplyOperation(
    tayloredFileNameWithExt: string,
    isVerify: boolean,
    isReverse: boolean,
    modeName: string,
    CWD: string
): Promise<void> {
    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    const actualTayloredFilePath = path.join(tayloredDir, tayloredFileNameWithExt);

    // Log the operation details clearly.
    // Current logging for verify/reverse is implicitly handled by the command construction
    // and error messages. Explicit logging for these flags before command execution
    // can be added here if desired in the future.

    try {
        // Check if the taylored file exists and is accessible before attempting to use it.
        await fs.access(actualTayloredFilePath);
    } catch (e: any) {
        // Provide a specific error message if the file access fails.
        console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found or not accessible in '${TAYLORED_DIR_NAME}/' directory.`);
        throw e; // Re-throw the error to be handled by the caller.
    }

    // Construct the git apply command with appropriate flags.
    // --verbose: Provides more detailed output from git apply.
    // --whitespace=fix: Attempts to fix whitespace errors automatically.
    // --reject: Creates .rej files for conflicting hunks instead of failing outright,
    //           which can be helpful for debugging, although the primary success/failure
    //           is determined by the exit code of `git apply`.
    let gitApplyCommand = `git apply --verbose`; // New base command
    if (isVerify) {
        gitApplyCommand += " --check"; // Add check first if verifying
    } else {
        gitApplyCommand += " --whitespace=fix"; // Add fix only if not verifying
    }
    gitApplyCommand += " --reject"; // Add --reject after --check or --whitespace=fix

    if (isReverse) {
        gitApplyCommand += " --reverse"; // Add --reverse if needed
    }
    // Ensure the filepath is quoted to handle potential spaces or special characters,
    // though typically taylored filenames are sanitized.
    gitApplyCommand += ` "${actualTayloredFilePath.replace(/"/g, '\\"')}"`;

    try {
        // Execute the git apply command.
        // stdio: 'inherit' allows git's output (stdout, stderr) to be displayed directly in the console,
        // providing real-time feedback to the user.
        execSync(gitApplyCommand, { cwd: CWD, stdio: 'inherit' });

        // Log success message based on whether it was a verification or an execution.
        // Success messages can be added here if more detailed positive feedback is needed.
        // For now, successful execution implies the command ran without throwing an error.
    } catch (error: any) {
        // execSync throws an error if the command exits with a non-zero status,
        // indicating failure of `git apply`.
        console.error(`\nCRITICAL ERROR: 'git apply' failed during ${modeName} operation.`);
        if (isVerify) {
            console.error("  Verification failed. The patch may not apply/revert cleanly (atomicity check failed).");
        } else {
            console.error("  Execution failed. The current directory might be in an inconsistent or partially modified state.");
            console.error("  Please check git status and any .rej files created for conflict details.");
        }
        throw error; // Re-throw the error to be handled by the caller.
    }
}

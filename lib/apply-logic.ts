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
 * Key `git apply` flags used:
 *  - `--check`: Performs a dry-run. If the patch applies cleanly, it exits with 0.
 *               Otherwise, it exits with a non-zero status. No changes are made to files.
 *               Used for verification operations.
 *  - `-R` (or `--reverse`): Applies the patch in reverse. This is used for removing
 *                           or reverting the changes introduced by the patch.
 *  - `--verbose`: Provides more detailed output about what `git apply` is doing,
 *                 including which hunks are being applied.
 *  - `--whitespace=fix`: When applying a patch, if there are whitespace errors
 *                        (e.g., trailing whitespace, space before tab), this option
 *                        instructs `git apply` to try to fix them automatically.
 *                        This is not used during `--check` (verify) operations.
 *  - `--reject`: If a hunk cannot be applied (a conflict occurs), `git apply` will
 *                normally stop and report an error. With `--reject`, it will instead
 *                apply the parts of the patch that can be applied cleanly and create
 *                `.rej` (reject) files for the conflicting hunks. This allows for
 *                manual inspection and resolution of conflicts. The command will
 *                still exit with a non-zero status if there are rejects.
 *
 * The function first checks for the existence and accessibility of the specified
 * `.taylored` patch file. If the file is found, it proceeds to construct and execute
 * the `git apply` command.
 *
 * For more details on the user-facing commands that utilize this logic, refer to
 * the `DOCUMENTATION.md` file.
 *
 * @async
 * @function handleApplyOperation
 * @param {string} tayloredFileNameWithExt - The full name of the `.taylored` file,
 *                                           including its `.taylored` extension (e.g., "myfeature.taylored").
 * @param {boolean} isVerify - If `true`, the function performs a dry-run verification
 *                             (`git apply --check`) instead of actually applying changes to the files.
 * @param {boolean} isReverse - If `true`, the patch is applied in reverse (`git apply -R`),
 *                              which effectively undoes the changes introduced by the patch.
 * @param {string} modeName - A descriptive string identifying the calling command or operation
 *                            (e.g., "--add", "--remove", "offset operation"). This is primarily
 *                            used for logging and generating informative error messages.
 * @param {string} CWD - The current working directory. This path must be the root of a
 *                       Git repository for `git apply` to function correctly.
 * @returns {Promise<void>} A promise that resolves if the `git apply` operation is successful
 *                          (i.e., exits with a status code of 0).
 * @throws {Error} Throws an error in the following cases:
 *                 - If the specified `.taylored` file is not found at the expected location
 *                   (i.e., `<CWD>/.taylored/<tayloredFileNameWithExt>`) or is inaccessible
 *                   (due to permissions issues, caught by `fs.access`).
 *                 - If the `execSync` call for `git apply` itself fails. This typically happens
 *                   if the patch does not apply cleanly (e.g., conflicts occur, target files
 *                   have changed significantly) and `git apply` exits with a non-zero status code.
 *                   The original error from `execSync` is re-thrown.
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

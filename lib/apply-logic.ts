// lib/apply-logic.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises'; // Using fs/promises for async file operations
import * as path from 'path';
import { execSync } from 'child_process';
import { TAYLORED_DIR_NAME } from './constants';

/**
 * Handles apply, remove, verify-add, verify-remove operations using `git apply`.
 * This function is intended to be the core logic for applying/reverting patches.
 *
 * @param tayloredFileNameWithExt The full name of the .taylored file, including the extension.
 * @param isVerify True if it's a verification (dry-run) operation (uses `git apply --check`).
 * @param isReverse True if the patch should be applied in reverse (for remove/verify-remove, uses `git apply -R`).
 * @param modeName A string representing the current mode (e.g., '--add', '--remove (invoked by offset)') for logging purposes.
 * @param CWD The current working directory, expected to be the root of the Git repository.
 * @throws Will throw an error if the file is not accessible or if `git apply` command fails.
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
    let gitApplyCommand = `git apply --verbose --whitespace=fix --reject`;
    if (isVerify) {
        gitApplyCommand += " --check";
    }
    if (isReverse) {
        gitApplyCommand += " --reverse";
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

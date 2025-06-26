import * as fs from 'fs/promises';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { getAndAnalyzeDiff } from '../utils';

/**
 * Implements the `taylored --save <branch_name>` command functionality.
 *
 * This function captures the difference between a specified Git branch and the current
 * `HEAD`, then saves this diff as a `.taylored` patch file. A critical aspect of this
 * operation is the **atomicity requirement**: the patch file is created only if the
 * diff consists exclusively of line additions or exclusively of line deletions (or no changes).
 * If the diff contains a mix of additions and deletions, the operation will fail,
 * ensuring that Taylored patches represent clean, atomic changes.
 *
 * The generated patch file is named after the sanitized `branchName` and stored in
 * the `.taylored/` directory within the `CWD`.
 *
 * For more details on the `taylored --save` command, refer to `DOCUMENTATION.md`.
 *
 * @async
 * @function handleSaveOperation
 * @param {string} branchName - The name of the Git branch to compare against the current `HEAD`.
 *                              This name is sanitized (slashes and backslashes replaced with hyphens)
 *                              to form part of the output `.taylored` filename.
 * @param {string} CWD - The current working directory. This must be the root of a
 *                       Git repository for the `git diff` operation to function correctly.
 *                       The `.taylored` directory will be created inside this CWD if it
 *                       doesn't already exist.
 * @returns {Promise<void>} A promise that resolves if the patch file is successfully generated
 *                          and saved.
 * @throws {Error} Throws an error, and the process may exit, if:
 *                 - The `.taylored` directory cannot be created (e.g., due to permissions).
 *                 - The `git diff` command (executed by `getAndAnalyzeDiff`) fails critically
 *                   (e.g., invalid branch name, not a Git repository).
 *                 - The diff analysis performed by `getAndAnalyzeDiff` fails.
 *                 - The diff between `HEAD` and `branchName` is not "pure" (i.e., it contains
 *                   a mix of additions and deletions, or if `diffResult.success` is false
 *                   for other reasons).
 *                 - The diff output from `getAndAnalyzeDiff` is unexpectedly `undefined` even
 *                   though the operation was reported as successful and pure (a defensive check).
 *                 - Writing the generated patch file to the file system fails.
 *                 Error messages are logged to the console before the error is thrown.
 */
export async function handleSaveOperation(branchName: string, CWD: string): Promise<void> {
    // Sanitize branchName for use in filename (replace slashes/backslashes with hyphens)
    const sanitizedBranchName = branchName.replace(/[/\\]/g, '-');
    const outputFileName = `${sanitizedBranchName}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    console.log(`INFO: Attempting to save diff for branch '${branchName}' to '${resolvedOutputFileName}'...`);

    try {
        // Ensure the .taylored directory exists, creating it if necessary.
        await fsExtra.ensureDir(targetDirectoryPath);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create or ensure directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError; // Re-throw to be caught by the main CLI handler
    }

    // Get and analyze the diff between HEAD and the specified branch.
    const diffResult = getAndAnalyzeDiff(branchName, CWD);

    if (diffResult.success && diffResult.isPure) {
        // Diff was successful and pure (only additions, only deletions, or no changes).
        if (typeof diffResult.diffOutput === 'string') {
            try {
                await fs.writeFile(resolvedOutputFileName, diffResult.diffOutput);
                console.log(`SUCCESS: Taylored file '${resolvedOutputFileName}' generated successfully.`);
                if (diffResult.additions === 0 && diffResult.deletions === 0) {
                    console.log(`INFO: The diff between HEAD and branch '${branchName}' was empty. An empty patch file was created.`);
                } else {
                    console.log(`INFO: Diff details - Additions: ${diffResult.additions}, Deletions: ${diffResult.deletions}.`);
                }
            } catch (writeError: any) {
                console.error(`CRITICAL ERROR: Failed to write diff content to file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
                throw writeError; // Re-throw
            }
        } else {
            // This case should ideally not be reached if diffResult.success is true,
            // but it's a defensive check.
            console.error(`CRITICAL ERROR: Diff output is unexpectedly undefined for branch '${branchName}' despite successful analysis. This indicates an internal issue.`);
            throw new Error(`Internal error: Undefined diff output for a supposedly pure diff on branch '${branchName}'.`);
        }
    } else {
        // Diff failed, was not pure, or another error occurred.
        const baseErrorMessage = `ERROR: Taylored file '${resolvedOutputFileName}' was NOT generated for branch '${branchName}'.`;
        console.error(baseErrorMessage);

        if (diffResult.errorMessage) {
            // If getAndAnalyzeDiff provided a specific error message (e.g., git command failed)
            console.error(`  Reason from diff analysis: ${diffResult.errorMessage}`);
        }

        if (!diffResult.isPure && diffResult.success) { // Successfully got diff, but it's not pure
            console.error(`  Reason: The diff between HEAD and branch '${branchName}' contains a mix of content line additions and deletions, which is not allowed for --save.`);
            console.error(`    Total lines added: ${diffResult.additions}`);
            console.error(`    Total lines deleted: ${diffResult.deletions}`);
            console.error("  The --save operation requires the diff to consist exclusively of additions or exclusively of deletions (or no changes).");
        } else if (!diffResult.success && !diffResult.errorMessage) {
            // General failure if no specific message from getAndAnalyzeDiff
            console.error(`  Reason: Failed to obtain or analyze the diff for branch '${branchName}'. This could be due to an invalid branch name or other Git error.`);
        }
        // Consolidate error message for throwing
        const finalErrorMessage = diffResult.errorMessage || `Failed to save taylored file for branch '${branchName}' due to purity or diff generation issues. See console for details.`;
        throw new Error(finalErrorMessage);
    }
}

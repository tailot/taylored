import * as fs from 'fs/promises';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { getAndAnalyzeDiff } from '../utils';
import { FileNotFoundError, GitOperationError, PatchPurityError } from '../errors'; // Added custom errors
// Note: FileNotFoundError might not be directly thrown here but good to have for consistency if fsExtra.ensureDir fails in a specific way.
// For now, fsExtra errors are generic.

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
 * @param {string} branchName - The name of the Git branch to compare against HEAD.
 *                              This name will be sanitized for use in the output filename.
 * @param {string} CWD - The current working directory, which must be the root of a
 *                       Git repository for the diff operation to work correctly.
 * @returns {Promise<void>} A promise that resolves if the patch file is saved successfully.
 * @throws {Error | GitOperationError | PatchPurityError | FileNotFoundError} Throws custom errors on failure.
 *                 - `Error` for generic fs issues (directory creation, file write).
 *                 - `GitOperationError` if `git diff` command fails.
 *                 - `PatchPurityError` if the diff is not "pure".
 */
export async function handleSaveOperation(branchName: string, CWD: string): Promise<void> {
    const outputFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    try {
        await fsExtra.ensureDir(targetDirectoryPath);
    } catch (mkdirError: any) {
        // For now, keep generic error for directory creation failure, as fsExtra errors are not specific enough
        // to easily map to FileNotFoundError without more complex checks.
        throw new Error(`Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
    }

    // getAndAnalyzeDiff will now throw GitOperationError or PatchPurityError directly
    // or a generic Error if diff analysis itself has an internal issue.
    const diffResult = getAndAnalyzeDiff(branchName, CWD);

    // If getAndAnalyzeDiff was successful and didn't throw, diffResult.isPure must be true.
    // The diffOutput is also guaranteed to be a string.
    try {
        await fs.writeFile(resolvedOutputFileName, diffResult.diffOutput);
        console.log(`Successfully saved taylored file: ${resolvedOutputFileName}`); // Added success log
    } catch (writeError: any) {
        // Keep generic error for file write failure
        throw new Error(`Failed to write diff file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
    }
    // No more complex else block, as errors from getAndAnalyzeDiff are thrown.
}

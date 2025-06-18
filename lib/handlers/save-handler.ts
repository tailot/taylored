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
 * @param {string} branchName - The name of the Git branch to compare against HEAD.
 *                              This name will be sanitized for use in the output filename.
 * @param {string} CWD - The current working directory, which must be the root of a
 *                       Git repository for the diff operation to work correctly.
 * @returns {Promise<void>} A promise that resolves if the patch file is saved successfully.
 * @throws {Error} Throws an error if:
 *                 - The `.taylored` directory cannot be created.
 *                 - The `git diff` command fails (e.g., invalid branch name).
 *                 - The diff analysis fails.
 *                 - The diff is not "pure" (contains mixed additions and deletions).
 *                 - The diff output is unexpectedly undefined.
 *                 - Writing the patch file fails.
 */
export async function handleSaveOperation(branchName: string, CWD: string): Promise<void> {
    const outputFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    try {
        await fsExtra.ensureDir(targetDirectoryPath);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError;
    }

    const diffResult = getAndAnalyzeDiff(branchName, CWD);

    if (diffResult.success && diffResult.isPure) {
        if (typeof diffResult.diffOutput === 'string') {
            try {
                await fs.writeFile(resolvedOutputFileName, diffResult.diffOutput);
            } catch (writeError: any) {
                console.error(`CRITICAL ERROR: Failed to write diff file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
                throw writeError;
            }
        } else {
            console.error(`CRITICAL ERROR: Diff output is unexpectedly undefined for branch '${branchName}' despite successful analysis.`);
            throw new Error(`Undefined diff output for pure diff on branch '${branchName}'.`);
        }
    } else {
        if (!diffResult.success && diffResult.errorMessage) {
            console.error(diffResult.errorMessage);
        } else {
            console.error(`ERROR: Taylored file '${resolvedOutputFileName}' was NOT generated.`);
            if (!diffResult.isPure) {
                console.error(`Reason: The diff between "${branchName}" and HEAD contains a mix of content line additions and deletions.`);
                console.error(`  Total lines added: ${diffResult.additions}`);
                console.error(`  Total lines deleted: ${diffResult.deletions}`);
                console.error("This script, for the --save operation, requires the diff to consist exclusively of additions or exclusively of deletions (of lines).");
            } else if (typeof diffResult.diffOutput === 'undefined') {
                 console.error(`Reason: Failed to obtain diff output for branch '${branchName}'. This may be due to an invalid branch name or other git error.`);
            } else {
                console.error(`Reason: An unspecified error occurred during diff generation or analysis for branch '${branchName}'.`);
            }
        }
        throw new Error(diffResult.errorMessage || `Failed to save taylored file for branch '${branchName}' due to purity or diff generation issues.`);
    }
}

import * as path from 'path';
import { updatePatchOffsets, GitExecutionError } from '../git-patch-offset-updater'; // Import GitExecutionError
import { resolveTayloredFileName } from '../utils';
import { TAYLORED_DIR_NAME } from '../constants';
import { GitOperationError, FileNotFoundError } from '../errors'; // Import custom errors
 *
 * This function is responsible for updating the line number offsets within a specified
 * `.taylored` patch file. This is crucial when the underlying codebase has changed since
 * the patch was created, causing the original line numbers in the patch to become outdated
 * and preventing the patch from applying cleanly.
 *
 * The core logic for updating offsets, including complex Git manipulations, is handled
 * by the `updatePatchOffsets` utility. This function serves as a handler that
 * resolves the filename and invokes `updatePatchOffsets`.
 *
 * The general Git workflow performed by `updatePatchOffsets` (as described in DOCUMENTATION.md) involves:
 * 1. Ensuring the Git working directory is clean.
 * 2. Saving the current branch and creating a temporary working branch.
 * 3. Attempting to apply the existing patch to this temporary branch.
 * 4. If successful (or after forcing application), committing the changes on the temporary branch.
 * 5. Generating a new diff by comparing this temporary branch (with patch changes) against
 *    the `targetBranchName` (or a default like 'main' if `branchName` is not provided).
 *    This new diff will have updated line numbers and context.
 * 6. Overwriting the original `.taylored` file with this new, offset-adjusted diff.
 * 7. Cleaning up by restoring the original Git branch and deleting temporary branches.
 *
 * For more details on the `taylored --offset` command, its arguments, and use cases,
 * please refer to `DOCUMENTATION.md`.
 *
 * @async
 * @param {string} userInputFileName - The user-provided name of the .taylored file (may or may not
 *                                     include the .taylored extension). Located in `.taylored/`.
 * @param {string} CWD - The current working directory, which must be the root of a
 *                       Git repository.
 * @param {string} [branchName] - Optional. The name of the Git branch against which the new
 *                                patch offsets should be calculated. If omitted, `updatePatchOffsets`
 *                                typically defaults to the 'main' branch or a similar primary branch.
 * @returns {Promise<void>} A promise that resolves if the patch file's offsets are
 *                          successfully updated.
 * @throws {GitOperationError | FileNotFoundError | Error} Throws custom errors on failure.
 */
export async function handleOffsetCommand(
    userInputFileName: string,
    CWD: string,
    branchName?: string
): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);
    const fullPatchPath = path.join(CWD, TAYLORED_DIR_NAME, resolvedTayloredFileName);

    // It's good practice for the handler to check if the file exists before calling deeper logic,
    // though updatePatchOffsets also checks. This provides a clearer error source.
    try {
        const stats = await fs.promises.stat(fullPatchPath); // fs needs to be imported if not already
        if (!stats.isFile()) {
            throw new FileNotFoundError(`Patch file '${resolvedTayloredFileName}' not found or is not a file at path '${fullPatchPath}'.`);
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            throw new FileNotFoundError(`Patch file '${resolvedTayloredFileName}' not found at path '${fullPatchPath}'.`);
        }
        throw new Error(`Error accessing patch file '${resolvedTayloredFileName}': ${error.message}`);
    }
    
    try {
        await updatePatchOffsets(resolvedTayloredFileName, CWD, undefined, branchName);
        console.log(`Successfully updated offsets for '${resolvedTayloredFileName}'.`); // Add success log
    } catch (error: any) {
        let message = error.message || `An unknown error occurred during offset update for '${resolvedTayloredFileName}'.`;
        let stderr: string | undefined;
        let command: string | undefined;

        if (error instanceof GitExecutionError) { // This is the error from updatePatchOffsets
            message = `Failed to update offsets for '${resolvedTayloredFileName}'. Git operation failed: ${error.message}`;
            stderr = error.stderr;
            // command = error.command; // GitExecutionError in git-patch-offset-updater does not currently store command
            throw new GitOperationError(message, command, stderr);
        } else if (error.message.includes("Patch file") && error.message.includes("not found")) { // From updatePatchOffsets' own checks
             throw new FileNotFoundError(message);
        }
        // For other errors, re-throw as a generic error, or a more specific one if identifiable.
        // The existing console.error is removed, error will be handled by index.ts
        throw new Error(message);
    }
}

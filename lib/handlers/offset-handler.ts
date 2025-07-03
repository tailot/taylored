import { updatePatchOffsets } from '../git-patch-offset-updater';
import { resolveTayloredFileName } from '../utils';

/**
 * Implements the `taylored --offset <taylored_file_name> [BRANCH_NAME]` command.
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
 * @throws {Error} Throws an error if `updatePatchOffsets` fails. This can happen due to
 *                 various reasons including a dirty Git repository, inability to apply the
 *                 original patch even temporarily, or issues generating the new diff.
 *                 The error message from `updatePatchOffsets` will be logged.
 */
export async function handleOffsetCommand(
  userInputFileName: string,
  CWD: string,
  branchName?: string,
): Promise<void> {
  const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

  try {
    // Pass branchName to updatePatchOffsets. Custom commit message is no longer passed.
    await updatePatchOffsets(
      resolvedTayloredFileName,
      CWD,
      undefined,
      branchName,
    );
  } catch (error: any) {
    console.error(
      `\nCRITICAL ERROR: Failed to update offsets for '${resolvedTayloredFileName}'.`,
    );
    let message =
      error.message || 'An unknown error occurred during offset update.';
    console.error(`  Error: ${message}`);
    if (error.stderr) {
      console.error(`  Git STDERR details: ${error.stderr}`);
    }
    throw error;
  }
}

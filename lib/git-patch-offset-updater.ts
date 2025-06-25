import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import { TAYLORED_DIR_NAME } from './constants';
import { analyzeDiffContent } from './utils'; // Assuming analyzeDiffContent is useful for purity checks

const execAsync = util.promisify(exec);

/**
 * Executes a Git command in a specified repository root.
 * @param repoRoot - The absolute path to the repository.
 * @param args - An array of strings representing the Git command arguments.
 * @returns A promise that resolves with the stdout and stderr of the command.
 */
async function execGit(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    const command = `git ${args.join(' ')}`;
    try {
        const { stdout, stderr } = await execAsync(command, { cwd: repoRoot });
        return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
        throw new Error(`Error executing git command: ${command}\n${error.stderr || error.message}`);
    }
}

/**
 * Updates the line number offsets within a .taylored patch file by re-generating it
 * against the current state of the repository or a specified base branch.
 *
 * This function performs the complex Git operations required for the `taylored --offset` command.
 * It ensures the patch can apply cleanly to an evolved codebase.
 *
 * @param patchFileName - The name of the patch file inside the .taylored directory.
 * @param repoRoot - The absolute path to the Git repository.
 * @param baseBranchName - Optional. The name of the Git branch against which the new
 *                         patch offsets should be calculated. Defaults to 'main'.
 * @returns A promise that resolves with a success message.
 * @throws Error if the Git repository is dirty, the patch cannot be applied,
 *              or other Git operations fail.
 */
export async function updatePatchWithOffset(
    patchFileName: string,
    repoRoot: string,
    baseBranchName?: string
): Promise<string> {
    const targetBranch = baseBranchName || 'main'; // Default to 'main' if no branch is specified
    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    // 1. Check for clean Git state
    const { stdout: statusOutput } = await execGit(repoRoot, ['status', '--porcelain']);
    if (statusOutput.length > 0) {
        throw new Error('Git repository is dirty. Please commit or stash your changes before running --offset.');
    }

    if (!await fs.pathExists(absolutePatchFilePath)) {
        throw new Error(`Patch file not found: ${absolutePatchFilePath}`);
    }

    const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
    // Optional: Add purity check for original patch if desired, similar to --save
    // const originalAnalysis = analyzeDiffContent(originalPatchContent);
    // if (!originalAnalysis.isPure) {
    //     throw new Error(`Original patch '${patchFileName}' is not pure (contains mixed additions and deletions) and cannot be offset.`);
    // }

    const originalBranch = (await execGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;
    const tempBranchName = `taylored-offset-temp-${Date.now()}`;
    let newPatchContent: string;

    try {
        // 2. Create a temporary branch from the target base branch
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, targetBranch]);

        // 3. Apply the original patch to this temporary branch
        // Use --whitespace=fix to handle common whitespace issues
        // Use --reject to create .rej files if there are conflicts, but we'll check for conflicts
        // by examining the exit code or stderr.
        try {
            await execGit(repoRoot, ['apply', '--whitespace=fix', '--verbose', `"${absolutePatchFilePath}"`]);
        } catch (applyError: any) {
            // If apply fails, try to clean up any partial changes before re-throwing
            await execGit(repoRoot, ['reset', '--hard']); // Discard changes
            throw new Error(`Failed to apply original patch to temporary branch '${tempBranchName}'. ` +
                            `This usually means the patch is too divergent. Details: ${applyError.stderr || applyError.message}`);
        }

        // 4. Stage and commit the applied changes on the temporary branch
        await execGit(repoRoot, ['add', '-A']);
        await execGit(repoRoot, ['commit', '--no-verify', '-m', `Apply ${patchFileName} for offset update`]);

        // 5. Generate a new diff by comparing the temporary branch (with applied patch)
        //    against the original target branch (without the patch).
        //    This new diff will have updated line numbers and context.
        const diffResult = await execGit(repoRoot, ['diff', targetBranch, 'HEAD', '--patch', '--no-color', '--no-ext-diff', '--no-textconv']);
        newPatchContent = diffResult.stdout;

    } finally {
        // 7. Clean up: restore original branch and delete temporary branch
        await execGit(repoRoot, ['checkout', '-f', originalBranch]);
        try {
            await execGit(repoRoot, ['branch', '-D', tempBranchName]);
        } catch (cleanUpError: any) {
            console.warn(`Warning: Failed to delete temporary branch '${tempBranchName}'. Please delete it manually.`);
        }
    }

    // Check if the new patch content is effectively the same (no actual changes in diff)
    if (originalPatchContent.trim() === newPatchContent.trim()) {
        return `Patch '${patchFileName}' is already up-to-date. No offset update needed.`;
    }

    // Optional: Add purity check for new patch if desired, similar to --save
    // const newAnalysis = analyzeDiffContent(newPatchContent);
    // if (!newAnalysis.isPure) {
    //     // This might happen if the original patch was pure, but applying it to a new base
    //     // somehow resulted in a mixed diff due to complex context changes.
    //     // This is a stricter check.
    //     throw new Error(`Offset update failed: The re-generated patch for '${patchFileName}' is not pure.`);
    // }

    // 6. Overwrite the original .taylored file with the new, offset-adjusted diff.
    await fs.writeFile(absolutePatchFilePath, newPatchContent);

    return `Successfully updated offsets for '${patchFileName}' against branch '${targetBranch}'.`;
}

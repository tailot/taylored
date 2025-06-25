import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import { TAYLORED_DIR_NAME } from './constants';
import { analyzeDiffContent, parsePatchHunks, HunkHeaderInfo } from './utils';

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
 * Attempts to upgrade a .taylored patch file.
 * The upgrade is only performed if the new patch is "pure" (only additions or only deletions),
 * maintains the same hunk structure, and has different content.
 * @param patchFileName - The name of the patch file inside the .taylored directory.
 * @param repoRoot - The absolute path to the Git repository.
 * @param branchName - The optional base branch to compare against (defaults to 'main').
 * @returns An object indicating whether the patch was upgraded and a descriptive message.
 */
export async function upgradePatch(
    patchFileName: string,
    repoRoot: string,
    branchName?: string
): Promise<{ upgraded: boolean; message: string }> {
    const baseBranch = branchName || 'main';
    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    if (!await fs.pathExists(absolutePatchFilePath)) {
        throw new Error(`Patch file not found: ${absolutePatchFilePath}`);
    }

    const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
    const originalAnalysis = analyzeDiffContent(originalPatchContent);

    if (!originalAnalysis.isPure) {
        return { upgraded: false, message: `Patch '${patchFileName}' is not pure (contains mixed additions and deletions) and cannot be upgraded.` };
    }

    let newPatchContent: string;
    const tempBranchName = `temp/upgrade-check-${Date.now()}`;
    const originalBranch = (await execGit(repoRoot, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout;

    try {
        // This Git flow is necessary to correctly calculate the new diff against the current state.
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, baseBranch]);
        // Apply the patch to the temporary branch. Using --whitespace=fix to avoid potential issues.
        await execGit(repoRoot, ['apply', '--whitespace=fix', `"${absolutePatchFilePath}"`]);
        await execGit(repoRoot, ['add', '-A']);
        await execGit(repoRoot, ['commit', '--no-verify', '-m', 'Temp commit for upgrade check']);
        
        // Generate a new diff from the temporary commit.
        const diffResult = await execGit(repoRoot, ['diff', baseBranch, 'HEAD']);
        newPatchContent = diffResult.stdout;
    } catch (error: any) {
        // This block catches errors from the git commands, e.g., if the patch fails to apply.
        throw new Error(`Failed to generate a potential new patch. Git apply may have failed. ${error.message}`);
    } finally {
        // Clean up: switch back to the original branch and delete the temporary one.
        await execGit(repoRoot, ['checkout', '-f', originalBranch]);
        await execGit(repoRoot, ['branch', '-D', tempBranchName]);
    }

    if (originalPatchContent.trim() === newPatchContent.trim()) {
        return { upgraded: false, message: `Patch '${patchFileName}' is already up-to-date. No upgrade needed.` };
    }

    const newAnalysis = analyzeDiffContent(newPatchContent);
    // Ensure the new patch is also pure and of the same type (add/del).
    if (!newAnalysis.isPure || 
        (originalAnalysis.additions > 0 && newAnalysis.additions === 0) ||
        (originalAnalysis.deletions > 0 && newAnalysis.deletions === 0)) {
        return { upgraded: false, message: `Patch not upgraded: The update would change the patch from purely additive/deletive to mixed.` };
    }

    const originalHunks = parsePatchHunks(originalPatchContent);
    const newHunks = parsePatchHunks(newPatchContent);

    if (originalHunks.length !== newHunks.length) {
        return { upgraded: false, message: `Patch not upgraded: Number of hunks changed from ${originalHunks.length} to ${newHunks.length}.` };
    }

    // Check if the line counts within each hunk have changed.
    for (let i = 0; i < originalHunks.length; i++) {
        if (originalHunks[i].oldLines !== newHunks[i].oldLines || originalHunks[i].newLines !== newHunks[i].newLines) {
            return { upgraded: false, message: `Patch not upgraded: Line counts in hunk #${i + 1} have changed.` };
        }
    }

    // If all checks pass, overwrite the original patch file.
    await fs.writeFile(absolutePatchFilePath, newPatchContent);
    return { upgraded: true, message: `Patch '${patchFileName}' was successfully upgraded with new content.` };
}

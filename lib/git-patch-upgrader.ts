// lib/git-patch-upgrader.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import { TAYLORED_DIR_NAME } from './constants';
import { analyzeDiffContent, parsePatchHunks } from './utils';

const execAsync = util.promisify(exec);

async function execGit(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    // Adding quoting to handle paths with spaces
    const command = `git ${args.map(arg => arg.includes(' ') ? `"${arg}"` : arg).join(' ')}`;
    try {
        const { stdout, stderr } = await execAsync(command, { cwd: repoRoot });
        return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
        throw new Error(`Error executing git command: ${command}\n${error.stderr || error.message}`);
    }
}

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

    // Verify that the working directory is clean, it's a prerequisite for --3way
    const statusResult = await execGit(repoRoot, ['status', '--porcelain']);
    if (statusResult.stdout.trim() !== '') {
        throw new Error("Working directory must be clean to perform an upgrade. Please commit or stash your changes.");
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
        // Create a temporary branch from the base branch for the operation
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, baseBranch]);
        
        // Use `git apply --3way` to intelligently apply the obsolete patch.
        // This command attempts a 3-way merge if the patch does not apply directly.
        await execGit(repoRoot, ['apply', '--3way', absolutePatchFilePath]);
        
        await execGit(repoRoot, ['add', '-A']);
        await execGit(repoRoot, ['commit', '--no-verify', '-m', 'Temp commit for upgrade check']);
        
        const diffResult = await execGit(repoRoot, ['diff', baseBranch, 'HEAD']);
        newPatchContent = diffResult.stdout;
    } catch (error: any) { 
        // If --3way also fails, the patch is too divergent to be updated automatically.
        throw new Error(`Failed to generate a potential new patch. Git apply --3way may have failed, meaning the patch is too divergent to be upgraded automatically. ${error.message}`);
    } finally { 
        // Always cleans up, returning to the original branch and deleting the temporary one.
        await execGit(repoRoot, ['checkout', '-f', originalBranch]);
        await execGit(repoRoot, ['branch', '-D', tempBranchName]);
    }

    if (originalPatchContent.trim() === newPatchContent.trim()) {
        return { upgraded: false, message: `Patch '${patchFileName}' is already up-to-date. No upgrade needed.` };
    }

    const newAnalysis = analyzeDiffContent(newPatchContent);
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

    for (let i = 0; i < originalHunks.length; i++) {
        if (originalHunks[i].oldLines !== newHunks[i].oldLines || originalHunks[i].newLines !== newHunks[i].newLines) {
            return { upgraded: false, message: `Patch not upgraded: Line counts in hunk #${i + 1} have changed.` };
        }
    }

    await fs.writeFile(absolutePatchFilePath, newPatchContent);
    return { upgraded: true, message: `Patch '${patchFileName}' was successfully upgraded with new content.` };
}

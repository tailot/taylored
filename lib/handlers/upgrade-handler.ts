import { upgradePatch } from '../git-patch-upgrader';
import { resolveTayloredFileName } from '../utils';

/**
 * Handles the 'upgrade' command lifecycle.
 * It resolves the patch file name and calls the core upgrade logic,
 * handling any errors that occur during the process.
 * * @param userInputFileName - The file name provided by the user.
 * @param CWD - The current working directory, expected to be the repo root.
 * @param branchName - An optional branch name to use as the base for the upgrade.
 */
export async function handleUpgradeCommand(
    userInputFileName: string,
    CWD: string,
    branchName?: string
): Promise<void> {
    // Ensure the .taylored extension is present for consistency.
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

    try {
        const result = await upgradePatch(resolvedTayloredFileName, CWD, branchName);
        console.log(result.message); // Display the result message to the user.
    } catch (error: any) {
        // Provide a clear error message if the upgrade process fails.
        console.error(`\nCRITICAL ERROR: Failed to process upgrade for '${resolvedTayloredFileName}'.`);
        console.error(`  Error: ${error.message}`);
        process.exit(1);
    }
}

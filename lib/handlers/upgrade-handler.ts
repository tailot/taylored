// lib/handlers/upgrade-handler.ts
import { upgradePatch } from '../git-patch-upgrader';
import { resolveTayloredFileName } from '../utils';

export async function handleUpgradeCommand(
    userInputFileName: string,
    CWD: string,
    branchName?: string
): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

    try {
        const result = await upgradePatch(resolvedTayloredFileName, CWD, branchName);
        console.log(result.message);
    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: Failed to process upgrade for '${resolvedTayloredFileName}'.`);
        console.error(`  Error: ${error.message}`);
        process.exit(1);
    }
}

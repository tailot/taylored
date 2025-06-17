import * as path from 'path';
import { updatePatchOffsets } from '../git-patch-offset-updater';
import { resolveTayloredFileName } from '../utils';
import { TAYLORED_DIR_NAME } from '../constants';

/**
 * Handles the --offset command: updates patch offsets using the new logic.
 * @param userInputFileName The name of the .taylored file (without path).
 * @param CWD The current working directory (Git repository root).
 * @param branchName Optional branch name to calculate offset against.
 */
export async function handleOffsetCommand(userInputFileName: string, CWD: string, branchName?: string): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

    try {
        // Pass branchName to updatePatchOffsets. Custom commit message is no longer passed.
        const result = await updatePatchOffsets(resolvedTayloredFileName, CWD, undefined, branchName);
    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: Failed to update offsets for '${resolvedTayloredFileName}'.`);
        let message = error.message || 'An unknown error occurred during offset update.';
        console.error(`  Error: ${message}`);
        if (error.stderr) {
            console.error(`  Git STDERR details: ${error.stderr}`);
        }
        throw error;
    }
}

import * as path from 'path';
import { updatePatchOffsets } from '../git-patch-offset-updater';
import { resolveTayloredFileName } from '../utils';
import { TAYLORED_DIR_NAME } from '../constants';

/**
 * Handles the --offset command: updates patch offsets using the new logic.
 * @param userInputFileName The name of the .taylored file (without path).
 * @param CWD The current working directory (Git repository root).
 * @param customCommitMessage Optional custom commit message (will trigger a warning as it's unused).
 */
export async function handleOffsetCommand(userInputFileName: string, CWD: string, customCommitMessage?: string): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);
    
    try {
        const result = await updatePatchOffsets(resolvedTayloredFileName, CWD, customCommitMessage);

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

import * as fs from 'fs/promises';
import * as path from 'path';
import { extractMessageFromPatch } from '../utils';
import { resolveTayloredFileName } from '../utils';
import { TAYLORED_DIR_NAME } from '../constants';

/**
 * Handles the '--data' command: extracts and prints the commit message from a taylored file.
 * @param userInputFileName The name of the taylored file provided by the user.
 * @param CWD The current working directory (expected to be the Git repository root).
 */
export async function handleDataOperation(userInputFileName: string, CWD: string): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    const actualTayloredFilePath = path.join(tayloredDir, resolvedTayloredFileName);

    try {
        await fs.access(actualTayloredFilePath);
        const patchContent = await fs.readFile(actualTayloredFilePath, 'utf8');
        const message = extractMessageFromPatch(patchContent);
        process.stdout.write(message || "");
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found.`);
        } else {
            console.error(`CRITICAL ERROR: Failed to read or process taylored file '${actualTayloredFilePath}'. Details: ${error.message}`);
        }
        throw error;
    }
}

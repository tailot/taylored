import * as fs from 'fs/promises';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';

/**
 * Handles the --list operation: lists all .taylored files.
 * @param CWD The current working directory (Git repository root).
 */
export async function handleListOperation(CWD: string): Promise<void> {
    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
    console.log(`INFO: Listing ${TAYLORED_FILE_EXTENSION} files from '${tayloredDirPath}'...`);
    try {
        try {
            const stats = await fs.stat(tayloredDirPath);
            if (!stats.isDirectory()) {
                console.log(
                    `INFO: Expected '${TAYLORED_DIR_NAME}' to be a directory, but it's not (found at '${tayloredDirPath}').`
                );
                console.log('No taylored files to list.');
                return;
            }
        } catch (statError: any) {
            if (statError.code === 'ENOENT') {
                console.log(`INFO: Directory '${TAYLORED_DIR_NAME}' not found at '${tayloredDirPath}'.`);
                console.log('No taylored files to list.');
                return;
            }
            console.error(
                `CRITICAL ERROR: Could not access directory '${tayloredDirPath}'. Details: ${statError.message}`
            );
            throw statError;
        }

        const entries = await fs.readdir(tayloredDirPath);
        const tayloredFilesList: string[] = [];

        for (const entry of entries) {
            const entryPath = path.join(tayloredDirPath, entry);
            try {
                const entryStat = await fs.stat(entryPath);
                if (entryStat.isFile() && entry.endsWith(TAYLORED_FILE_EXTENSION)) {
                    tayloredFilesList.push(entry);
                }
            } catch (fileStatError: any) {
                console.warn(`WARN: Could not process entry '${entryPath}': ${fileStatError.message}`);
            }
        }

        if (tayloredFilesList.length === 0) {
            console.log(`INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}'.`);
        } else {
            console.log(`\nAvailable ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/':`);
            tayloredFilesList.sort().forEach((fileName) => {
                console.log(`  - ${fileName}`);
            });
        }
    } catch (error: any) {
        console.error(
            `CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`
        );
        throw error;
    }
}

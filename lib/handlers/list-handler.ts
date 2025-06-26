import * as fs from 'fs/promises';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';

/**
 * Implements the `taylored --list` command functionality.
 *
 * This function lists all Taylored patch files (files ending with `.taylored`)
 * found within the `.taylored/` directory in the specified current working directory (CWD).
 * It first checks for the existence and type of the `.taylored` directory.
 * If the directory exists and contains .taylored files, their names are sorted
 * alphabetically and printed to the console.
 * Informational messages are provided if the directory is missing, not a directory,
 * or contains no .taylored files.
 *
 * For more details on the `taylored --list` command, refer to `DOCUMENTATION.md`.
 *
 * @async
 * @function handleListOperation
 * @param {string} CWD - The current working directory. The function will look for the
 *                       `.taylored/` directory within this CWD.
 * @returns {Promise<void>} A promise that resolves when the listing operation is complete.
 *                          It does not return any value but prints output to the console.
 * @throws {Error} This function is designed to handle common issues like a missing
 *                 `.taylored` directory gracefully by printing messages to the console.
 *                 However, it might throw an error if there are unexpected issues with
 *                 file system permissions or other `fs.promises` errors not related to
 *                 the directory simply not existing (e.g., `EACCES` when trying to read
 *                 an existing directory).
 */
export async function handleListOperation(CWD: string): Promise<void> {
    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
    console.log(`INFO: Listing ${TAYLORED_FILE_EXTENSION} files from '${tayloredDirPath}'...`);

    try {
        // Check if .taylored directory exists and is a directory
        const stats = await fs.stat(tayloredDirPath).catch(statError => {
            if (statError.code === 'ENOENT') {
                // Directory does not exist - not an error for listing, just means no files.
                console.log(`INFO: Directory '${TAYLORED_DIR_NAME}' not found at '${tayloredDirPath}'.`);
                console.log("No taylored files to list.");
                return null; // Indicates handled case, no further processing needed.
            }
            // For other errors (e.g., permission issues), re-throw to be caught by outer catch.
            throw statError;
        });

        if (stats === null) return; // Exit if directory not found (handled above).

        if (!stats.isDirectory()) {
            console.log(`INFO: Expected '${TAYLORED_DIR_NAME}' to be a directory, but it's not (found at '${tayloredDirPath}').`);
            console.log("No taylored files to list.");
            return;
        }

        // Read directory contents
        const entries = await fs.readdir(tayloredDirPath);
        const tayloredFilesList: string[] = [];

        for (const entry of entries) {
            // Construct full path to check if it's a file
            const entryPath = path.join(tayloredDirPath, entry);
            try {
                const entryStat = await fs.stat(entryPath);
                // Filter for files ending with the specific extension
                if (entryStat.isFile() && entry.endsWith(TAYLORED_FILE_EXTENSION)) {
                    tayloredFilesList.push(entry);
                }
            } catch (fileStatError: any) {
                // Log a warning if a specific entry inside .taylored cannot be stated, but continue.
                console.warn(`WARN: Could not get information for entry '${entryPath}' inside '${TAYLORED_DIR_NAME}/'. Skipping. Error: ${fileStatError.message}`);
            }
        }

        if (tayloredFilesList.length === 0) {
            console.log(`INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}'.`);
        } else {
            console.log(`\nAvailable ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/':`);
            // Sort files alphabetically for consistent output
            tayloredFilesList.sort().forEach(fileName => {
                console.log(`  - ${fileName}`);
            });
        }
    } catch (error: any) {
        // This catch block now primarily handles unexpected errors from fs.stat (if not ENOENT),
        // fs.readdir, or other unhandled exceptions during the process.
        console.error(`CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`);
        // Depending on CLI design, you might want to re-throw or process.exit(1)
        throw error;
    }
}

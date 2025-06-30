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
 * @param {string} CWD - The current working directory, expected to be the root of a
 *                       Git repository where Taylored operations are performed. The
 *                       `.taylored/` directory is expected to be a direct child of CWD.
 * @returns {Promise<void>} A promise that resolves when the listing operation is complete.
 * @throws {Error} Throws an error if there's an issue accessing the `.taylored`
 *                 directory (other than it not existing or not being a directory,
 *                 which are handled gracefully) or if reading its contents fails.
 */
export async function handleListOperation(CWD: string): Promise<void> {
  const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
  console.log(
    `INFO: Listing ${TAYLORED_FILE_EXTENSION} files from '${tayloredDirPath}'...`,
  );
  try {
    try {
      const stats = await fs.stat(tayloredDirPath);
      if (!stats.isDirectory()) {
        console.log(
          `INFO: Expected '${TAYLORED_DIR_NAME}' to be a directory, but it's not (found at '${tayloredDirPath}').`,
        );
        console.log('No taylored files to list.');
        return;
      }
    } catch (statError: any) {
      if (statError.code === 'ENOENT') {
        console.log(
          `INFO: Directory '${TAYLORED_DIR_NAME}' not found at '${tayloredDirPath}'.`,
        );
        console.log('No taylored files to list.');
        return;
      }
      console.error(
        `CRITICAL ERROR: Could not access directory '${tayloredDirPath}'. Details: ${statError.message}`,
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
        console.warn(
          `WARN: Could not process entry '${entryPath}': ${fileStatError.message}`,
        );
      }
    }

    if (tayloredFilesList.length === 0) {
      console.log(
        `INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}'.`,
      );
    } else {
      console.log(
        `\nAvailable ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/':`,
      );
      tayloredFilesList.sort().forEach((fileName) => {
        console.log(`  - ${fileName}`);
      });
    }
  } catch (error: any) {
    console.error(
      `CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`,
    );
    throw error;
  }
}

import * as fs from 'fs/promises';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';

/**
 * Recursively prints the directory tree for .taylored files.
 * @param dir The directory to scan.
 * @param prefix Prefix for printing the tree structure.
 * @param isLast Boolean indicating if the current entry is the last in its parent directory.
 */
async function printDirectoryTree(
  dir: string,
  prefix: string,
): Promise<boolean> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      // This specific path segment doesn't exist, might happen if called on a non-dir initially.
      // This case should be handled by the caller (handleListOperation)
      return false;
    }
    console.error(
      `CRITICAL ERROR: Could not read directory '${dir}'. Details: ${error.message}`,
    );
    throw error; // Propagate other errors
  }

  // Separate directories and files, then sort them
  const dirs = entries
    .filter((e) => e.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name));
  const files = entries
    .filter((e) => e.isFile() && e.name.endsWith(TAYLORED_FILE_EXTENSION))
    .sort((a, b) => a.name.localeCompare(b.name));
  const sortedEntries = [...dirs, ...files];

  let foundTayloredFiles = false;

  for (let i = 0; i < sortedEntries.length; i++) {
    const entry = sortedEntries[i];
    const isLastEntry = i === sortedEntries.length - 1;
    const connector = isLastEntry ? '└── ' : '├── ';
    const entryPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      console.log(`${prefix}${connector}📁 ${entry.name}/`);
      const subDirPrefix = prefix + (isLastEntry ? '    ' : '│   ');
      // Recursively call and update foundTayloredFiles if any taylored files are found in subdirectories
      if (await printDirectoryTree(entryPath, subDirPrefix)) {
        foundTayloredFiles = true;
      }
    } else if (entry.isFile() && entry.name.endsWith(TAYLORED_FILE_EXTENSION)) {
      console.log(`${prefix}${connector}📄 ${entry.name}`);
      foundTayloredFiles = true;
    }
  }
  return foundTayloredFiles;
}

/**
 * Implements the `taylored --list` command functionality.
 *
 * This function lists all Taylored patch files (files ending with `.taylored`)
 * found within the `.taylored/` directory in the specified current working directory (CWD),
 * displaying them in a hierarchical tree structure.
 *
 * For more details on the `taylored --list` command, refer to `DOCUMENTATION.md`.
 *
 * @async
 * @param {string} CWD - The current working directory, expected to be the root of a
 *                       Git repository where Taylored operations are performed. The
 *                       `.taylored/` directory is expected to be a direct child of CWD.
 * @returns {Promise<void>} A promise that resolves when the listing operation is complete.
 * @throws {Error} Throws an error if there's an issue accessing the `.taylored`
 *                 directory (other than it not existing, which is handled gracefully)
 *                 or if reading its contents fails.
 */
export async function handleListOperation(CWD: string): Promise<void> {
  const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
  console.log(`INFO: Listing contents of '${tayloredDirPath}'...\n`);

  try {
    const stats = await fs.stat(tayloredDirPath);
    if (!stats.isDirectory()) {
      console.log(
        `INFO: Expected '${TAYLORED_DIR_NAME}' to be a directory, but it's not (found at '${tayloredDirPath}').`,
      );
      console.log('No taylored files or directories to list.');
      return;
    }
  } catch (statError: any) {
    if (statError.code === 'ENOENT') {
      console.log(
        `INFO: Directory '${TAYLORED_DIR_NAME}' not found at '${tayloredDirPath}'.`,
      );
      console.log('No taylored files or directories to list.');
      return;
    }
    console.error(
      `CRITICAL ERROR: Could not access directory '${tayloredDirPath}'. Details: ${statError.message}`,
    );
    throw statError;
  }

  console.log(`📁 ${TAYLORED_DIR_NAME}/`);
  const foundAnyTayloredFiles = await printDirectoryTree(tayloredDirPath, '');

  // If the directory was empty and printDirectoryTree found nothing, add the "(empty)" marker.
  // printDirectoryTree itself won't print "(empty)" for the root.
  if (!foundAnyTayloredFiles) {
    try {
      const entries = await fs.readdir(tayloredDirPath);
      if (entries.length === 0) {
        console.log('  └── (empty)'); // Only show if truly empty and printDirectoryTree confirms no taylored files
      }
    } catch (e) {
      // Should not happen if initial stat succeeded, but good to be safe.
      // Error reading directory for the "(empty)" check, but printDirectoryTree might have worked or failed.
      // The foundAnyTayloredFiles flag will determine the next message.
    }
  }

  if (!foundAnyTayloredFiles) {
    // This message is displayed if printDirectoryTree did not find/print any .taylored files.
    console.log(
      `\nINFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}' or its subdirectories.`,
    );
  }
}

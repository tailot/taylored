// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { TAYLORED_DIR_NAME } from '../constants';

/**
 * Recursively finds files with a specific extension within a directory, respecting exclusions.
 *
 * It traverses the directory structure starting from `dir`.
 * Directories named ".git" or ".taylored" are always excluded.
 * Additional directories can be excluded via the `excludeDirs` parameter.
 *
 * @async
 * @param {string} dir - The starting directory for the recursive search (should be absolute).
 * @param {string} ext - The file extension to search for (e.g., ".js", ".ts").
 * @param {string[]} allFiles - An accumulator array holding the paths of found files.
 *                              Typically initialized as an empty array by the caller.
 * @param {string[]} [excludeDirs] - An optional array of directory names or relative paths
 *                                   (from CWD_ABS) to exclude from the search.
 * @param {string} [CWD_ABS] - The absolute path to the current working directory (CWD).
 *                             Used to correctly resolve relative paths for `excludeDirs`
 *                             and ensure consistent behavior.
 * @returns {Promise<string[]>} A promise that resolves to an array of absolute file paths
 *                              matching the extension and exclusion criteria.
 * @throws {Error} If `fs.readdir` fails for a directory.
 */
export async function findFilesRecursive(
    dir: string,
    ext: string,
    allFiles: string[] = [],
    excludeDirs?: string[],
    CWD_ABS?: string
): Promise<string[]> {
    if (!path.isAbsolute(dir)) {
        // Ensure 'dir' is absolute for reliable relative path calculations.
        // This case should ideally not be hit if called correctly from handleAutomaticOperation
        // which resolves CWD to CWD_ABS.
        console.warn(`Warning: findFilesRecursive called with relative directory: ${dir}. Resolving against CWD_ABS or process.cwd().`);
        dir = CWD_ABS ? path.resolve(CWD_ABS, dir) : path.resolve(dir);
    }
    const currentCwdAbs = CWD_ABS || process.cwd(); // Fallback if CWD_ABS is not provided

    let entries;
    try {
        entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (err: any) {
        console.warn(`Warning: Could not read directory ${dir}: ${err.message}. Skipping.`);
        return allFiles; // Return accumulated files so far
    }

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const relativePathFromCwd = path.relative(currentCwdAbs, fullPath);

            // Standard exclusions
            if (entry.name === '.git' || entry.name === TAYLORED_DIR_NAME) {
                continue;
            }

            // Check against user-provided excludeDirs
            if (excludeDirs && excludeDirs.some(excludedDir => {
                const normalizedExcludedDir = path.normalize(excludedDir);
                // Check for exact match or if fullPath starts with the excludedDir (as a directory)
                return relativePathFromCwd === normalizedExcludedDir || relativePathFromCwd.startsWith(normalizedExcludedDir + path.sep);
            })) {
                continue;
            }
            // Recursively search if not excluded
            await findFilesRecursive(fullPath, ext, allFiles, excludeDirs, currentCwdAbs);
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            allFiles.push(fullPath);
        }
    }
    return allFiles;
}

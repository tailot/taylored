// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';

async function findFilesRecursive(dir: string, ext: string, allFiles: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            // Exclude common directories like .git, node_modules, and .taylored itself
            if (entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== TAYLORED_DIR_NAME) {
                await findFilesRecursive(fullPath, ext, allFiles);
            }
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            allFiles.push(fullPath);
        }
    }
    return allFiles;
}

export async function handleAutomaticOperation(extension: string, CWD: string): Promise<void> {
    console.log(`Starting automatic taylored block search for extension '${extension}' in directory '${CWD}'...`);

    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
    try {
        await fs.mkdir(tayloredDirPath, { recursive: true });
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Could not create directory '${tayloredDirPath}'. Details: ${error.message}`);
        process.exit(1);
    }

    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    let filesFound: string[];
    try {
        filesFound = await findFilesRecursive(CWD, normalizedExtension);
    } catch (error: any) {
        console.error(`Error while searching for files: ${error.message}`);
        return;
    }

    if (filesFound.length === 0) {
        console.log(`No files found with extension: ${normalizedExtension}`);
        return;
    }

    console.log(`Found ${filesFound.length} file(s) with extension '${normalizedExtension}'. Processing...`);

    const blockRegex = /<taylored (\d+)>([\s\S]*?)<taylored>/g;
    let tayloredBlocksFoundCount = 0;

    for (const filePath of filesFound) {
        try {
            const fileContent = await fs.readFile(filePath, 'utf-8');
            let match;
            const originalFileName = path.basename(filePath, normalizedExtension);

            while ((match = blockRegex.exec(fileContent)) !== null) {
                tayloredBlocksFoundCount++;
                const numero = match[1];
                const content = match[2].trim();

                const outputFileName = `${originalFileName}_taylored_${numero}${TAYLORED_FILE_EXTENSION}`;
                const outputFilePath = path.join(tayloredDirPath, outputFileName);

                try {
                    await fs.writeFile(outputFilePath, content);
                    console.log(`Created taylored file: ${path.join(TAYLORED_DIR_NAME, outputFileName)}`);
                } catch (writeError: any) {
                    console.error(`Error writing taylored file '${outputFilePath}': ${writeError.message}`);
                }
            }
        } catch (readError: any) {
            console.error(`Error reading file '${filePath}': ${readError.message}`);
            // Continue to the next file if one file cannot be read
        }
    }

    if (tayloredBlocksFoundCount === 0) {
        console.log("No taylored blocks found in the scanned files.");
    } else {
        console.log(`Finished processing. Found and created ${tayloredBlocksFoundCount} taylored file(s).`);
    }
}

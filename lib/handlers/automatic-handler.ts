// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleSaveOperation } from './save-handler';

const execOpts: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

async function findFilesRecursive(dir: string, ext: string, allFiles: string[] = []): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== '.git' && entry.name !== 'node_modules' && entry.name !== TAYLORED_DIR_NAME) {
                await findFilesRecursive(fullPath, ext, allFiles);
            }
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            allFiles.push(fullPath);
        }
    }
    return allFiles;
}

export async function handleAutomaticOperation(extensionsInput: string, branchName: string, CWD: string): Promise<void> {
    let originalBranchName: string;
    try {
        originalBranchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
        if (originalBranchName === 'HEAD') { 
            const errorMessage = "CRITICAL ERROR: Repository is in a detached HEAD state. Please checkout a branch.";
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Failed to get current Git branch. Details: ${error.message}`;
        console.error(errorMessage);
        if (error.stderr) console.error("STDERR:\n" + error.stderr);
        if (error.stdout) console.error("STDOUT:\n" + error.stdout);
        throw new Error(errorMessage);
    }

    try {
        const gitStatus = execSync('git status --porcelain', { cwd: CWD, ...execOpts }).trim();
        if (gitStatus) {
            const errorMessage = "CRITICAL ERROR: Uncommitted changes or untracked files in the repository. Please commit or stash them before running --automatic.";
            console.error(errorMessage);
            console.error("Details:\n" + gitStatus);
            throw new Error(errorMessage);
        }
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Failed to check Git status. Details: ${error.message}`;
        console.error(errorMessage);
        if (error.stderr) console.error("STDERR:\n" + error.stderr);
        if (error.stdout) console.error("STDOUT:\n" + error.stdout);
        throw new Error(errorMessage);
    }

    console.log(`Starting automatic taylored block extraction for extensions '${extensionsInput}' in directory '${CWD}'. Original branch: '${originalBranchName}'`);

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    try {
        await fs.mkdir(tayloredDir, { recursive: true });
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Could not create directory '${tayloredDir}'. Details: ${error.message}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const extensions = extensionsInput.split(',').map(ext => ext.trim());
    const allFilesToScan: string[] = [];

    for (const ext of extensions) {
        const normalizedExtension = ext.startsWith('.') ? ext : `.${ext}`;
        try {
            const filesForExtension = await findFilesRecursive(CWD, normalizedExtension);
            allFilesToScan.push(...filesForExtension);
        } catch (error: any) {
            console.error(`Error while searching for files with extension '${normalizedExtension}': ${error.message}`);
            // Decide if you want to continue with other extensions or return
        }
    }

    if (allFilesToScan.length === 0) {
        console.log(`No files found with specified extensions: ${extensionsInput}`);
        return;
    }

    console.log(`Found ${allFilesToScan.length} file(s) with specified extensions. Processing...`);

    const blockRegex = /<taylored (\d+)>([\s\S]*?)<\/taylored>/g;
    let totalBlocksProcessed = 0;

    for (const originalFilePath of allFilesToScan) {
        let fileContent: string;
        try {
            fileContent = await fs.readFile(originalFilePath, 'utf-8');
        } catch (readError: any) {
            console.warn(`Warning: Error reading file '${originalFilePath}': ${readError.message}. Skipping this file.`);
            continue;
        }

        const matches = Array.from(fileContent.matchAll(blockRegex));
        if (matches.length === 0) {
            continue;
        }

        for (const match of matches) {
            const numero = match[1];
            const fullMatchText = match[0];
            const targetTayloredFileName = `${numero}${TAYLORED_FILE_EXTENSION}`;
            const targetTayloredFilePath = path.join(tayloredDir, targetTayloredFileName);
            const intermediateMainTayloredPath = path.join(tayloredDir, `main${TAYLORED_FILE_EXTENSION}`);

            console.log(`Processing block ${numero} from ${originalFilePath}...`);
            try {
                await fs.access(intermediateMainTayloredPath);
                const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} already exists. Please remove or rename it.`;
                console.error(message);
                throw new Error(message);
            } catch (error: any) {
                if (error.code !== 'ENOENT') {
                    throw error; 
                }
            }

            try {
                await fs.access(targetTayloredFilePath);
                const message = `CRITICAL ERROR: Target file ${targetTayloredFilePath} already exists. Please remove or rename it.`;
                console.error(message);
                throw new Error(message);
            } catch (error: any) {
                if (error.code !== 'ENOENT') {
                    throw error;
                }
            }
            
            const fileLines = fileContent.split('\n');
            const contentUpToMatch = fileContent.substring(0, match.index);
            const startLineNum = contentUpToMatch.split('\n').length; 
            const matchLinesCount = fullMatchText.split('\n').length;
            const tempBranchName = `temp-taylored-${numero}-${Date.now()}`;
            
            try {
                execSync(`git checkout -b ${tempBranchName}`, { cwd: CWD, ...execOpts });
                const currentFileLines = (await fs.readFile(originalFilePath, 'utf-8')).split('\n');
                currentFileLines.splice(startLineNum - 1, matchLinesCount); 
                await fs.writeFile(originalFilePath, currentFileLines.join('\n'));
                execSync(`git add "${originalFilePath}"`, { cwd: CWD, ...execOpts });
                execSync(`git commit -m "Temporary: Remove block ${numero} from ${path.basename(originalFilePath)}"`, { cwd: CWD, ...execOpts });
                await handleSaveOperation(branchName, CWD);
                await fs.rename(intermediateMainTayloredPath, targetTayloredFilePath);
                console.log(`Successfully created ${targetTayloredFilePath} for block ${numero} from ${originalFilePath}`);
                totalBlocksProcessed++;
            } catch (error: any) {
                console.error(`CRITICAL ERROR: Failed to process block ${numero} from ${originalFilePath}.`);
                console.error(`Error message: ${error.message}`);
                if (error.stderr) console.error("STDERR:\n" + error.stderr);
                if (error.stdout) console.error("STDOUT:\n" + error.stdout);
                throw error; 
            } finally {
                try {
                    execSync(`git checkout "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                } catch (checkoutError: any) {
                    console.warn(`Warning: Failed to checkout original branch '${originalBranchName}' during cleanup. May require manual cleanup. ${checkoutError.message}`);
                }
                try {
                    execSync(`git branch -D "${tempBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                } catch (deleteBranchError: any) {
                    console.warn(`Warning: Failed to delete temporary branch '${tempBranchName}' during cleanup. May require manual cleanup. ${deleteBranchError.message}`);
                }
                try {
                    await fs.access(intermediateMainTayloredPath); 
                    await fs.unlink(intermediateMainTayloredPath);
                } catch (e) { /* File doesn't exist or can't be accessed, ignore */ }
            }
        }
    }

    if (totalBlocksProcessed === 0) {
        console.log("No taylored blocks found matching the criteria in any of the scanned files.");
    } else {
        console.log(`Finished processing. Successfully created ${totalBlocksProcessed} taylored file(s).`);
    }
}

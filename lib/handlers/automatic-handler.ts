// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleSaveOperation } from './save-handler'; // Ensure this path is correct

const execOpts: ExecSyncOptionsWithBufferEncoding = { encoding: 'utf8', stdio: 'pipe' };

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

export async function handleAutomaticOperation(extension: string, CWD: string): Promise<void> {
    let originalBranchName: string;
    try {
        originalBranchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
        if (originalBranchName === 'HEAD') { // Detached HEAD state
            console.error("CRITICAL ERROR: Repository is in a detached HEAD state. Please checkout a branch.");
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Failed to get current Git branch. Details: ${error.message}`);
        if (error.stderr) console.error("STDERR:\n" + error.stderr);
        if (error.stdout) console.error("STDOUT:\n" + error.stdout);
        process.exit(1);
    }

    try {
        const gitStatus = execSync('git status --porcelain', { cwd: CWD, ...execOpts }).trim();
        if (gitStatus) {
            console.error("CRITICAL ERROR: Uncommitted changes or untracked files in the repository. Please commit or stash them before running --automatic.");
            console.error("Details:\n" + gitStatus);
            process.exit(1);
        }
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Failed to check Git status. Details: ${error.message}`);
        if (error.stderr) console.error("STDERR:\n" + error.stderr);
        if (error.stdout) console.error("STDOUT:\n" + error.stdout);
        process.exit(1);
    }

    console.log(`Starting automatic taylored block extraction for extension '${extension}' in directory '${CWD}'. Original branch: '${originalBranchName}'`);

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    try {
        await fs.mkdir(tayloredDir, { recursive: true });
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Could not create directory '${tayloredDir}'. Details: ${error.message}`);
        process.exit(1);
    }

    const normalizedExtension = extension.startsWith('.') ? extension : `.${extension}`;
    let filesToScan: string[];
    try {
        filesToScan = await findFilesRecursive(CWD, normalizedExtension);
    } catch (error: any) {
        console.error(`Error while searching for files: ${error.message}`);
        return;
    }

    if (filesToScan.length === 0) {
        console.log(`No files found with extension: ${normalizedExtension}`);
        return;
    }

    console.log(`Found ${filesToScan.length} file(s) with extension '${normalizedExtension}'. Processing...`);

    const blockRegex = /<taylored (\d+)>([\s\S]*?)<taylored>/g;
    let totalBlocksProcessed = 0;
    let aBlockFailed = false;

    for (const originalFilePath of filesToScan) {
        if (aBlockFailed) break; 
        let fileContent: string;
        try {
            fileContent = await fs.readFile(originalFilePath, 'utf-8');
        } catch (readError: any) {
            console.error(`Error reading file '${originalFilePath}': ${readError.message}. Skipping this file.`);
            continue;
        }

        const matches = Array.from(fileContent.matchAll(blockRegex));

        for (const match of matches) {
            if (aBlockFailed) break;

            const numero = match[1];
            const fullMatchText = match[0];

            const targetTayloredFileName = `${numero}${TAYLORED_FILE_EXTENSION}`;
            const targetTayloredFilePath = path.join(tayloredDir, targetTayloredFileName);
            
            // Define the path for the intermediate file that handleSaveOperation('main', CWD) will create
            const intermediateMainTayloredPath = path.join(tayloredDir, `main${TAYLORED_FILE_EXTENSION}`);

            console.log(`Processing block ${numero} from ${originalFilePath}...`);

            // Pre-operation Check 1 (intermediate file from save-handler)
            try {
                await fs.access(intermediateMainTayloredPath);
                console.error(`CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} already exists. Please remove or rename it before running --automatic.`);
                aBlockFailed = true; break; 
            } catch (error) { /* File does not exist, which is good */ }

            // Pre-operation Check 2 (target file)
            try {
                await fs.access(targetTayloredFilePath);
                console.error(`CRITICAL ERROR: Target file ${targetTayloredFilePath} already exists. Please remove or rename it.`);
                aBlockFailed = true; break;
            } catch (error) { /* File does not exist, good */ }

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

                // HEAD is tempBranchName. Diff HEAD against 'main' branch.
                await handleSaveOperation('main', CWD); 
                // This creates `.taylored/main.taylored`

                await fs.rename(intermediateMainTayloredPath, targetTayloredFilePath);

                console.log(`Successfully created ${targetTayloredFilePath} for block ${numero} from ${originalFilePath}`);
                totalBlocksProcessed++;

            } catch (error: any) {
                aBlockFailed = true;
                console.error(`CRITICAL ERROR: Failed to process block ${numero} from ${originalFilePath}.`);
                console.error(`Error message: ${error.message}`);
                if (error.stderr) console.error("STDERR:\n" + error.stderr);
                if (error.stdout) console.error("STDOUT:\n" + error.stdout);
            } finally {
                try {
                    execSync(`git checkout "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                } catch (checkoutError: any) {}
                try {
                    execSync(`git branch -D "${tempBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                } catch (deleteBranchError: any) {}
                try {
                    // Ensure we attempt to clean the correct intermediate file name
                    await fs.access(intermediateMainTayloredPath); 
                    await fs.unlink(intermediateMainTayloredPath);
                } catch (e) { /* File doesn't exist or can't be accessed, ignore */ }

                if (aBlockFailed) {
                     console.error("Processing stopped due to critical error.");
                     process.exit(1);
                }
            }
        }
    }

    if (aBlockFailed) {
        console.error("Automatic block processing finished with one or more errors.");
    } else if (totalBlocksProcessed === 0) {
        console.log("No taylored blocks found matching the criteria in any of the scanned files.");
    } else {
        console.log(`Finished processing. Successfully created ${totalBlocksProcessed} taylored file(s).`);
    }
}

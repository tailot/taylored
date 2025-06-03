// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleSaveOperation } from './save-handler';

const execOpts: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

async function findFilesRecursive(
    dir: string,
    ext: string,
    allFiles: string[] = [],
    excludeDirs?: string[],
    CWD_ABS?: string // Absolute path to CWD for reliable relative path checking
): Promise<string[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            const relativePath = CWD_ABS ? path.relative(CWD_ABS, fullPath) : entry.name;
            if (entry.name !== '.git' &&
                entry.name !== TAYLORED_DIR_NAME &&
                (!excludeDirs || !excludeDirs.some(excludedDir => relativePath === excludedDir || relativePath.startsWith(excludedDir + path.sep)))
            ) {
                await findFilesRecursive(fullPath, ext, allFiles, excludeDirs, CWD_ABS);
            }
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            allFiles.push(fullPath);
        }
    }
    return allFiles;
}

export async function handleAutomaticOperation(
    extensionsInput: string,
    branchName: string,
    CWD: string,
    excludeDirs?: string[]
): Promise<void> {
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
    const CWD_ABS = path.resolve(CWD); // Resolve CWD to an absolute path

    for (const ext of extensions) {
        const normalizedExtension = ext.startsWith('.') ? ext : `.${ext}`;
        try {
            // Pass excludeDirs and CWD_ABS to findFilesRecursive
            const filesForExtension = await findFilesRecursive(CWD_ABS, normalizedExtension, [], excludeDirs, CWD_ABS);
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

    // Regex explained:
    // <taylored\s+(\d+) : Matches "<taylored " and captures the number (numero, match[1])
    // (?: ... )? : Optional group for the compute attribute
    //   (?:\s+compute="([^"]*)") : Matches compute="<value>" (value in match[2])
    //   |                          : OR
    //   (?:\s+compute='([^']*)') : Matches compute='<value>' (value in match[3])
    // > : Matches the closing > of the opening tag
    // ([\s\S]*?) : Captures the content between tags (scriptContent, match[4])
    // <\/taylored> : Matches the closing </taylored>
    const blockRegex = /<taylored\s+(\d+)(?:(?:\s+compute="([^"]*)")|(?:\s+compute='([^']*)'))?>([\s\S]*?)<\/taylored>/g;
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
            const computeValueDouble = match[2];
            const computeValueSingle = match[3];
            const computeCharsToStrip = computeValueDouble || computeValueSingle; // Value of compute attribute
            const scriptContentWithTags = match[0]; // Full matched string <taylored...>...</taylored>
            const scriptContent = match[4]; // Content between tags
            const targetTayloredFileName = `${numero}${TAYLORED_FILE_EXTENSION}`;
            const targetTayloredFilePath = path.join(tayloredDir, targetTayloredFileName);
            const intermediateMainTayloredPath = path.join(tayloredDir, `main${TAYLORED_FILE_EXTENSION}`);

            console.log(`Processing block ${numero} from ${originalFilePath}...`);

            if (computeCharsToStrip !== undefined) {
                // Handle compute attribute logic
                // Ensure targetTayloredFilePath does not exist before processing
                try {
                    await fs.access(targetTayloredFilePath);
                    const message = `CRITICAL ERROR: Target file ${targetTayloredFilePath} for computed block already exists. Please remove or rename it.`;
                    console.error(message);
                    throw new Error(message);
                } catch (error: any) {
                    if (error.code !== 'ENOENT') { // If it's any error other than "file not found", re-throw.
                        throw error;
                    }
                }
                // Ensure intermediateMainTayloredPath does not exist for compute, as it's not used.
                try {
                    await fs.access(intermediateMainTayloredPath);
                    // If it exists, it's an issue, perhaps from a previous failed run or misuse.
                    const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} exists for a compute block. This file should not be present. Please remove or rename it.`;
                    console.error(message);
                    throw new Error(message);
                } catch (error: any) {
                     if (error.code !== 'ENOENT') { // If it's any error other than "file not found", re-throw.
                        throw error;
                    }
                }


                // Ensure computeCharsToStrip is defined and not empty
                if (!computeCharsToStrip || computeCharsToStrip.trim() === "") {
                    console.warn(`Warning: compute attribute for block ${numero} in ${originalFilePath} is empty or missing. Skipping execution.`);
                    continue; // or throw error, based on desired behavior
                }

                const actualScriptContent = computeCharsToStrip; // Use the value of the compute attribute directly

                const tempScriptPath = path.join(CWD, `taylored-temp-script-${Date.now()}.js`);
                await fs.writeFile(tempScriptPath, actualScriptContent);

                let scriptResult = '';
                try {
                    scriptResult = execSync(`node "${tempScriptPath}"`, { cwd: CWD, encoding: 'utf8' }).replace(/\r?\n$/, '');
                } catch (execError: any) {
                    console.error(`ERROR: Script execution failed for block ${numero} in ${originalFilePath}. Error: ${execError.message}`);
                    // Decide if to throw, continue, or how to handle script errors
                    // For now, let's let it throw to stop the process for this block
                    throw execError;
                } finally {
                    await fs.unlink(tempScriptPath); // Clean up temp script file
                }

                const originalFileContent = await fs.readFile(originalFilePath, 'utf-8');
                const modifiedFileContent = originalFileContent.replace(scriptContentWithTags, scriptResult);

                const tempOriginalFilePath = path.join(CWD, `taylored-temp-original-${numero}-${Date.now()}.${path.extname(originalFilePath).slice(1)}`);
                const tempModifiedFilePath = path.join(CWD, `taylored-temp-modified-${numero}-${Date.now()}.${path.extname(originalFilePath).slice(1)}`);

                await fs.writeFile(tempOriginalFilePath, originalFileContent);
                await fs.writeFile(tempModifiedFilePath, modifiedFileContent);

                const diffCommand = `git diff --no-index --no-prefix "${tempOriginalFilePath}" "${tempModifiedFilePath}"`;
                try {
                    const diffOutput = execSync(diffCommand, { cwd: CWD, encoding: 'utf8' });
                    await fs.writeFile(targetTayloredFilePath, diffOutput);
                    console.log(`Successfully created ${targetTayloredFilePath} for computed block ${numero} from ${originalFilePath}`);
                    totalBlocksProcessed++;
                } catch (diffError: any) {
                    // If git diff returns exit code 1, it means there are differences.
                    // For other exit codes, it's an error.
                    if (diffError.status === 1 && diffError.stdout) {
                         await fs.writeFile(targetTayloredFilePath, diffError.stdout); // Save the diff output
                         console.log(`Successfully created ${targetTayloredFilePath} for computed block ${numero} from ${originalFilePath} (diff with changes)`);
                         totalBlocksProcessed++;
                    } else if (diffError.status === 0) { // No differences
                         await fs.writeFile(targetTayloredFilePath, ""); // Write empty diff
                         console.log(`No difference found for computed block ${numero} from ${originalFilePath}. Empty taylored file created: ${targetTayloredFilePath}`);
                         totalBlocksProcessed++;
                    }
                    else {
                        console.error(`CRITICAL ERROR: Failed to generate diff for computed block ${numero} from ${originalFilePath}.`);
                        console.error(`Error message: ${diffError.message}`);
                        if (diffError.stderr) console.error("STDERR:\n" + diffError.stderr);
                        if (diffError.stdout) console.error("STDOUT:\n" + diffError.stdout);
                        throw diffError;
                    }
                } finally {
                    await fs.unlink(tempOriginalFilePath);
                    await fs.unlink(tempModifiedFilePath);
                }
            } else {
                // Existing non-compute logic - wrapped correctly now
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
                const matchLinesCount = scriptContentWithTags.split('\n').length; // Use scriptContentWithTags here
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
            } // This closes the `if (computeCharsToStrip === undefined)` block
        }
    }

    if (totalBlocksProcessed === 0) {
        console.log("No taylored blocks found matching the criteria in any of the scanned files.");
    } else {
        console.log(`Finished processing. Successfully created ${totalBlocksProcessed} taylored file(s).`);
    }
}

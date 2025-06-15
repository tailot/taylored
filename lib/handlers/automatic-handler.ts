// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding, spawn } from 'child_process';
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

    const blockRegex = /[^\n]*?<taylored\s+number=["'](\d+)["']([^>]*)>([\s\S]*?)[^\n]*?<\/taylored>/g;
    let totalBlocksProcessed = 0;
    const asyncScriptPromises: Promise<void>[] = [];

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
            const attributesString = match[2];
            const scriptContentWithTags = match[0]; // Full matched string <taylored...>...</taylored>
            const scriptContent = match[3]; // Content between tags

            const computeMatch = attributesString.match(/compute=["']([^"']*)["']/);
            const computeCharsToStrip = computeMatch ? computeMatch[1] : undefined;

            const asyncMatch = attributesString.match(/async=["'](true|false)["']/);
            const asyncFlag = asyncMatch ? asyncMatch[1] === 'true' : false;

            const targetTayloredFileName = `${numero}${TAYLORED_FILE_EXTENSION}`;
            const targetTayloredFilePath = path.join(tayloredDir, targetTayloredFileName);
            const intermediateMainTayloredPath = path.join(tayloredDir, `main${TAYLORED_FILE_EXTENSION}`);

            console.log(`Processing block ${numero} from ${originalFilePath}...`);

            if (computeCharsToStrip !== undefined) {
                const processComputeBlock = async (
                    currentNumero: string,
                    currentOriginalFilePath: string,
                    currentScriptContent: string,
                    currentComputeCharsToStrip: string,
                    currentScriptContentWithTags: string,
                    currentCWD: string,
                    currentBranchName: string,
                    currentOriginalBranchName: string,
                    currentTargetTayloredFilePath: string
                ): Promise<void> => {
                    console.log(`Asynchronously processing computed block ${currentNumero} from ${currentOriginalFilePath}...`);
                    // Ensure targetTayloredFilePath does not exist before processing
                    try {
                        await fs.access(currentTargetTayloredFilePath);
                        const message = `CRITICAL ERROR: Target file ${currentTargetTayloredFilePath} for computed block already exists. Please remove or rename it.`;
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
                        // istanbul ignore next
                        const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} exists for a compute block. This file should not be present. Please remove or rename it.`;
                        console.error(message);
                        throw new Error(message);
                    } catch (error: any) {
                         if (error.code !== 'ENOENT') { // If it's any error other than "file not found", re-throw.
                            throw error;
                        }
                    }

                    let actualScriptContent: string;
                    if (currentComputeCharsToStrip.length > 0) {
                        let processedContent = currentScriptContent.trim();
                        const patterns = currentComputeCharsToStrip.split(',');
                        for (const pattern of patterns) {
                            const trimmedPattern = pattern.trim();
                            if (trimmedPattern.length > 0) {
                                processedContent = processedContent.replaceAll(trimmedPattern, '');
                            }
                        }
                        actualScriptContent = processedContent.trim();
                    } else {
                        actualScriptContent = currentScriptContent.trim();
                    }

                    const tempScriptPath = path.join(currentCWD, `taylored-temp-script-${Date.now()}`);
                    await fs.writeFile(tempScriptPath, actualScriptContent);

                    let scriptResult = '';
                    try {
                        await fs.chmod(tempScriptPath, 0o755);
                        scriptResult = await new Promise<string>((resolve, reject) => {
                            const child = spawn(tempScriptPath, [], { cwd: currentCWD, stdio: 'pipe', shell: true });
                            let scriptOutput = '';
                            let scriptErrorOutput = '';
                            child.stdout.on('data', (data) => { scriptOutput += data.toString(); process.stdout.write(data); });
                            child.stderr.on('data', (data) => { scriptErrorOutput += data.toString(); process.stderr.write(data); });
                            child.on('error', reject);
                            child.on('close', (code) => {
                                if (code === 0) {
                                    resolve(scriptOutput);
                                } else {
                                    const error = new Error(`Script failed with code ${code}`) as any;
                                    error.status = code;
                                    error.stdout = scriptOutput;
                                    error.stderr = scriptErrorOutput;
                                    reject(error);
                                }
                            });
                        });
                    } catch (error: any) {
                        // istanbul ignore next
                        if (error.status !== undefined || error.stderr !== undefined || error.stdout !== undefined) {
                            // istanbul ignore next
                            console.error(`ERROR: Script execution failed for block ${currentNumero} in ${currentOriginalFilePath}. Error: ${error.message}`);
                            if (error.stderr) console.error("STDERR:\n" + error.stderr);
                            if (error.stdout) console.error("STDOUT:\n" + error.stdout);
                        } else {
                            console.error(`ERROR: Failed to set execute permissions or other FS issue on temporary script file '${tempScriptPath}'. Details: ${error.message}`);
                        }
                        throw error;
                    } finally {
                        try {
                            await fs.unlink(tempScriptPath);
                        } catch (unlinkError: any) {
                            // istanbul ignore next
                            console.warn(`Warning: Failed to delete temporary script file '${tempScriptPath}' during cleanup. Details: ${unlinkError.message}`);
                        }
                    }

                    const relativeOriginalFilePath = path.relative(currentCWD, currentOriginalFilePath);
                    const tempComputeBranchName = `temp-taylored-compute-${currentNumero}-${Date.now()}`;

                    try {
                        execSync(`git checkout -b "${tempComputeBranchName}" "${currentOriginalBranchName}"`, { cwd: currentCWD, ...execOpts });
                        const contentOnTempBranch = await fs.readFile(currentOriginalFilePath, 'utf-8');
                        const contentWithScriptResult = contentOnTempBranch.replace(currentScriptContentWithTags, scriptResult);
                        await fs.writeFile(currentOriginalFilePath, contentWithScriptResult);
                        execSync(`git add "${relativeOriginalFilePath}"`, { cwd: currentCWD, ...execOpts });
                        execSync(`git commit --no-verify -m "AUTO: Apply computed block ${currentNumero} for ${path.basename(currentOriginalFilePath)}"`, { cwd: currentCWD, ...execOpts });

                        const diffAgainstBranchCommand = `git diff --exit-code "${currentBranchName}" HEAD -- "${relativeOriginalFilePath}"`;
                        try {
                            execSync(diffAgainstBranchCommand, { cwd: currentCWD, encoding: 'utf8', stdio: 'pipe' });
                            await fs.writeFile(currentTargetTayloredFilePath, "");
                            console.log(`No difference found for computed block ${currentNumero} from ${currentOriginalFilePath} when compared against branch '${currentBranchName}'. Empty taylored file created: ${currentTargetTayloredFilePath}`);
                        } catch (e: any) {
                            if (e.status === 1 && typeof e.stdout === 'string') {
                                await fs.writeFile(currentTargetTayloredFilePath, e.stdout);
                                console.log(`Successfully created ${currentTargetTayloredFilePath} for computed block ${currentNumero} from ${currentOriginalFilePath} (using branch diff against '${currentBranchName}')`);
                            } else {
                                // istanbul ignore next
                                console.error(`CRITICAL ERROR: Failed to generate diff for computed block ${currentNumero} from ${currentOriginalFilePath} against branch '${currentBranchName}'.`);
                                if (e.message) console.error(`  Error message: ${e.message}`);
                                if (e.stderr) console.error("  STDERR:\n" + e.stderr.toString().trim());
                                if (e.stdout) console.error("  STDOUT:\n" + e.stdout.toString().trim());
                                throw e;
                            }
                        }
                        // totalBlocksProcessed will be incremented after Promise.allSettled for async blocks
                    } catch (error: any) {
                        // istanbul ignore next
                        console.error(`CRITICAL ERROR: Failed to process computed block ${currentNumero} from ${currentOriginalFilePath} using branch diff method.`);
                        if (error.message) console.error(`  Error message: ${error.message}`);
                        if (error.stderr) console.error("  STDERR:\n" + error.stderr.toString().trim());
                        if (error.stdout) console.error("  STDOUT:\n" + error.stdout.toString().trim());
                        throw error;
                    } finally {
                        const currentBranchAfterOps = execSync('git rev-parse --abbrev-ref HEAD', { cwd: currentCWD, ...execOpts }).trim();
                        if (currentBranchAfterOps === tempComputeBranchName) {
                            execSync(`git checkout -q "${currentOriginalBranchName}"`, { cwd: currentCWD, stdio: 'ignore' });
                        } else if (currentBranchAfterOps !== currentOriginalBranchName) {
                            // istanbul ignore next
                            console.warn(`Warning: Unexpected current branch '${currentBranchAfterOps}' during cleanup for computed block. Attempting to return to '${currentOriginalBranchName}'.`);
                            try {
                                execSync(`git checkout -q "${currentOriginalBranchName}"`, { cwd: currentCWD, stdio: 'ignore' });
                            } catch (coErr: any) {
                                 console.warn(`Warning: Failed to checkout original branch '${currentOriginalBranchName}' during cleanup. Current branch: ${currentBranchAfterOps}. Error: ${coErr.message}`);
                            }
                        }
                        try {
                            const branchesRaw = execSync('git branch', { cwd: currentCWD, ...execOpts });
                            const branchesList = branchesRaw.split('\n').map(b => b.trim().replace(/^\* /, ''));
                            if (branchesList.includes(tempComputeBranchName)) {
                                 execSync(`git branch -q -D "${tempComputeBranchName}"`, { cwd: currentCWD, stdio: 'ignore' });
                            }
                        } catch (deleteBranchError: any) {
                            // istanbul ignore next
                            console.warn(`Warning: Failed to delete temporary branch '${tempComputeBranchName}' during cleanup for computed block. May require manual cleanup. ${deleteBranchError.message}`);
                        }
                    }
                };

                if (asyncFlag) {
                    asyncScriptPromises.push(processComputeBlock(
                        numero,
                        originalFilePath,
                        scriptContent,
                        computeCharsToStrip,
                        scriptContentWithTags,
                        CWD,
                        branchName,
                        originalBranchName,
                        targetTayloredFilePath
                    ));
                    totalBlocksProcessed++; // Increment when task is initiated for async
                } else {
                    // Synchronous execution path (existing logic)
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
                        // istanbul ignore next
                        const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} exists for a compute block. This file should not be present. Please remove or rename it.`;
                        console.error(message);
                        throw new Error(message);
                    } catch (error: any) {
                         if (error.code !== 'ENOENT') { // If it's any error other than "file not found", re-throw.
                            throw error;
                        }
                    }

                    let actualScriptContent: string;
                    if (computeCharsToStrip !== undefined && computeCharsToStrip.length > 0) {
                        // Modified compute logic:
                        // Removes all occurrences of each pattern specified in 'computeCharsToStrip'.
                        let processedContent = scriptContent.trim(); // Start by trimming the block content
                        const patterns = computeCharsToStrip.split(',');

                        for (const pattern of patterns) {
                            const trimmedPattern = pattern.trim(); // Trim the pattern itself to remove any surrounding whitespace
                            if (trimmedPattern.length > 0) {
                                // Removes all occurrences of the trimmedPattern.
                                // String.prototype.replaceAll() is available in Node.js v15.0.0+.
                                // If compatibility with older versions is required, you could use:
                                // processedContent = processedContent.split(trimmedPattern).join('');
                                processedContent = processedContent.replaceAll(trimmedPattern, '');
                            }
                        }
                        actualScriptContent = processedContent.trim(); // Trim the final result
                    } else {
                        // No compute or empty compute: use the content of the block, trimmed.
                        actualScriptContent = scriptContent.trim();
                    }

                    // Create temp script file without extension, relying on shebang
                    const tempScriptPath = path.join(CWD, `taylored-temp-script-${Date.now()}`);
                    await fs.writeFile(tempScriptPath, actualScriptContent);

                    let scriptResult = '';
                    try {
                        // Add execute permission to the temporary script file before execution
                        await fs.chmod(tempScriptPath, 0o755); // rwxr-xr-x

                        // Execute the temporary script directly, relying on its shebang
                        scriptResult = await new Promise<string>((resolve, reject) => {
                            const child = spawn(tempScriptPath, [], { cwd: CWD, stdio: 'pipe', shell: true });
                            let scriptOutput = '';
                            let scriptErrorOutput = '';

                            child.stdout.on('data', (data) => {
                                scriptOutput += data.toString();
                                process.stdout.write(data);
                            });

                            child.stderr.on('data', (data) => {
                                scriptErrorOutput += data.toString();
                                process.stderr.write(data);
                            });

                            child.on('error', (err) => {
                                reject(err);
                            });

                            child.on('close', (code) => {
                                if (code === 0) {
                                    resolve(scriptOutput);
                                } else {
                                    const error = new Error(`Script failed with code ${code}`) as any;
                                    error.status = code;
                                    error.stdout = scriptOutput;
                                    error.stderr = scriptErrorOutput;
                                    reject(error);
                                }
                            });
                        });

                    } catch (error: any) {
                        // Differentiate error source for better logging
                        // istanbul ignore next
                        if (error.status !== undefined || error.stderr !== undefined || error.stdout !== undefined) {
                            // This is likely an error from the script execution (spawn)
                            // istanbul ignore next
                            console.error(`ERROR: Script execution failed for block ${numero} in ${originalFilePath}. Error: ${error.message}`);
                            if (error.stderr) console.error("STDERR:\n" + error.stderr);
                            if (error.stdout) console.error("STDOUT:\n" + error.stdout);
                        } else {
                            // This is likely an error from fs.chmod or other fs operations
                            console.error(`ERROR: Failed to set execute permissions or other FS issue on temporary script file '${tempScriptPath}'. Details: ${error.message}`);
                        }
                        throw error; // Re-throw the error to stop processing for this block
                    } finally {
                        // Clean up temp script file, regardless of success or failure of the try block
                        try {
                            await fs.unlink(tempScriptPath);
                        } catch (unlinkError: any) {
                            // istanbul ignore next
                            console.warn(`Warning: Failed to delete temporary script file '${tempScriptPath}' during cleanup. Details: ${unlinkError.message}`);
                        }
                    }

                    // New git-based diffing logic for compute blocks
                    const relativeOriginalFilePath = path.relative(CWD, originalFilePath);
                    const tempComputeBranchName = `temp-taylored-compute-${numero}-${Date.now()}`;

                    try {
                        // 1. Create a temporary branch from the current originalBranchName
                        execSync(`git checkout -b "${tempComputeBranchName}" "${originalBranchName}"`, { cwd: CWD, ...execOpts });

                        // 2. On this temporary branch, modify the file:
                        const contentOnTempBranch = await fs.readFile(originalFilePath, 'utf-8');
                        const contentWithScriptResult = contentOnTempBranch.replace(scriptContentWithTags, scriptResult);
                        await fs.writeFile(originalFilePath, contentWithScriptResult);

                        // 3. Commit this change on the temporary branch
                        execSync(`git add "${relativeOriginalFilePath}"`, { cwd: CWD, ...execOpts });
                        execSync(`git commit --no-verify -m "AUTO: Apply computed block ${numero} for ${path.basename(originalFilePath)}"`, { cwd: CWD, ...execOpts });

                        // 4. Generate the diff between the target branchName and HEAD of our temporary branch
                        const diffAgainstBranchCommand = `git diff --exit-code "${branchName}" HEAD -- "${relativeOriginalFilePath}"`;
                        let diffOutputCommandResult: string;

                        try {
                            diffOutputCommandResult = execSync(diffAgainstBranchCommand, { cwd: CWD, encoding: 'utf8', stdio: 'pipe' });
                            // No differences found if execSync doesn't throw
                            await fs.writeFile(targetTayloredFilePath, "");
                            console.log(`No difference found for computed block ${numero} from ${originalFilePath} when compared against branch '${branchName}'. Empty taylored file created: ${targetTayloredFilePath}`);
                        } catch (e: any) {
                            // If git diff finds differences, it exits with 1, execSync throws.
                            if (e.status === 1 && typeof e.stdout === 'string') {
                                diffOutputCommandResult = e.stdout;
                                await fs.writeFile(targetTayloredFilePath, diffOutputCommandResult);
                                console.log(`Successfully created ${targetTayloredFilePath} for computed block ${numero} from ${originalFilePath} (using branch diff against '${branchName}')`);
                            } else {
                                // Actual error from git diff
                                // istanbul ignore next
                                console.error(`CRITICAL ERROR: Failed to generate diff for computed block ${numero} from ${originalFilePath} against branch '${branchName}'.`);
                                if (e.message) console.error(`  Error message: ${e.message}`);
                                if (e.stderr) console.error("  STDERR:\n" + e.stderr.toString().trim());
                                if (e.stdout) console.error("  STDOUT:\n" + e.stdout.toString().trim());
                                throw e; // Re-throw the actual error
                            }
                        }
                        totalBlocksProcessed++;

                    } catch (error: any) {
                        // istanbul ignore next
                        console.error(`CRITICAL ERROR: Failed to process computed block ${numero} from ${originalFilePath} using branch diff method.`);
                        if (error.message) console.error(`  Error message: ${error.message}`);
                        if (error.stderr) console.error("  STDERR:\n" + error.stderr.toString().trim());
                        if (error.stdout) console.error("  STDOUT:\n" + error.stdout.toString().trim());
                        throw error; // Propagate error to stop processing for this block/file
                    } finally {
                        // Clean up: switch back to original branch and delete temporary branch
                        const currentBranchAfterOps = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
                        if (currentBranchAfterOps === tempComputeBranchName) {
                            execSync(`git checkout -q "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                        } else if (currentBranchAfterOps !== originalBranchName) {
                            // istanbul ignore next
                            console.warn(`Warning: Unexpected current branch '${currentBranchAfterOps}' during cleanup for computed block. Attempting to return to '${originalBranchName}'.`);
                            try {
                                execSync(`git checkout -q "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                            } catch (coErr: any) {
                                 console.warn(`Warning: Failed to checkout original branch '${originalBranchName}' during cleanup. Current branch: ${currentBranchAfterOps}. Error: ${coErr.message}`);
                            }
                        }
                        try {
                            const branchesRaw = execSync('git branch', { cwd: CWD, ...execOpts });
                            const branchesList = branchesRaw.split('\n').map(b => b.trim().replace(/^\* /, ''));
                            if (branchesList.includes(tempComputeBranchName)) {
                                 execSync(`git branch -q -D "${tempComputeBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                            }
                        } catch (deleteBranchError: any) {
                            // istanbul ignore next
                            console.warn(`Warning: Failed to delete temporary branch '${tempComputeBranchName}' during cleanup for computed block. May require manual cleanup. ${deleteBranchError.message}`);
                        }
                    }
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
            } // This closes the `if (computeCharsToStrip !== undefined)` block, NOT the `else` for non-compute
        }
    }

    if (asyncScriptPromises.length > 0) {
        console.log(`Executing ${asyncScriptPromises.length} asynchronous compute block(s) in parallel...`);
        const results = await Promise.allSettled(asyncScriptPromises);
        let succeededCount = 0;
        let failedCount = 0;
        results.forEach((result, index) => {
            if (result.status === 'fulfilled') {
                console.log(`Asynchronous task for block ${index + 1} completed successfully.`);
                succeededCount++;
            } else {
                console.error(`Asynchronous task for block ${index + 1} failed: ${result.reason}`);
                failedCount++;
            }
        });
        console.log(`All asynchronous tasks have completed. Succeeded: ${succeededCount}, Failed: ${failedCount}.`);
    }

    if (totalBlocksProcessed === 0) {
        console.log("No taylored blocks found matching the criteria in any of the scanned files.");
    } else {
        if (asyncScriptPromises.length > 0) {
            // Message when async operations were involved
            console.log(`Finished processing. Initiated ${totalBlocksProcessed} taylored block(s). See async summary for completion details.`);
        } else {
            // Original message for purely synchronous operations
            console.log(`Finished processing. Successfully created ${totalBlocksProcessed} taylored file(s).`);
        }
    }
}

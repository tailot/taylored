// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding, spawn } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { analyzeDiffContent } from '../utils';

const execOpts: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

/**
 * Executes a Git-related operation within a temporary Git branch.
 * Handles the creation, cleanup (checkout original branch, delete temporary branch),
 * and error management for operations that need to be isolated.
 *
 * @template T The return type of the operation.
 * @param {string} CWD Current working directory (Git repository root).
 * @param {string} originalBranchName The name of the branch to return to after the operation.
 * @param {string} tempBranchPattern A prefix for the temporary branch name (e.g., "temp-compute").
 * @param {string} blockNumero The taylored block number, used for unique branch naming and commit messages.
 * @param {(tempBranchName: string, relativeOriginalFilePath?: string) => Promise<T>} operation
 *   An async function to execute on the temporary branch. It receives the temporary branch name
 *   and an optional relative file path (if a specific file is being targeted).
 * @param {string} [relativeOriginalFilePath] Optional path to a specific file relevant to the operation,
 *   used for `git add` if provided.
 * @returns {Promise<T>} A promise that resolves with the result of the `operation`.
 * @throws Re-throws any errors encountered during the Git operations or the provided `operation` callback.
 */
async function withTempGitBranch<T>(
    CWD: string,
    originalBranchName: string,
    tempBranchPattern: string, // e.g., "temp-taylored-compute" or "temp-taylored-non-compute"
    blockNumero: string, // For unique branch naming and commit messages
    operation: (tempBranchName: string, relativeOriginalFilePath?: string) => Promise<T>,
    relativeOriginalFilePath?: string // Optional: only needed if git add/commit specific file
): Promise<T> {
    const tempBranchName = `${tempBranchPattern}-${blockNumero}-${Date.now()}`;
    let initialBranchCheck = '';
    try {
        initialBranchCheck = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
        if (initialBranchCheck !== originalBranchName) {
            // Attempt to switch to originalBranchName if not already on it.
            // This might happen if a previous operation failed mid-way.
            console.warn(
                `Warning: Not on original branch '${originalBranchName}' before creating temp branch. Current: '${initialBranchCheck}'. Attempting checkout...`
            );
            execSync(`git checkout -q "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
        }

        execSync(`git checkout -b "${tempBranchName}" "${originalBranchName}"`, { cwd: CWD, ...execOpts });
        console.log(`Switched to temporary branch: ${tempBranchName}`);

        // Create and add .gitignore to the temporary branch
        // This is common for both compute and non-compute if they involve file modifications
        const gitignorePath = path.join(CWD, '.gitignore');
        const gitignoreContent = TAYLORED_DIR_NAME + '\n';
        await fs.writeFile(gitignorePath, gitignoreContent);
        execSync(`git add .gitignore`, { cwd: CWD, ...execOpts });
        // The commit for .gitignore will be part of the operation's commit or a separate one if needed.

        return await operation(tempBranchName, relativeOriginalFilePath);
    } catch (error: any) {
        console.error(`CRITICAL ERROR during operation in temporary branch '${tempBranchName}'.`);
        if (error.message) console.error(`  Error message: ${error.message}`);
        if (error.stderr) console.error('  STDERR:\n' + error.stderr.toString().trim());
        if (error.stdout) console.error('  STDOUT:\n' + error.stdout.toString().trim());
        throw error; // Re-throw the error to be caught by the caller
    } finally {
        const currentBranchAfterOps = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
        if (currentBranchAfterOps === tempBranchName) {
            execSync(`git checkout -q "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
        } else if (currentBranchAfterOps !== originalBranchName) {
            console.warn(
                `Warning: Unexpected current branch '${currentBranchAfterOps}' during cleanup. Expected '${tempBranchName}' or '${originalBranchName}'. Attempting to return to '${originalBranchName}'.`
            );
            try {
                execSync(`git checkout -q "${originalBranchName}"`, { cwd: CWD, stdio: 'ignore' });
            } catch (coErr: any) {
                console.warn(
                    `Warning: Failed to checkout original branch '${originalBranchName}' during cleanup. Current branch: ${currentBranchAfterOps}. Error: ${coErr.message}`
                );
            }
        }
        console.log(`Switched back to original branch: ${originalBranchName}`);

        try {
            const branchesRaw = execSync('git branch', { cwd: CWD, ...execOpts });
            const branchesList = branchesRaw.split('\n').map((b) => b.trim().replace(/^\* /, ''));
            if (branchesList.includes(tempBranchName)) {
                execSync(`git branch -q -D "${tempBranchName}"`, { cwd: CWD, stdio: 'ignore' });
                console.log(`Deleted temporary branch: ${tempBranchName}`);
            }
        } catch (deleteBranchError: any) {
            console.warn(
                `Warning: Failed to delete temporary branch '${tempBranchName}' during cleanup. May require manual cleanup. ${deleteBranchError.message}`
            );
        }

        // Clean up .gitignore if it was created by this function and not committed by the operation
        // This is a bit tricky; ideally, the operation commits .gitignore if it wants to keep it.
        // For simplicity, we might leave .gitignore if the operation didn't explicitly remove it.
        // Or, always remove it if it matches exactly what we wrote.
        try {
            const gitignorePath = path.join(CWD, '.gitignore');
            if (await fs.pathExists(gitignorePath)) {
                const currentGitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
                if (currentGitignoreContent.trim() === TAYLORED_DIR_NAME) {
                    // Only remove if it's exactly what we added
                    // Check if .gitignore is tracked. If not, safe to delete.
                    // If tracked, it means the 'operation' decided to commit it, so we leave it.
                    const isTracked = execSync(`git ls-files .gitignore`, { cwd: CWD, ...execOpts }).trim();
                    if (!isTracked) {
                        await fs.unlink(gitignorePath);
                    }
                }
            }
        } catch (cleanupError: any) {
            // console.warn(`Warning: Could not clean up .gitignore file. ${cleanupError.message}`);
            // Non-critical, so not logging as a prominent warning.
        }
    }
}

/**
 * Recursively finds all files with a given extension within a directory, respecting exclusions.
 *
 * @param {string} dir The directory to start searching from.
 * @param {string} ext The file extension to search for (e.g., ".ts").
 * @param {string[]} [allFiles=[]] Accumulator for found file paths.
 * @param {string[]} [excludeDirs] Optional array of directory paths (relative to CWD_ABS) to exclude.
 * @param {string} [CWD_ABS] Absolute path to the current working directory, used for reliable relative path checking of excludeDirs.
 * @returns {Promise<string[]>} A promise that resolves with an array of absolute file paths.
 */
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
            if (
                entry.name !== '.git' &&
                entry.name !== TAYLORED_DIR_NAME &&
                (!excludeDirs ||
                    !excludeDirs.some(
                        (excludedDir) => relativePath === excludedDir || relativePath.startsWith(excludedDir + path.sep)
                    ))
            ) {
                await findFilesRecursive(fullPath, ext, allFiles, excludeDirs, CWD_ABS);
            }
        } else if (entry.isFile() && entry.name.endsWith(ext)) {
            allFiles.push(fullPath);
        }
    }
    return allFiles;
}

/**
 * Handles the '--automatic' command operation.
 * This complex operation involves:
 * 1. Identifying the current Git branch and ensuring no uncommitted changes.
 * 2. Scanning files with specified extensions for <taylored> blocks.
 * 3. For each block:
 *    a. If it's a "compute" block:
 *       i. Optionally strips characters from the script content based on the `compute` attribute.
 *       ii. Executes the script content.
 *       iii. Modifies the original file with the script's output on a temporary branch.
 *       iv. Commits this change on the temporary branch.
 *       v. Diffs this temporary branch against the user-specified `branchName` (target diff branch)
 *          to generate the .taylored patch file.
 *       vi. Supports asynchronous execution of these compute blocks via the `async="true"` attribute.
 *    b. If it's a "non-compute" block (standard taylored block):
 *       i. Removes the entire <taylored> block from the original file on a temporary branch.
 *       ii. Commits this change on the temporary branch.
 *       iii. Diffs this temporary branch against the `originalBranchName` (the branch the user was on)
 *          to generate the .taylored patch file (capturing the removal of the block).
 * 4. Manages temporary Git branches and ensures cleanup.
 * 5. Saves the generated .taylored files into the .taylored directory.
 *
 * @param {string} extensionsInput Comma-separated string of file extensions to scan (e.g., "ts,js").
 * @param {string} branchName The target Git branch to diff against for generating patches from "compute" blocks.
 * @param {string} CWD The current working directory, expected to be the root of a Git repository.
 * @param {string[]} [excludeDirs] Optional array of directory paths to exclude from scanning.
 */
export async function handleAutomaticOperation(
    extensionsInput: string,
    branchName: string, // This is the target branch to diff against for patch content
    CWD: string,
    excludeDirs?: string[]
): Promise<void> {
    let originalBranchName: string;
    try {
        originalBranchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
        if (originalBranchName === 'HEAD') {
            const errorMessage = 'CRITICAL ERROR: Repository is in a detached HEAD state. Please checkout a branch.';
            console.error(errorMessage);
            throw new Error(errorMessage);
        }
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Failed to get current Git branch. Details: ${error.message}`;
        console.error(errorMessage);
        if (error.stderr) console.error('STDERR:\n' + error.stderr);
        if (error.stdout) console.error('STDOUT:\n' + error.stdout);
        throw new Error(errorMessage);
    }

    try {
        const gitStatus = execSync('git status --porcelain', { cwd: CWD, ...execOpts }).trim();
        if (gitStatus) {
            const errorMessage =
                'CRITICAL ERROR: Uncommitted changes or untracked files in the repository. Please commit or stash them before running --automatic.';
            console.error(errorMessage);
            console.error('Details:\n' + gitStatus);
            throw new Error(errorMessage);
        }
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Failed to check Git status. Details: ${error.message}`;
        console.error(errorMessage);
        if (error.stderr) console.error('STDERR:\n' + error.stderr);
        if (error.stdout) console.error('STDOUT:\n' + error.stdout);
        throw new Error(errorMessage);
    }

    console.log(
        `Starting automatic taylored block extraction for extensions '${extensionsInput}' in directory '${CWD}'. Original branch: '${originalBranchName}', Target diff branch: '${branchName}'`
    );

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    try {
        await fs.mkdir(tayloredDir, { recursive: true });
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Could not create directory '${tayloredDir}'. Details: ${error.message}`;
        console.error(errorMessage);
        throw new Error(errorMessage);
    }

    const extensions = extensionsInput.split(',').map((ext) => ext.trim());
    const allFilesToScan: string[] = [];
    const CWD_ABS = path.resolve(CWD);

    for (const ext of extensions) {
        const normalizedExtension = ext.startsWith('.') ? ext : `.${ext}`;
        try {
            const filesForExtension = await findFilesRecursive(CWD_ABS, normalizedExtension, [], excludeDirs, CWD_ABS);
            allFilesToScan.push(...filesForExtension);
        } catch (error: any) {
            console.error(`Error while searching for files with extension '${normalizedExtension}': ${error.message}`);
        }
    }

    if (allFilesToScan.length === 0) {
        console.log(`No files found with specified extensions: ${extensionsInput}`);
        return;
    }

    console.log(`Found ${allFilesToScan.length} file(s) with specified extensions. Processing...`);
    const blockRegex = /[^\n]*?<taylored\s+number="(\d+)"([^>]*)>([\s\S]*?)[^\n]*?<\/taylored>/g;
    let totalBlocksProcessed = 0;
    const asyncScriptPromises: Promise<void>[] = [];

    for (const originalFilePath of allFilesToScan) {
        let fileContent: string;
        try {
            fileContent = await fs.readFile(originalFilePath, 'utf-8');
        } catch (readError: any) {
            console.warn(
                `Warning: Error reading file '${originalFilePath}': ${readError.message}. Skipping this file.`
            );
            continue;
        }

        const matches = Array.from(fileContent.matchAll(blockRegex));
        if (matches.length === 0) {
            continue;
        }

        for (const match of matches) {
            const numero = match[1];
            const attributesString = match[2];
            const scriptContentWithTags = match[0];
            const scriptContent = match[3];

            const computeMatch = attributesString.match(/compute=["']([^"']*)["']/);
            const computeCharsToStrip = computeMatch ? computeMatch[1] : undefined;

            const asyncMatch = attributesString.match(/async=["'](true|false)["']/);
            const asyncFlag = asyncMatch ? asyncMatch[1] === 'true' : false;

            const targetTayloredFileName = `${numero}${TAYLORED_FILE_EXTENSION}`;
            const targetTayloredFilePath = path.join(tayloredDir, targetTayloredFileName);
            const intermediateMainTayloredPath = path.join(tayloredDir, `main${TAYLORED_FILE_EXTENSION}`); // Still used for pre-checks in non-compute

            console.log(`Processing block ${numero} from ${originalFilePath}...`);

            if (computeCharsToStrip !== undefined) {
                const processComputeBlock = async (): Promise<void> => {
                    console.log(
                        `${asyncFlag ? 'Asynchronously processing' : 'Processing'} computed block ${numero} from ${originalFilePath}...`
                    );

                    try {
                        await fs.access(targetTayloredFilePath);
                        const message = `CRITICAL ERROR: Target file ${targetTayloredFilePath} for computed block already exists. Please remove or rename it.`;
                        console.error(message);
                        throw new Error(message);
                    } catch (error: any) {
                        if (error.code !== 'ENOENT') {
                            throw error;
                        }
                    }
                    try {
                        await fs.access(intermediateMainTayloredPath);
                        const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} exists for a compute block. This file should not be present. Please remove or rename it.`;
                        console.error(message);
                        throw new Error(message);
                    } catch (error: any) {
                        if (error.code !== 'ENOENT') {
                            throw error;
                        }
                    }

                    let actualScriptContent: string;
                    if (computeCharsToStrip.length > 0) {
                        let processedContent = scriptContent.trim();
                        const patterns = computeCharsToStrip.split(',');
                        for (const pattern of patterns) {
                            const trimmedPattern = pattern.trim();
                            if (trimmedPattern.length > 0) {
                                processedContent = processedContent.replaceAll(trimmedPattern, '');
                            }
                        }
                        actualScriptContent = processedContent.trim();
                    } else {
                        actualScriptContent = scriptContent.trim();
                    }

                    const tempScriptPath = path.join(CWD, `taylored-temp-script-${numero}-${Date.now()}`);
                    await fs.writeFile(tempScriptPath, actualScriptContent);
                    let scriptResult = '';

                    try {
                        await fs.chmod(tempScriptPath, 0o755);
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
                        console.error(
                            `ERROR: Script execution failed for block ${numero} in ${originalFilePath}. Error: ${error.message}`
                        );
                        if ((error as any).stderr) console.error('STDERR:\n' + (error as any).stderr);
                        if ((error as any).stdout) console.error('STDOUT:\n' + (error as any).stdout);
                        throw error;
                    } finally {
                        await fs
                            .unlink(tempScriptPath)
                            .catch((e) =>
                                console.warn(`Warning: Failed to delete temp script ${tempScriptPath}: ${e.message}`)
                            );
                    }

                    const relativeOriginalFilePath = path.relative(CWD, originalFilePath);
                    await withTempGitBranch(
                        CWD,
                        originalBranchName,
                        'temp-taylored-compute',
                        numero,
                        async (_tempBranchName) => {
                            const contentOnTempBranch = await fs.readFile(originalFilePath, 'utf-8');
                            const contentWithScriptResult = contentOnTempBranch.replace(
                                scriptContentWithTags,
                                scriptResult
                            );
                            await fs.writeFile(originalFilePath, contentWithScriptResult);

                            execSync(`git add "${relativeOriginalFilePath}"`, { cwd: CWD, ...execOpts });
                            execSync(
                                `git commit --no-verify -m "AUTO: Apply computed block ${numero} for ${path.basename(originalFilePath)}"`,
                                { cwd: CWD, ...execOpts }
                            );

                            const diffAgainstBranchCommand = `git diff --exit-code "${branchName}" HEAD -- "${relativeOriginalFilePath}"`;
                            try {
                                execSync(diffAgainstBranchCommand, { cwd: CWD, encoding: 'utf8', stdio: 'pipe' });
                                await fs.writeFile(targetTayloredFilePath, '');
                                console.log(
                                    `No difference found for computed block ${numero} from ${originalFilePath} when compared against branch '${branchName}'. Empty taylored file created: ${targetTayloredFilePath}`
                                );
                            } catch (e: any) {
                                if (e.status === 1 && typeof e.stdout === 'string') {
                                    await fs.writeFile(targetTayloredFilePath, e.stdout);
                                    console.log(
                                        `Successfully created ${targetTayloredFilePath} for computed block ${numero} from ${originalFilePath} (using branch diff against '${branchName}')`
                                    );
                                } else {
                                    console.error(
                                        `CRITICAL ERROR: Failed to generate diff for computed block ${numero} against branch '${branchName}'.`
                                    );
                                    if (e.message) console.error(`  Error message: ${e.message}`);
                                    if (e.stderr) console.error('  STDERR:\n' + e.stderr.toString().trim());
                                    if (e.stdout) console.error('  STDOUT:\n' + e.stdout.toString().trim());
                                    throw e;
                                }
                            }
                        },
                        relativeOriginalFilePath
                    );
                    if (!asyncFlag) totalBlocksProcessed++; // Increment sync blocks here
                };

                if (asyncFlag) {
                    asyncScriptPromises.push(processComputeBlock());
                    totalBlocksProcessed++; // Increment when task is initiated for async
                } else {
                    await processComputeBlock(); // Synchronous execution
                }
            } else {
                // Non-compute block
                // Pre-checks for non-compute (similar to original logic)
                const actualIntermediateFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
                const actualIntermediateFilePath = path.join(tayloredDir, actualIntermediateFileName);
                try {
                    await fs.access(actualIntermediateFilePath);
                    throw new Error(
                        `CRITICAL ERROR: Intermediate file ${actualIntermediateFilePath} (derived from branch name '${branchName}') already exists.`
                    );
                } catch (error: any) {
                    if (error.code !== 'ENOENT') throw error;
                }
                try {
                    await fs.access(targetTayloredFilePath);
                    throw new Error(`CRITICAL ERROR: Target file ${targetTayloredFilePath} already exists.`);
                } catch (error: any) {
                    if (error.code !== 'ENOENT') throw error;
                }

                const relativeOriginalFilePath = path.relative(CWD, originalFilePath);
                await withTempGitBranch(
                    CWD,
                    originalBranchName,
                    'temp-taylored-non-compute',
                    numero,
                    async (_tempBranchName) => {
                        const contentUpToMatch = fileContent.substring(0, match.index);
                        const startLineNum = contentUpToMatch.split('\n').length;
                        const matchLinesCount = scriptContentWithTags.split('\n').length;

                        const currentFileLines = (await fs.readFile(originalFilePath, 'utf-8')).split('\n');
                        currentFileLines.splice(startLineNum - 1, matchLinesCount);
                        await fs.writeFile(originalFilePath, currentFileLines.join('\n'));

                        execSync(`git add "${relativeOriginalFilePath}"`, { cwd: CWD, ...execOpts });
                        execSync(
                            `git commit -m "Temporary: Remove block ${numero} from ${path.basename(originalFilePath)}"`,
                            { cwd: CWD, ...execOpts }
                        );

                        const diffCommand = `git diff --exit-code "${originalBranchName}" HEAD -- "${relativeOriginalFilePath}"`;
                        let diffContentForFile = '';
                        try {
                            execSync(diffCommand, { cwd: CWD, encoding: 'utf8', stdio: 'pipe' });
                        } catch (e: any) {
                            if (e.status === 1 && typeof e.stdout === 'string') {
                                diffContentForFile = e.stdout;
                            } else {
                                console.error(
                                    `CRITICAL ERROR: Failed to generate diff for non-compute block ${numero} (removal vs original branch '${originalBranchName}').`
                                );
                                throw e;
                            }
                        }

                        const analysis = analyzeDiffContent(diffContentForFile);
                        if (!analysis.success) {
                            throw new Error(
                                `Diff analysis failed for non-compute block ${numero}. ${analysis.errorMessage}`
                            );
                        }

                        if (analysis.isPure && analysis.deletions > 0 && analysis.additions === 0) {
                            await fs.writeFile(targetTayloredFilePath, diffContentForFile);
                            console.log(
                                `Successfully created ${targetTayloredFilePath} for block ${numero} (removal vs original branch '${originalBranchName}')`
                            );
                        } else if (analysis.isPure && analysis.additions === 0 && analysis.deletions === 0) {
                            await fs.writeFile(targetTayloredFilePath, '');
                            console.log(
                                `Block removal for ${numero} resulted in no textual changes against original branch '${originalBranchName}'. Empty taylored file created.`
                            );
                        } else {
                            console.error(
                                `CRITICAL ERROR: Diff for non-compute block ${numero} (removal vs original branch '${originalBranchName}') was not purely deletions or no change.`
                            );
                            console.error(
                                `  Additions: ${analysis.additions}, Deletions: ${analysis.deletions}, IsPure: ${analysis.isPure}`
                            );
                            throw new Error(`Unexpected diff characteristics for non-compute block ${numero}.`);
                        }
                    },
                    relativeOriginalFilePath
                );
                totalBlocksProcessed++;
            }
        }
    }

    if (asyncScriptPromises.length > 0) {
        console.log(`Executing ${asyncScriptPromises.length} asynchronous compute block(s) in parallel...`);
        const results = await Promise.allSettled(asyncScriptPromises);
        let succeededCount = 0;
        results.forEach((result, index) => {
            const blockIdentifier = `async block (index ${index})`;
            if (result.status === 'fulfilled') {
                console.log(`Asynchronous task for ${blockIdentifier} completed successfully.`);
                succeededCount++;
            } else {
                console.error(`Asynchronous task for ${blockIdentifier} failed: ${result.reason}`);
            }
        });
        console.log(
            `All asynchronous tasks have completed. Succeeded: ${succeededCount}, Failed: ${results.length - succeededCount}.`
        );
    }

    if (totalBlocksProcessed === 0) {
        console.log('No taylored blocks found matching the criteria in any of the scanned files.');
    } else {
        console.log(`Finished processing. Initiated or completed ${totalBlocksProcessed} taylored block(s).`);
    }
}

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
// import { analyzeDiffContent } from '../utils'; // No longer needed here
import { findFilesRecursive } from '../utils/file-scanner';
import { BlockParser, ParsedBlock } from '../parsers/block-parser';
import { executeScript } from '../runners/script-runner';
import { ScriptExecutionError, GitOperationError } from '../errors';
import { GitProcessor } from '../processors/git-processor'; // Import GitProcessor

const execOpts: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

export async function handleAutomaticOperation(
    extensionsInput: string,
    branchName: string, // This is the targetBranch for computed blocks
    CWD: string,
    excludeDirs?: string[]
): Promise<void> {
    let originalBranchName: string; // The branch the repo is currently on
    try {
        originalBranchName = execSync('git rev-parse --abbrev-ref HEAD', { cwd: CWD, ...execOpts }).trim();
        if (originalBranchName === 'HEAD') { 
            throw new GitOperationError("Repository is in a detached HEAD state. Please checkout a branch.", "git rev-parse --abbrev-ref HEAD");
        }
    } catch (error: any) {
        const stderr = error.stderr ? error.stderr.toString().trim() : undefined;
        throw new GitOperationError(`Failed to get current Git branch. Details: ${error.message}`, "git rev-parse --abbrev-ref HEAD", stderr);
    }

    try {
        const gitStatus = execSync('git status --porcelain', { cwd: CWD, ...execOpts }).trim();
        if (gitStatus) {
            throw new GitOperationError(`Uncommitted changes or untracked files in the repository. Please commit or stash them. Details:\n${gitStatus}`, "git status --porcelain");
        }
    } catch (error: any) {
        const stderr = error.stderr ? error.stderr.toString().trim() : undefined;
        throw new GitOperationError(`Failed to check Git status. Details: ${error.message}`, "git status --porcelain", stderr);
    }

    console.log(`Starting automatic taylored block extraction for extensions '${extensionsInput}' in directory '${CWD}'. Original branch: '${originalBranchName}', Target branch for computed: '${branchName}'`);

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    try {
        await fs.mkdir(tayloredDir, { recursive: true });
    } catch (error: any) {
        // Using a generic error here as it's an FS issue, not specific enough for FileNotFoundError unless we check error.code
        throw new Error(`Could not create directory '${tayloredDir}'. Details: ${error.message}`);
    }

    const extensions = extensionsInput.split(',').map(ext => ext.trim().replace(/^\./, ''));
    const allFilesToScan: string[] = [];
    const CWD_ABS = path.resolve(CWD);

    for (const ext of extensions) {
        if (!ext) continue;
        try {
            const filesForExtension = await findFilesRecursive(CWD_ABS, `.${ext}`, [], excludeDirs, CWD_ABS);
            allFilesToScan.push(...filesForExtension);
        } catch (error: any) { // Should be caught by findFilesRecursive and logged as warning there
            console.error(`Error during file scanning for extension '.${ext}': ${error.message}`);
        }
    }

    if (allFilesToScan.length === 0) {
        console.log(`No files found with specified extensions: ${extensionsInput}`);
        return;
    }

    console.log(`Found ${allFilesToScan.length} unique file(s) with specified extensions. Processing...`);

    const blockParser = new BlockParser();
    const gitProcessor = new GitProcessor(CWD, originalBranchName);
    let totalBlocksProcessed = 0;
    const asyncOperations: Promise<void>[] = [];

    for (const filePath of allFilesToScan) {
        let fileContent: string;
        try {
            fileContent = await fs.readFile(filePath, 'utf-8');
        } catch (readError: any) {
            console.warn(`Warning: Error reading file '${filePath}': ${readError.message}. Skipping this file.`);
            continue;
        }

        const parsedBlocks = blockParser.parse(fileContent, filePath);
        if (parsedBlocks.length === 0) continue;

        for (const block of parsedBlocks) {
            const { number, compute, async: asyncFlag, disabled } = block.attributes;

            if (disabled) {
                console.log(`Skipping disabled block ${number} from ${filePath}.`);
                continue;
            }

            const targetTayloredFileName = `${number}${TAYLORED_FILE_EXTENSION}`;
            const targetTayloredFilePath = path.join(tayloredDir, targetTayloredFileName);

            console.log(`Processing block ${number} from ${filePath}...`);

            // Check for existing .taylored file before starting any processing for this block
            try {
                await fs.access(targetTayloredFilePath);
                console.error(`CRITICAL ERROR: Target file ${targetTayloredFilePath} for block ${number} already exists. Please remove or rename it.`);
                continue; // Skip this block
            } catch (error: any) {
                if (error.code !== 'ENOENT') {
                     console.error(`CRITICAL ERROR: Could not check for existing file ${targetTayloredFilePath}. Details: ${error.message}`);
                     continue; // Skip this block
                }
            }

            const operation = async () => {
                try {
                    let patchContent: string;
                    if (compute !== undefined) { // Compute block
                        let scriptToExecute = block.content.trim();
                        if (compute.length > 0) { // compute serves as computeStripChars
                            let processedContent = scriptToExecute;
                            const patterns = compute.split(',');
                            for (const pattern of patterns) {
                                const trimmedPattern = pattern.trim();
                                if (trimmedPattern.length > 0) {
                                    processedContent = processedContent.replaceAll(trimmedPattern, '');
                                }
                            }
                            scriptToExecute = processedContent.trim();
                        }

                        const computedContent = await executeScript(scriptToExecute, CWD);
                        patchContent = await gitProcessor.createComputedPatch(block, computedContent, branchName);
                        console.log(`Successfully processed computed block ${number} from ${filePath}. Patch generated for diff against '${branchName}'.`);
                    } else { // Static block
                        patchContent = await gitProcessor.createStaticPatch(block);
                        console.log(`Successfully processed static block ${number} from ${filePath}.`);
                    }
                    await fs.writeFile(targetTayloredFilePath, patchContent);
                    console.log(`Successfully wrote ${targetTayloredFilePath}`);
                    totalBlocksProcessed++;
                } catch (err: any) {
                    console.error(`CRITICAL ERROR processing block ${number} from ${filePath}: ${err.message}`);
                    if (err instanceof ScriptExecutionError && err.stderr) {
                        console.error(`Script STDERR:\n${err.stderr}`);
                    }
                    if (err instanceof GitOperationError && err.stderr) {
                         console.error(`Git STDERR:\n${err.stderr}`);
                    }
                    // Do not re-throw here if we want other blocks/files to continue processing.
                    // The error is logged, and this specific block's processing stops.
                }
            };

            if (compute !== undefined && asyncFlag) {
                asyncOperations.push(operation());
            } else {
                try {
                    await operation();
                } catch (e) {
                    // Error already logged by operation's catch block.
                    // This catch is to prevent synchronous errors from stopping the whole file loop.
                }
            }
        }
    }

    if (asyncOperations.length > 0) {
        console.log(`Waiting for ${asyncOperations.length} asynchronous block processing operation(s) to complete...`);
        const results = await Promise.allSettled(asyncOperations);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                // Errors are already logged inside the 'operation' function's catch block.
                // We could log a summary here if desired, e.g. which async op failed.
                console.warn(`Asynchronous operation (index ${index}) failed. See previous logs for details.`);
            }
        });
        console.log("All asynchronous operations have settled.");
    }

    if (totalBlocksProcessed === 0) {
        console.log("No taylored blocks were successfully processed to generate patch files.");
    } else {
        console.log(`Finished processing. Successfully generated ${totalBlocksProcessed} taylored file(s).`);
    }
}

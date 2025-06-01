#!/usr/bin/env node

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

/*
Usage:
  (Same usage information as before, but --upgrade will be removed)
*/

import * as fs from 'fs/promises'; // Using fs/promises for async file operations
import * as fsExtra from 'fs-extra'; // For ensureDir
import * as path from 'path';
import { execSync } from 'child_process';
import * as parseDiffModule from 'parse-diff';
import { updatePatchOffsets, extractMessageFromPatch } from './lib/git-patch-offset-updater';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './lib/constants';
import { handleApplyOperation } from './lib/apply-logic';

/**
 * Resolves the taylored file name by appending the default extension if not present.
 * @param userInputFileName The file name input by the user.
 * @returns The resolved file name with the extension.
 */
function resolveTayloredFileName(userInputFileName: string): string {
    if (userInputFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
        return userInputFileName;
    }
    return userInputFileName + TAYLORED_FILE_EXTENSION;
}

function printUsageAndExit(errorMessage?: string, detailed: boolean = false): void {
    if (errorMessage) {
        console.error(`\n${errorMessage}`);
    }
    console.error("\nUsage:");
    console.error(`  taylored --add <taylored_file_name>`);
    console.error(`  taylored --remove <taylored_file_name>`);
    console.error(`  taylored --verify-add <taylored_file_name>`);
    console.error(`  taylored --verify-remove <taylored_file_name>`);
    console.error(`  taylored --save <branch_name>`);
    console.error(`  taylored --list`);
    console.error(`  taylored --offset <taylored_file_name> [--message "Custom commit message"]`);
    console.error(`  taylored --data <taylored_file_name>`);

    if (detailed || errorMessage) {
        console.error("\nArguments:");
        console.error(`  <taylored_file_name>      : Name of the taylored file (e.g., 'my_patch' or 'my_patch${TAYLORED_FILE_EXTENSION}').`);
        console.error(`                            If the '${TAYLORED_FILE_EXTENSION}' extension is omitted, it will be automatically appended.`);
        console.error(`                            Assumed to be in the '${TAYLORED_DIR_NAME}/' directory. Used by apply/remove/verify/offset/data modes.`);
        console.error(`  <branch_name>             : Branch name for 'git diff HEAD <branch_name>' (for --save).`);
        console.error(`                            Output: ${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}`);
        console.error("\nOptions:");
        console.error(`  --add                     : Apply changes from '${TAYLORED_DIR_NAME}/<file_name>' to current directory.`);
        console.error(`  --remove                  : Revert changes from '${TAYLORED_DIR_NAME}/<file_name>' in current directory.`);
        console.error(`  --verify-add              : Dry-run apply from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --verify-remove           : Dry-run revert from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --save                    : Generate diff file into '${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}'.`);
        console.error(`                            (File saved only if diff is all additions or all deletions of lines).`);
        console.error(`  --list                    : List all ${TAYLORED_FILE_EXTENSION} files in the '${TAYLORED_DIR_NAME}/' directory.`);
        console.error(`  --offset                  : Update offsets for a given patch file in '${TAYLORED_DIR_NAME}/'.`);
        console.error(`  --message "Custom Text"   : Optional. Used with --offset. A warning is shown as this is not used by the new offset logic.`);
        console.error(`  --data                    : Extract and print message from a taylored file. Prints empty string if not found.`);
        console.error("\nNote:");
        console.error(`  All commands must be run from the root of a Git repository.`);
        console.error("\nExamples:");
        console.error(`  taylored --add my_changes`);
        console.error(`  taylored --save feature/new-design`);
        console.error(`  taylored --offset my_feature_patch`);
        console.error(`  taylored --data my_feature_patch`);
    }
    process.exit(1);
}

/**
 * Analyzes git diff output to determine if it's "pure" (all additions or all deletions).
 * @param branchName The branch to diff against HEAD.
 * @param CWD The current working directory (Git repository root).
 * @returns An object containing diff output, counts, purity, and success status.
 */
function getAndAnalyzeDiff(branchName: string, CWD: string): { diffOutput?: string; additions: number; deletions: number; isPure: boolean; errorMessage?: string; success: boolean } {
    const command = `git diff HEAD "${branchName.replace(/"/g, '\\"')}"`; // Basic quoting for branch name
    let diffOutput: string | undefined;
    let errorMessage: string | undefined;
    let success = false;
    let additions = 0;
    let deletions = 0;
    let isPure = false;

    try {
        diffOutput = execSync(command, { encoding: 'utf8', cwd: CWD });
        success = true;
    } catch (error: any) {
        if (typeof error.stdout === 'string') {
            diffOutput = error.stdout;
            success = true;
            if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
                // console.warn(`Git stderr (non-fatal) while diffing branch '${branchName}':\n${error.stderr.toString().trim()}`);
            }
        } else {
            errorMessage = `CRITICAL ERROR: 'git diff' command failed for branch '${branchName}'.`;
            if (error.status) errorMessage += ` Exit status: ${error.status}.`;
            if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
                errorMessage += ` Git stderr: ${error.stderr.toString().trim()}.`;
            } else if (error.message) {
                errorMessage += ` Error message: ${error.message}.`;
            }
            errorMessage += ` Attempted command: ${command}.`;
            success = false;
        }
    }

    if (success && typeof diffOutput === 'string') {
        try {
            const parsedDiffFiles: parseDiffModule.File[] = parseDiffModule.default(diffOutput);
            for (const file of parsedDiffFiles) {
                additions += file.additions;
                deletions += file.deletions;
            }
            isPure = (additions > 0 && deletions === 0) || (deletions > 0 && additions === 0) || (additions === 0 && deletions === 0);
        } catch (parseError: any) {
            errorMessage = `CRITICAL ERROR: Failed to parse diff output for branch '${branchName}'. Error: ${parseError.message}`;
            success = false;
        }
    } else if (success && typeof diffOutput !== 'string') {
        errorMessage = `CRITICAL ERROR: Diff output for branch '${branchName}' was unexpectedly undefined despite initial success.`;
        success = false;
    }

    return { diffOutput, additions, deletions, isPure, errorMessage, success };
}

/**
 * Handles the --save operation: generates a .taylored file from a branch diff.
 * @param branchName The name of the branch to diff against HEAD.
 * @param CWD The current working directory (Git repository root).
 */
async function handleSaveOperation(branchName: string, CWD: string): Promise<void> {
    const outputFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    try {
        await fsExtra.ensureDir(targetDirectoryPath);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError;
    }

    const diffResult = getAndAnalyzeDiff(branchName, CWD);

    if (diffResult.success && diffResult.isPure) {
        if (typeof diffResult.diffOutput === 'string') {
            try {
                await fs.writeFile(resolvedOutputFileName, diffResult.diffOutput);
            } catch (writeError: any) {
                console.error(`CRITICAL ERROR: Failed to write diff file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
                throw writeError;
            }
        } else {
            console.error(`CRITICAL ERROR: Diff output is unexpectedly undefined for branch '${branchName}' despite successful analysis.`);
            throw new Error(`Undefined diff output for pure diff on branch '${branchName}'.`);
        }
    } else {
        if (!diffResult.success && diffResult.errorMessage) {
            console.error(diffResult.errorMessage);
        } else {
            console.error(`ERROR: Taylored file '${resolvedOutputFileName}' was NOT generated.`);
            if (!diffResult.isPure) {
                console.error(`Reason: The diff between "${branchName}" and HEAD contains a mix of content line additions and deletions.`);
                console.error(`  Total lines added: ${diffResult.additions}`);
                console.error(`  Total lines deleted: ${diffResult.deletions}`);
                console.error("This script, for the --save operation, requires the diff to consist exclusively of additions or exclusively of deletions (of lines).");
            } else if (typeof diffResult.diffOutput === 'undefined') {
                 console.error(`Reason: Failed to obtain diff output for branch '${branchName}'. This may be due to an invalid branch name or other git error.`);
            } else {
                console.error(`Reason: An unspecified error occurred during diff generation or analysis for branch '${branchName}'.`);
            }
        }
        throw new Error(diffResult.errorMessage || `Failed to save taylored file for branch '${branchName}' due to purity or diff generation issues.`);
    }
}


/**
 * Handles the --list operation: lists all .taylored files.
 * @param CWD The current working directory (Git repository root).
 */
async function handleListOperation(CWD: string): Promise<void> {
    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
    try {
        try {
            const stats = await fs.stat(tayloredDirPath);
            if (!stats.isDirectory()) {
                return;
            }
        } catch (statError: any) {
            if (statError.code === 'ENOENT') {
                return;
            }
            console.error(`CRITICAL ERROR: Could not access directory '${tayloredDirPath}'. Details: ${statError.message}`);
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
                // console.warn(`WARN: Could not process entry '${entryPath}': ${fileStatError.message}`);
            }
        }

        if (tayloredFilesList.length === 0) {
        } else {
            tayloredFilesList.sort().forEach(fileName => {
            });
        }
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`);
        throw error;
    }
}

/**
 * Handles the --offset command: updates patch offsets using the new logic.
 * @param userInputFileName The name of the .taylored file (without path).
 * @param CWD The current working directory (Git repository root).
 * @param customCommitMessage Optional custom commit message (will trigger a warning as it's unused).
 */
async function handleOffsetCommand(userInputFileName: string, CWD: string, customCommitMessage?: string): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);
    if (resolvedTayloredFileName !== userInputFileName) {
    }

    if (customCommitMessage) {
    }

    try {
        const result = await updatePatchOffsets(resolvedTayloredFileName, CWD, customCommitMessage);

    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: Failed to update offsets for '${resolvedTayloredFileName}'.`);
        let message = error.message || 'An unknown error occurred during offset update.';
        console.error(`  Error: ${message}`);
        if (error.stderr) {
            console.error(`  Git STDERR details: ${error.stderr}`);
        }
        throw error;
    }
}

/**
 * Handles the '--data' command: extracts and prints the commit message from a taylored file.
 * @param userInputFileName The name of the taylored file provided by the user.
 * @param CWD The current working directory (expected to be the Git repository root).
 */
async function handleDataOperation(userInputFileName: string, CWD: string): Promise<void> {
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    const actualTayloredFilePath = path.join(tayloredDir, resolvedTayloredFileName);

    try {
        await fs.access(actualTayloredFilePath);
        const patchContent = await fs.readFile(actualTayloredFilePath, 'utf8');
        const message = extractMessageFromPatch(patchContent);
        process.stdout.write(message || "");
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found.`);
        } else {
            console.error(`CRITICAL ERROR: Failed to read or process taylored file '${actualTayloredFilePath}'. Details: ${error.message}`);
        }
        throw error;
    }
}

/**
 * Main function to parse arguments and dispatch to handlers.
 */
async function main(): Promise<void> {
    const rawArgs: string[] = process.argv.slice(2);
    const CWD = process.cwd();

    if (rawArgs.length === 0) {
        printUsageAndExit(undefined, true);
        return;
    }

    const mode = rawArgs[0];
    let argument: string | undefined;
    let customMessage: string | undefined;

    // REMOVED '--upgrade' from this list
    const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list', '--offset', '--data'];
    if (relevantModesForGitCheck.includes(mode)) {
        const gitDirPath = path.join(CWD, '.git');
        try {
            const gitDirStats = await fs.stat(gitDirPath);
            if (!gitDirStats.isDirectory()) {
                printUsageAndExit(`CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository.`);
            }
            if (mode !== '--data') {
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                printUsageAndExit(`CRITICAL ERROR: No '.git' directory found in '${CWD}'. This script must be run from the root of a Git repository.`);
            } else {
                printUsageAndExit(`CRITICAL ERROR: Could not verify '.git' directory presence in '${CWD}'. Details: ${error.message}`);
            }
        }
    }

    try {
        if (mode === '--save') {
            if (rawArgs.length !== 2) {
                printUsageAndExit("CRITICAL ERROR: --save option requires exactly one <branch_name> argument.");
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${argument}' after --save. It cannot start with '--'.`);
            }
            await handleSaveOperation(argument, CWD);
        } else if (mode === '--list') {
            if (rawArgs.length !== 1) {
                printUsageAndExit("CRITICAL ERROR: --list option does not take any arguments.");
            }
            await handleListOperation(CWD);
        } else if (mode === '--offset') {
            if (rawArgs.length < 2) {
                printUsageAndExit("CRITICAL ERROR: --offset option requires at least one <taylored_file_name> argument.");
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid taylored file name '${argument}' after --offset. It cannot start with '--'.`);
            }
            if (argument.includes(path.sep) || argument.includes('/') || argument.includes('\\')) {
                printUsageAndExit(`CRITICAL ERROR: <taylored_file_name> ('${argument}') must be a simple filename without path separators. It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`);
            }

            if (rawArgs.length > 2) {
                if (rawArgs[2] === '--message') {
                    if (rawArgs.length > 3 && rawArgs[3] && !rawArgs[3].startsWith('--')) {
                        customMessage = rawArgs[3];
                    } else {
                        printUsageAndExit("CRITICAL ERROR: --message option for --offset requires a message string argument.");
                    }
                } else {
                     printUsageAndExit(`CRITICAL ERROR: Unknown argument or incorrect usage after --offset <file_name>. Expected optional --message "text", got '${rawArgs[2]}'.`);
                }
            }
             if (rawArgs.length > 4) {
                printUsageAndExit("CRITICAL ERROR: Too many arguments for --offset command.");
            }
            await handleOffsetCommand(argument, CWD, customMessage);
        }
        else if (mode === '--data') {
            if (rawArgs.length !== 2) {
                printUsageAndExit("CRITICAL ERROR: --data option requires exactly one <taylored_file_name> argument.");
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid taylored file name '${argument}' after --data. It cannot start with '--'.`);
            }
            if (argument.includes(path.sep) || argument.includes('/') || argument.includes('\\')) {
                printUsageAndExit(`CRITICAL ERROR: <taylored_file_name> ('${argument}') must be a simple filename without path separators. It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`);
            }
            await handleDataOperation(argument, CWD);
        }
        else {
            const applyModes = ['--add', '--remove', '--verify-add', '--verify-remove'];
            if (applyModes.includes(mode)) {
                if (rawArgs.length !== 2) {
                    printUsageAndExit(`CRITICAL ERROR: ${mode} requires a <taylored_file_name> argument.`);
                }
                const userInputFileName = rawArgs[1];

                if (userInputFileName.startsWith('--')) {
                     printUsageAndExit(`CRITICAL ERROR: Invalid taylored file name '${userInputFileName}' after ${mode}. It cannot start with '--'.`);
                }
                if (userInputFileName.includes(path.sep) || userInputFileName.includes('/') || userInputFileName.includes('\\')) {
                    printUsageAndExit(`CRITICAL ERROR: <taylored_file_name> ('${userInputFileName}') must be a simple filename without path separators (e.g., 'my_patch'). It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`);
                }

                const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);
                if (resolvedTayloredFileName !== userInputFileName) {
                }

                let isVerify = false;
                let isReverse = false;
                switch (mode) {
                    case '--add': break;
                    case '--remove': isReverse = true; break;
                    case '--verify-add': isVerify = true; break;
                    case '--verify-remove': isVerify = true; isReverse = true; break;
                }
                await handleApplyOperation(resolvedTayloredFileName, isVerify, isReverse, mode, CWD);
            } else {
                printUsageAndExit(`CRITICAL ERROR: Unknown option or command '${mode}'.`, true);
            }
        }
    } catch (error: any) {
        process.exit(1);
    }
}

main();

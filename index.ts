#!/usr/bin/env node

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// Main command-line interface for Taylored
// See printUsageAndExit() for detailed usage information.

import * as fs from 'fs/promises'; // Using fs/promises for async file operations
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './lib/constants';
import { handleApplyOperation } from './lib/apply-logic';
import { handleSaveOperation } from './lib/handlers/save-handler';
import { handleListOperation } from './lib/handlers/list-handler';
import { handleOffsetCommand } from './lib/handlers/offset-handler';
import { handleDataOperation } from './lib/handlers/data-handler';
import { handleAutomaticOperation } from './lib/handlers/automatic-handler';
import { resolveTayloredFileName, printUsageAndExit, getAndAnalyzeDiff } from './lib/utils';

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

    // List of modes that require a .git directory check
    const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list', '--offset', '--data', '--automatic'];
    if (relevantModesForGitCheck.includes(mode)) {
        const gitDirPath = path.join(CWD, '.git');
        try {
            const gitDirStats = await fs.stat(gitDirPath);
            if (!gitDirStats.isDirectory()) {
                printUsageAndExit(`CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository.`);
            }
            // The empty if (mode !== '--data') {} block was here. It has been removed.
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
        else if (mode === '--automatic') {
            let extensionsInput: string;
            let branchNameArgument: string;
            let excludeDirs: string[] | undefined;

            if (rawArgs.length === 3) {
                extensionsInput = rawArgs[1];
                branchNameArgument = rawArgs[2];
            } else if (rawArgs.length === 5) {
                extensionsInput = rawArgs[1];
                branchNameArgument = rawArgs[2];
                if (rawArgs[3] !== '--exclude') {
                    printUsageAndExit("CRITICAL ERROR: Expected '--exclude' as the fourth argument for --automatic with 5 arguments.");
                }
                const excludeArgument = rawArgs[4];
                if (excludeArgument.startsWith('--')) {
                    printUsageAndExit(`CRITICAL ERROR: Invalid exclude argument '${excludeArgument}'. It cannot start with '--'.`);
                }
                // Further validation for excludeArgument can be added here if needed (e.g., empty string)
                excludeDirs = excludeArgument.split(',').map(dir => dir.trim()).filter(dir => dir.length > 0);
                if (excludeDirs.length === 0 && excludeArgument.length > 0) {
                     printUsageAndExit(`CRITICAL ERROR: Exclude argument '${excludeArgument}' resulted in an empty list of directories.`);
                } else if (excludeDirs.length === 0 && excludeArgument.length === 0) {
                    // Allow empty string to mean no exclusions, effectively same as not providing --exclude
                    excludeDirs = undefined;
                }

            } else {
                printUsageAndExit("CRITICAL ERROR: --automatic option requires either 2 arguments (<EXTENSIONS> <branch_name>) or 4 arguments (<EXTENSIONS> <branch_name> --exclude <DIR_LIST>).");
                return; // Explicitly exit path for TSC
            }

            if (extensionsInput.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid extensions input '${extensionsInput}' after --automatic. It cannot start with '--'.`);
            }
            // Basic validation for extension format
            if (extensionsInput.includes(path.sep) || extensionsInput.includes('/') || extensionsInput.includes('\\')) {
                printUsageAndExit(`CRITICAL ERROR: <EXTENSIONS> ('${extensionsInput}') must be a simple extension string (e.g., 'ts,js,py') without path separators.`);
            }

            if (branchNameArgument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${branchNameArgument}' after --automatic <EXTENSIONS>. It cannot start with '--'.`);
            }
            await handleAutomaticOperation(extensionsInput, branchNameArgument, CWD, excludeDirs);
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
        // console.error(`Error caught in main, re-throwing: ${error.message}`); // Optional debug
        // Re-throwing the error should cause the node process to exit with a non-zero status code,
        // which is typically 1 for unhandled exceptions.
        throw error;
    }
}

main().catch((err) => {
    // This catch is for the promise returned by main().
    // If main() throws (due to the 'throw error' above), this will catch it.
    // We want to ensure Node.js exits with a non-zero code.
    // process.exit(1) here ensures that even if the unhandled rejection itself
    // doesn't guarantee the status code seen by execSync in all environments,
    // this explicit exit will.
    const errorMessage = err && err.message ? err.message : 'Unknown error in main().catch';
    console.error(`Error in main().catch: ${errorMessage}`);
    process.exit(1);
});

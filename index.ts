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
import { handleAutomaticOperation } from './lib/handlers/automatic-handler';
import { resolveTayloredFileName, printUsageAndExit } from './lib/utils';

// <taylored number="9001">
// Import new Taysell handlers
import { handleSetupBackend } from './lib/handlers/setup-backend-handler';
import { handleCreateTaysell } from './lib/handlers/create-taysell-handler';
import { handleBuyCommand } from './lib/handlers/buy-handler';
// </taylored>

/**
 * Main function to parse arguments and dispatch to handlers.
 */
async function main(): Promise<void> {
    const rawArgs: string[] = process.argv.slice(2);
    const CWD = process.cwd();

    if (rawArgs.length === 0) {
        printUsageAndExit(undefined, true); // Consider updating usage for new commands
        return;
    }

    const mode = rawArgs[0];
    let argument: string | undefined;
    let branchName: string | undefined; // Re-used for some commands, ensure clarity

    // List of modes that require a .git directory check (original list)
    const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list', '--offset', '--automatic'];

    // Only run .git check if it's one of the original commands
    if (relevantModesForGitCheck.includes(mode)) {
        const gitDirPath = path.join(CWD, '.git');
        try {
            const gitDirStats = await fs.stat(gitDirPath);
            if (!gitDirStats.isDirectory()) {
                printUsageAndExit(`CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository for the command '${mode}'.`);
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                printUsageAndExit(`CRITICAL ERROR: No '.git' directory found in '${CWD}'. The command '${mode}' must be run from the root of a Git repository.`);
            } else {
                printUsageAndExit(`CRITICAL ERROR: Could not verify '.git' directory presence for '${mode}' in '${CWD}'. Details: ${error.message}`);
            }
        }
    }

    try {
        if (mode === '--save') {
            // ... (existing --save logic)
            if (rawArgs.length !== 2) {
                printUsageAndExit("CRITICAL ERROR: --save option requires exactly one <branch_name> argument.");
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${argument}' after --save. It cannot start with '--'.`);
            }
            await handleSaveOperation(argument, CWD);
        } else if (mode === '--list') {
            // ... (existing --list logic)
            if (rawArgs.length !== 1) {
                printUsageAndExit("CRITICAL ERROR: --list option does not take any arguments.");
            }
            await handleListOperation(CWD);
        } else if (mode === '--offset') {
            // ... (existing --offset logic)
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
            branchName = undefined;
            let currentArgIndex = 2;
            if (rawArgs.length > currentArgIndex && !rawArgs[currentArgIndex].startsWith('--')) {
                branchName = rawArgs[currentArgIndex];
                if (branchName.startsWith('--')) {
                     printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${branchName}' provided for --offset. It cannot start with '--'.`);
                }
                currentArgIndex++;
            }
            if (rawArgs.length > currentArgIndex) {
                printUsageAndExit(`CRITICAL ERROR: Unknown or unexpected argument '${rawArgs[currentArgIndex]}' for --offset. Expected optional [BRANCH_NAME] only.`);
            }
            await handleOffsetCommand(argument, CWD, branchName);
        } else if (mode === '--automatic') {
            // ... (existing --automatic logic)
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
                excludeDirs = excludeArgument.split(',').map(dir => dir.trim()).filter(dir => dir.length > 0);
                if (excludeDirs.length === 0 && excludeArgument.length > 0) {
                     printUsageAndExit(`CRITICAL ERROR: Exclude argument '${excludeArgument}' resulted in an empty list of directories.`);
                } else if (excludeDirs.length === 0 && excludeArgument.length === 0) {
                    excludeDirs = undefined;
                }
            } else {
                printUsageAndExit("CRITICAL ERROR: --automatic option requires either 2 arguments (<EXTENSIONS> <branch_name>) or 4 arguments (<EXTENSIONS> <branch_name> --exclude <DIR_LIST>).");
                return;
            }
            if (extensionsInput.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid extensions input '${extensionsInput}' after --automatic. It cannot start with '--'.`);
            }
            if (extensionsInput.includes(path.sep) || extensionsInput.includes('/') || extensionsInput.includes('\\')) {
                printUsageAndExit(`CRITICAL ERROR: <EXTENSIONS> ('${extensionsInput}') must be a simple extension string (e.g., 'ts,js,py') without path separators.`);
            }
            if (branchNameArgument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${branchNameArgument}' after --automatic <EXTENSIONS>. It cannot start with '--'.`);
            }
            await handleAutomaticOperation(extensionsInput, branchNameArgument, CWD, excludeDirs);
        }
        // <taylored number="9002">
        // === New Taysell Commands Start Here ===
        else if (mode === 'setup-backend') { // Changed from --setup-backend to setup-backend
            if (rawArgs.length !== 1) {
                printUsageAndExit("CRITICAL ERROR: setup-backend command does not take any arguments.");
            }
            await handleSetupBackend(CWD);
        } else if (mode === 'create-taysell') { // Changed from --create-taysell to create-taysell
            if (rawArgs.length < 2) {
                printUsageAndExit("CRITICAL ERROR: create-taysell command requires at least one <file.taylored> argument.");
            }
            const tayloredFile = rawArgs[1];
            if (tayloredFile.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid <file.taylored> argument '${tayloredFile}'. It cannot start with '--'.`);
            }

            let price: string | undefined;
            let description: string | undefined;

            // Parse optional arguments: --price and --desc
            for (let i = 2; i < rawArgs.length; i++) {
                if (rawArgs[i] === '--price') {
                    if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
                        price = rawArgs[i + 1];
                        i++; // consume value
                    } else {
                        printUsageAndExit("CRITICAL ERROR: --price option requires a value.");
                    }
                } else if (rawArgs[i] === '--desc') {
                    if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
                        description = rawArgs[i + 1];
                        i++; // consume value
                    } else {
                        printUsageAndExit("CRITICAL ERROR: --desc option requires a value.");
                    }
                } else {
                    printUsageAndExit(`CRITICAL ERROR: Unknown option '${rawArgs[i]}' for create-taysell.`);
                }
            }
            await handleCreateTaysell(tayloredFile, price, description, CWD);
        } else if (mode === '--buy') {
            if (rawArgs.length < 2) {
                printUsageAndExit("CRITICAL ERROR: --buy option requires a <file.taysell> argument.");
            }
            const taysellFile = rawArgs[1];
            if (taysellFile.startsWith('--') && taysellFile !== '--dry-run') {
                 printUsageAndExit(`CRITICAL ERROR: Invalid <file.taysell> argument '${taysellFile}'. It cannot start with '--' unless it's --dry-run.`);
            }

            let isDryRun = false;
            let taysellFileArgIndex = 1;

            if (rawArgs[1] === '--dry-run') {
                isDryRun = true;
                if (rawArgs.length < 3 || rawArgs[2].startsWith('--')) {
                    printUsageAndExit("CRITICAL ERROR: --buy --dry-run requires a <file.taysell> argument after --dry-run.");
                }
                taysellFileArgIndex = 2;
            } else if (rawArgs.length > 2) {
                if (rawArgs[2] === '--dry-run') {
                    isDryRun = true;
                    if (rawArgs.length > 3) {
                         printUsageAndExit("CRITICAL ERROR: Unknown argument after --buy <file.taysell> --dry-run.");
                    }
                } else {
                    printUsageAndExit(`CRITICAL ERROR: Unknown argument '${rawArgs[2]}' for --buy.`);
                }
            }
             const finalTaysellFile = rawArgs[taysellFileArgIndex];
             if (finalTaysellFile.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid <file.taysell> argument '${finalTaysellFile}' for --buy. It cannot start with '--'.`);
            }

            await handleBuyCommand(finalTaysellFile, isDryRun, CWD);
        }
        // === End New Taysell Commands ===
        // </taylored>
        else { // Original logic for --add, --remove, etc.
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
                printUsageAndExit(`CRITICAL ERROR: Unknown option or command '${mode}'.`, true); // Update usage
            }
        }
    } catch (error: any) {
        // console.error(`Error caught in main: ${error.message}`); // Keep for debugging if needed
        // Ensure specific error messages from handlers are preserved if they printUsageAndExit themselves.
        // If error is thrown and not caught by a printUsageAndExit, it will be caught by the final catch block.
        if (!error.message.includes("CRITICAL ERROR")) { // Avoid double printing if already handled
             console.error(`An unexpected error occurred: ${error.message}`);
        }
        process.exit(1); // Exit for errors not handled by printUsageAndExit
    }
}

main().catch((err) => {
    const errorMessage = err && err.message ? err.message : 'Unknown error in main().catch';
    if (!errorMessage.includes("CRITICAL ERROR")) { // Avoid double printing
        console.error(`Error in main().catch: ${errorMessage}`);
    }
    process.exit(1);
});

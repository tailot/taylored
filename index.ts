#!/usr/bin/env node

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as path from 'path';
import {
    TAYLORED_DIR_NAME,
    CMD_SAVE,
    CMD_LIST,
    CMD_OFFSET,
    CMD_AUTOMATIC,
    CMD_SETUP_BACKEND,
    CMD_CREATE_TAYSELL,
    CMD_BUY,
    CMD_ADD,
    CMD_REMOVE,
    CMD_VERIFY_ADD,
    CMD_VERIFY_REMOVE,
    ARG_EXCLUDE,
    ARG_PRICE,
    ARG_DESC,
    ARG_DRY_RUN,
} from './lib/constants';
import { handleApplyOperation } from './lib/apply-logic';
import { handleSaveOperation } from './lib/handlers/save-handler';
import { handleListOperation } from './lib/handlers/list-handler';
import { handleOffsetCommand } from './lib/handlers/offset-handler';
import { handleAutomaticOperation } from './lib/handlers/automatic-handler';
import {
    resolveTayloredFileName,
    printUsageAndExit,
    ensureGitRepository,
    validateExactArgCount,
    validateMinArgCount,
    ensureArgumentNotFlag,
    validateTayloredFileNameFormat,
    validateStringArgument,
    checkForUnexpectedArgs,
} from './lib/utils';

// Import new Taysell handlers
import { handleSetupBackend } from './lib/handlers/setup-backend-handler';
import { handleCreateTaysell } from './lib/handlers/create-taysell-handler';
import { handleBuyCommand } from './lib/handlers/buy-handler';

// --- Command Processing Functions ---

async function processSaveCommand(args: string[], CWD: string): Promise<void> {
    await ensureGitRepository(CWD, CMD_SAVE);
    validateExactArgCount(args.length, 1, CMD_SAVE, '<branch_name>');
    const branchName = args[0];
    validateStringArgument(branchName, '<branch_name>', CMD_SAVE);
    await handleSaveOperation(branchName, CWD);
}

async function processListCommand(args: string[], CWD: string): Promise<void> {
    await ensureGitRepository(CWD, CMD_LIST);
    validateExactArgCount(args.length, 0, CMD_LIST, 'This command takes no arguments.');
    await handleListOperation(CWD);
}

async function processOffsetCommand(args: string[], CWD: string): Promise<void> {
    await ensureGitRepository(CWD, CMD_OFFSET);
    validateMinArgCount(args.length, 1, CMD_OFFSET, '<taylored_file_name> [BRANCH_NAME]');

    const tayloredFileName = args[0];
    validateTayloredFileNameFormat(tayloredFileName, CMD_OFFSET);

    let branchName: string | undefined = undefined;
    if (args.length > 1) {
        branchName = args[1];
        validateStringArgument(branchName, '[BRANCH_NAME]', CMD_OFFSET);
    }
    checkForUnexpectedArgs(args, branchName ? 2 : 1, CMD_OFFSET, 'Expected optional [BRANCH_NAME] only.');
    await handleOffsetCommand(tayloredFileName, CWD, branchName);
}

async function processAutomaticCommand(args: string[], CWD: string): Promise<void> {
    await ensureGitRepository(CWD, CMD_AUTOMATIC);

    let extensionsInput: string;
    let branchNameArgument: string;
    let excludeDirs: string[] | undefined;

    if (args.length === 2 || (args.length === 4 && args[2] === ARG_EXCLUDE)) {
        extensionsInput = args[0];
        branchNameArgument = args[1];

        if (args.length === 4) {
            if (args[2] !== ARG_EXCLUDE) {
                // Should be caught by outer if, but defensive
                printUsageAndExit(
                    `CRITICAL ERROR: Expected '${ARG_EXCLUDE}' as the third argument for ${CMD_AUTOMATIC} with 4 arguments.`
                );
            }
            const excludeArgument = args[3];
            ensureArgumentNotFlag(excludeArgument, `<DIR_LIST> for ${ARG_EXCLUDE}`, CMD_AUTOMATIC);
            if (excludeArgument.trim() === '') {
                // Allow empty exclude list if explicitly provided
                excludeDirs = undefined;
            } else {
                excludeDirs = excludeArgument
                    .split(',')
                    .map((dir) => dir.trim())
                    .filter((dir) => dir.length > 0);
                if (excludeDirs.length === 0 && excludeArgument.length > 0) {
                    // e.g. --exclude ",,"
                    printUsageAndExit(
                        `CRITICAL ERROR: Exclude argument '${excludeArgument}' for ${CMD_AUTOMATIC} resulted in an empty list of directories.`
                    );
                } else if (excludeDirs.length === 0 && excludeArgument.length === 0) {
                    // Should be caught by trim check earlier
                    excludeDirs = undefined;
                }
            }
        }
    } else {
        printUsageAndExit(
            `CRITICAL ERROR: ${CMD_AUTOMATIC} option requires either 2 arguments (<EXTENSIONS> <branch_name>) or 4 arguments (<EXTENSIONS> <branch_name> ${ARG_EXCLUDE} <DIR_LIST>). Received ${args.length} arguments.`
        );
        return; // Unreachable, printUsageAndExit exits
    }

    validateStringArgument(extensionsInput, '<EXTENSIONS>', CMD_AUTOMATIC);
    if (extensionsInput.includes(path.sep) || extensionsInput.includes('/') || extensionsInput.includes('\\')) {
        printUsageAndExit(
            `CRITICAL ERROR: <EXTENSIONS> ('${extensionsInput}') for ${CMD_AUTOMATIC} must be a simple extension string (e.g., 'ts,js,py') without path separators.`
        );
    }
    validateStringArgument(branchNameArgument, '<branch_name>', CMD_AUTOMATIC);

    await handleAutomaticOperation(extensionsInput, branchNameArgument, CWD, excludeDirs);
}

async function processSetupBackendCommand(args: string[], CWD: string): Promise<void> {
    // No ensureGitRepository needed for setup-backend
    validateExactArgCount(args.length, 0, CMD_SETUP_BACKEND, 'This command takes no arguments.');
    await handleSetupBackend(CWD);
}

async function processCreateTaysellCommand(args: string[], CWD: string): Promise<void> {
    // ensureGitRepository might not be strictly needed if the .taylored file can be anywhere,
    // but often .taylored files are related to git. For now, let's assume it's not needed
    // to match the original logic where it wasn't checked for this new command.
    validateMinArgCount(args.length, 1, CMD_CREATE_TAYSELL, '<file.taylored> [--price <price>] [--desc <description>]');

    const tayloredFile = args[0];
    // Not using validateTayloredFileNameFormat as it might be a full path or different extension initially.
    ensureArgumentNotFlag(tayloredFile, '<file.taylored>', CMD_CREATE_TAYSELL);

    let price: string | undefined;
    let description: string | undefined;
    let currentArgIndex = 1;

    while (currentArgIndex < args.length) {
        const option = args[currentArgIndex];
        if (option === ARG_PRICE) {
            currentArgIndex++;
            if (currentArgIndex < args.length && !args[currentArgIndex].startsWith('--')) {
                price = args[currentArgIndex];
                ensureArgumentNotFlag(price, `<value> for ${ARG_PRICE}`, CMD_CREATE_TAYSELL);
            } else {
                printUsageAndExit(`CRITICAL ERROR: ${ARG_PRICE} option requires a value for ${CMD_CREATE_TAYSELL}.`);
            }
        } else if (option === ARG_DESC) {
            currentArgIndex++;
            if (currentArgIndex < args.length && !args[currentArgIndex].startsWith('--')) {
                description = args[currentArgIndex];
                ensureArgumentNotFlag(description, `<value> for ${ARG_DESC}`, CMD_CREATE_TAYSELL);
            } else {
                printUsageAndExit(`CRITICAL ERROR: ${ARG_DESC} option requires a value for ${CMD_CREATE_TAYSELL}.`);
            }
        } else {
            printUsageAndExit(`CRITICAL ERROR: Unknown option '${option}' for ${CMD_CREATE_TAYSELL}.`);
        }
        currentArgIndex++;
    }
    await handleCreateTaysell(tayloredFile, price, description, CWD);
}

async function processBuyCommand(args: string[], CWD: string): Promise<void> {
    // No ensureGitRepository for --buy, as taysell files can be obtained from anywhere.
    validateMinArgCount(args.length, 1, CMD_BUY, '<file.taysell> [--dry-run]');

    let isDryRun = false;
    let taysellFile: string | undefined;
    let taysellFileArgProvided = false;

    if (args[0] === ARG_DRY_RUN) {
        isDryRun = true;
        if (args.length < 2) {
            printUsageAndExit(`CRITICAL ERROR: ${CMD_BUY} ${ARG_DRY_RUN} requires a <file.taysell> argument.`);
        }
        taysellFile = args[1];
        ensureArgumentNotFlag(taysellFile, '<file.taysell>', `${CMD_BUY} ${ARG_DRY_RUN}`);
        taysellFileArgProvided = true;
        checkForUnexpectedArgs(args, 2, CMD_BUY, `after ${ARG_DRY_RUN} <file.taysell>`);
    } else {
        taysellFile = args[0];
        ensureArgumentNotFlag(taysellFile, '<file.taysell>', CMD_BUY);
        taysellFileArgProvided = true;
        if (args.length > 1) {
            if (args[1] === ARG_DRY_RUN) {
                isDryRun = true;
                checkForUnexpectedArgs(args, 2, CMD_BUY, `after <file.taysell> ${ARG_DRY_RUN}`);
            } else {
                printUsageAndExit(
                    `CRITICAL ERROR: Unknown argument '${args[1]}' for ${CMD_BUY}. Expected ${ARG_DRY_RUN} or no argument after <file.taysell>.`
                );
            }
        }
    }

    if (!taysellFileArgProvided || !taysellFile) {
        // Should be caught by earlier checks
        printUsageAndExit(`CRITICAL ERROR: Missing <file.taysell> argument for ${CMD_BUY}.`);
        return; // Unreachable
    }

    await handleBuyCommand(taysellFile, isDryRun, CWD);
}

async function processApplyCommand(mode: string, args: string[], CWD: string): Promise<void> {
    await ensureGitRepository(CWD, mode);
    validateExactArgCount(args.length, 1, mode, '<taylored_file_name>');

    const userInputFileName = args[0];
    validateTayloredFileNameFormat(userInputFileName, mode);
    const resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);

    let isVerify = false;
    let isReverse = false;
    switch (mode) {
        case CMD_ADD:
            break;
        case CMD_REMOVE:
            isReverse = true;
            break;
        case CMD_VERIFY_ADD:
            isVerify = true;
            break;
        case CMD_VERIFY_REMOVE:
            isVerify = true;
            isReverse = true;
            break;
        default: // Should not happen if called correctly
            printUsageAndExit(`CRITICAL ERROR: Unknown apply mode '${mode}'.`);
            return;
    }
    await handleApplyOperation(resolvedTayloredFileName, isVerify, isReverse, mode, CWD);
}

/**
 * Main function to parse arguments and dispatch to handlers.
 */
async function main(): Promise<void> {
    const CWD = process.cwd();
    const topLevelArgs: string[] = process.argv.slice(2);

    if (topLevelArgs.length === 0) {
        printUsageAndExit(undefined, true);
        return;
    }

    const command = topLevelArgs[0];
    const commandArgs = topLevelArgs.slice(1);

    try {
        switch (command) {
            case CMD_SAVE:
                await processSaveCommand(commandArgs, CWD);
                break;
            case CMD_LIST:
                await processListCommand(commandArgs, CWD);
                break;
            case CMD_OFFSET:
                await processOffsetCommand(commandArgs, CWD);
                break;
            case CMD_AUTOMATIC:
                await processAutomaticCommand(commandArgs, CWD);
                break;
            case CMD_SETUP_BACKEND:
                await processSetupBackendCommand(commandArgs, CWD);
                break;
            case CMD_CREATE_TAYSELL:
                await processCreateTaysellCommand(commandArgs, CWD);
                break;
            case CMD_BUY:
                await processBuyCommand(commandArgs, CWD);
                break;
            case CMD_ADD:
            case CMD_REMOVE:
            case CMD_VERIFY_ADD:
            case CMD_VERIFY_REMOVE:
                await processApplyCommand(command, commandArgs, CWD);
                break;
            default:
                printUsageAndExit(`CRITICAL ERROR: Unknown option or command '${command}'.`, true);
        }
    } catch (error: any) {
        // This top-level catch is for unexpected errors thrown by handlers,
        // not for argument validation errors which should be handled by printUsageAndExit.
        if (error && error.message && !error.message.includes('CRITICAL ERROR')) {
            console.error(`An unexpected error occurred: ${error.message}`);
            if (error.stack) {
                // console.error(`Stack trace: ${error.stack}`); // Optional: for more detailed debugging
            }
        } else if (!error || !error.message) {
            console.error(`An unexpected unknown error occurred.`);
        }
        // If it's a "CRITICAL ERROR", printUsageAndExit already handled it and exited.
        // If we are here, it's an unexpected error, so exit(1).
        process.exit(1);
    }
}

main().catch((err) => {
    // This catch is for errors during the async execution of main() itself,
    // or errors that might bypass the try/catch within main().
    const errorMessage = err && err.message ? err.message : 'Unknown error in main().catch';
    if (!errorMessage.includes('CRITICAL ERROR')) {
        console.error(`Fatal error during script execution: ${errorMessage}`);
        if (err && err.stack) {
            // console.error(`Stack trace: ${err.stack}`); // Optional
        }
    }
    process.exit(1);
});

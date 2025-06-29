#!/usr/bin/env node

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// Main command-line interface for Taylored
// See formatUsageMessage() for detailed usage information.

import * as fs from 'fs/promises'; // Using fs/promises for async file operations
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './lib/constants';
import { handleApplyOperation } from './lib/apply-logic';
import { handleSaveOperation } from './lib/handlers/save-handler';
import { handleListOperation } from './lib/handlers/list-handler';
import { handleOffsetCommand } from './lib/handlers/offset-handler';
import { handleAutomaticOperation } from './lib/handlers/automatic-handler';
import { resolveTayloredFileName, formatUsageMessage } from './lib/utils'; // Changed
import {
    CliUsageError,
    GitOperationError,
    PatchPurityError,
    FileNotFoundError,
    ScriptExecutionError,
    PurchaseError,
    BackendSetupError
} from './lib/errors';

// <taylored number="9001">
// Import new Taysell handlers
import { handleSetupBackend } from './lib/handlers/setup-backend-handler';
import { handleCreateTaysell } from './lib/handlers/create-taysell-handler';
import { handleBuyCommand } from './lib/handlers/buy-handler';
// </taylored>

// Add import for PatchAnalyzer
import { PatchAnalyzer } from './lib/PatchAnalyzer';

/**
 * Main command-line interface for the Taylored application.
 *
 * This function serves as the entry point for the Taylored CLI. It parses command-line
 * arguments provided via `process.argv`, determines the requested operation (mode),
 * and then dispatches to the appropriate handler function.
 *
 * Operations include saving changes as patches, applying or removing patches,
 * listing available patches, managing patch offsets, automatically generating patches
 * from marked code blocks, and Taysell commercial patch operations like setting up
 * a backend, creating sellable patches, and buying patches.
 *
 * For detailed information on each command, its arguments, and usage, please refer
 * to DOCUMENTATION.md.
 *
 * The function performs an initial check for the presence of a `.git` directory
 * in the current working directory for commands that operate on Git history or
 * require a Git repository context (e.g., --save, --add, --list, --offset, --automatic).
 *
 * It handles argument validation for each command and calls utility functions
 * like `printUsageAndExit` for errors or help requests.
 *
 * @async
 * @returns {Promise<void>} A promise that resolves when the command processing is complete,
 * or rejects if an unhandled error occurs.
 * @throws {Error} Throws an error if critical issues prevent command execution,
 * though most specific errors are handled by calling `printUsageAndExit`
 * and exiting the process.
 */
async function main(): Promise<void> {
    const rawArgs: string[] = process.argv.slice(2);
    const CWD = process.cwd();

    // Special case: No arguments provided.
    // Throw a specific CliUsageError that the global handler will catch
    // to print full usage and exit cleanly with code 0.
    if (rawArgs.length === 0) {
        throw new CliUsageError("No command provided. Displaying usage.", true);
    }

    const mode = rawArgs[0];
    let argument: string | undefined;
    let branchName: string | undefined;

    // Wrap main command processing in a try block
    try {
        const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list', '--offset', '--automatic', '--upgrade'];

        if (relevantModesForGitCheck.includes(mode)) {
            const gitDirPath = path.join(CWD, '.git');
            try {
                const gitDirStats = await fs.stat(gitDirPath);
                if (!gitDirStats.isDirectory()) {
                    throw new GitOperationError(`A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository for the command '${mode}'.`);
                }
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    throw new GitOperationError(`No '.git' directory found in '${CWD}'. The command '${mode}' must be run from the root of a Git repository.`);
                } else if (error instanceof GitOperationError) { // Re-throw if already our custom type
                    throw error;
                }
                // For other fs.stat errors, wrap them
                throw new GitOperationError(`Could not verify '.git' directory presence for '${mode}' in '${CWD}'. Details: ${error.message}`);
            }
        }

        if (mode === '--save') {
            if (rawArgs.length !== 2) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --save option requires exactly one <branch_name> argument.", true));
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid branch name '${argument}' after --save. It cannot start with '--'.`, true));
            }
            await handleSaveOperation(argument, CWD);
        } else if (mode === '--list') {
            if (rawArgs.length !== 1) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --list option does not take any arguments.", true));
            }
            await handleListOperation(CWD);
        } else if (mode === '--offset') {
            if (rawArgs.length < 2) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --offset option requires at least one <taylored_file_name> argument.", true));
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid taylored file name '${argument}' after --offset. It cannot start with '--'.`, true));
            }
            if (argument.includes(path.sep) || argument.includes('/') || argument.includes('\\')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: <taylored_file_name> ('${argument}') must be a simple filename without path separators. It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`, true));
            }
            branchName = undefined;
            let currentArgIndex = 2;
            if (rawArgs.length > currentArgIndex && !rawArgs[currentArgIndex].startsWith('--')) {
                branchName = rawArgs[currentArgIndex];
                if (branchName.startsWith('--')) {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid branch name '${branchName}' provided for --offset. It cannot start with '--'.`, true));
                }
                currentArgIndex++;
            }
            if (rawArgs.length > currentArgIndex) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Unknown or unexpected argument '${rawArgs[currentArgIndex]}' for --offset. Expected optional [BRANCH_NAME] only.`, true));
            }
            await handleOffsetCommand(argument, CWD, branchName);
        } else if (mode === '--automatic') {
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
                    throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: Expected '--exclude' as the fourth argument for --automatic with 5 arguments.", true));
                }
                const excludeArgument = rawArgs[4];
                if (excludeArgument.startsWith('--')) {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid exclude argument '${excludeArgument}'. It cannot start with '--'.`, true));
                }
                excludeDirs = excludeArgument.split(',').map(dir => dir.trim()).filter(dir => dir.length > 0);
                if (excludeDirs.length === 0 && excludeArgument.length > 0) {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Exclude argument '${excludeArgument}' resulted in an empty list of directories.`, true));
                } else if (excludeDirs.length === 0 && excludeArgument.length === 0) {
                    excludeDirs = undefined;
                }
            } else {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --automatic option requires either 2 arguments (<EXTENSIONS> <branch_name>) or 4 arguments (<EXTENSIONS> <branch_name> --exclude <DIR_LIST>).", true));
            }
            if (extensionsInput.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid extensions input '${extensionsInput}' after --automatic. It cannot start with '--'.`, true));
            }
            if (extensionsInput.includes(path.sep) || extensionsInput.includes('/') || extensionsInput.includes('\\')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: <EXTENSIONS> ('${extensionsInput}') must be a simple extension string (e.g., 'ts,js,py') without path separators.`, true));
            }
            if (branchNameArgument.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid branch name '${branchNameArgument}' after --automatic <EXTENSIONS>. It cannot start with '--'.`, true));
            }
            await handleAutomaticOperation(extensionsInput, branchNameArgument, CWD, excludeDirs);
        } else if (mode === '--upgrade') {
            if (rawArgs.length < 2 || rawArgs.length > 3) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --upgrade option requires a <patch_file> argument and optionally a [target_file_path].", true));
            }
            const patchFile = rawArgs[1];
            if (patchFile.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid patch file argument '${patchFile}'. It cannot start with '--'.`, true));
            }
            const resolvedPatchFileName = resolveTayloredFileName(patchFile);
            const fullPatchPath = path.join(CWD, TAYLORED_DIR_NAME, resolvedPatchFileName);
            
            let targetFilePath: string | undefined;
            if (rawArgs.length === 3) {
                targetFilePath = path.resolve(CWD, rawArgs[2]);
            }

            // PatchAnalyzer related errors will be generic Errors or specific ones if defined by PatchAnalyzer
            // These will be caught by the global try...catch.
            const analyzer = new PatchAnalyzer();
            const results = await analyzer.verifyIntegrityAndUpgrade(fullPatchPath, targetFilePath);

            console.log(`\n=== Report for --upgrade command ===`);
            results.forEach(result => {
                console.log(`File: ${result.file}`);
                console.log(`Status: ${result.status.toUpperCase()}`);
                console.log(`Message: ${result.message}`);
                if (result.updated) {
                    console.log(`Patch updated: YES`);
                } else {
                    console.log(`Patch updated: NO`);
                }
                if (result.blocks && result.blocks.length > 0) {
                    console.log(`  Modification blocks checked: ${result.blocks.length}`);
                    result.blocks.forEach((blockCheck, index) => {
                        console.log(`    Block ${index + 1} (${blockCheck.blockType}):`);
                        console.log(`      Top Frame: ${blockCheck.topFrame.intact ? 'INTACT' : 'MODIFIED/MISSING'}`);
                        if (!blockCheck.topFrame.intact) {
                            console.log(`        Expected: "${blockCheck.topFrame.expected}"`);
                            console.log(`        Actual:    "${blockCheck.topFrame.actual}"`);
                        }
                        console.log(`      Bottom Frame: ${blockCheck.bottomFrame.intact ? 'INTACT' : 'MODIFIED/MISSING'}`);
                        if (!blockCheck.bottomFrame.intact) {
                            console.log(`        Expected: "${blockCheck.bottomFrame.expected}"`);
                            console.log(`        Actual:    "${blockCheck.bottomFrame.actual}"`);
                        }
                    });
                }
                console.log('-----------------------------------');
            });
            console.log(`\n--upgrade command completed.`);

        } else if (mode === 'setup-backend') {
            if (rawArgs.length !== 1) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: setup-backend command does not take any arguments.", true));
            }
            await handleSetupBackend(CWD);
        } else if (mode === 'create-taysell') {
            if (rawArgs.length < 2) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: create-taysell command requires at least one <file.taylored> argument.", true));
            }
            const tayloredFile = rawArgs[1];
            if (tayloredFile.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid <file.taylored> argument '${tayloredFile}'. It cannot start with '--'.`, true));
            }
            let price: string | undefined;
            let description: string | undefined;
            for (let i = 2; i < rawArgs.length; i++) {
                if (rawArgs[i] === '--price') {
                    if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
                        price = rawArgs[i + 1];
                        i++;
                    } else {
                        throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --price option requires a value.", true));
                    }
                } else if (rawArgs[i] === '--desc') {
                    if (i + 1 < rawArgs.length && !rawArgs[i + 1].startsWith('--')) {
                        description = rawArgs[i + 1];
                        i++;
                    } else {
                        throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --desc option requires a value.", true));
                    }
                } else {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Unknown option '${rawArgs[i]}' for create-taysell.`, true));
                }
            }
            await handleCreateTaysell(tayloredFile, price, description, CWD);
        } else if (mode === '--buy') {
            if (rawArgs.length < 2) {
                throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --buy option requires a <file.taysell> argument.", true));
            }
            const taysellFile = rawArgs[1];
            if (taysellFile.startsWith('--') && taysellFile !== '--dry-run') {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid <file.taysell> argument '${taysellFile}'. It cannot start with '--' unless it's --dry-run.`, true));
            }
            let isDryRun = false;
            let taysellFileArgIndex = 1;
            if (rawArgs[1] === '--dry-run') {
                isDryRun = true;
                if (rawArgs.length < 3 || rawArgs[2].startsWith('--')) {
                    throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: --buy --dry-run requires a <file.taysell> argument after --dry-run.", true));
                }
                taysellFileArgIndex = 2;
            } else if (rawArgs.length > 2) {
                if (rawArgs[2] === '--dry-run') {
                    isDryRun = true;
                    if (rawArgs.length > 3) {
                        throw new CliUsageError(formatUsageMessage("CRITICAL ERROR: Unknown argument after --buy <file.taysell> --dry-run.", true));
                    }
                } else {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Unknown argument '${rawArgs[2]}' for --buy.`, true));
                }
            }
            const finalTaysellFile = rawArgs[taysellFileArgIndex];
            if (finalTaysellFile.startsWith('--')) {
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid <file.taysell> argument '${finalTaysellFile}' for --buy. It cannot start with '--'.`, true));
            }
            await handleBuyCommand(finalTaysellFile, isDryRun, CWD);
        } else {
            const applyModes = ['--add', '--remove', '--verify-add', '--verify-remove'];
            if (applyModes.includes(mode)) {
                if (rawArgs.length !== 2) {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: ${mode} requires a <taylored_file_name> argument.`, true));
                }
                const userInputFileName = rawArgs[1];
                if (userInputFileName.startsWith('--')) {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Invalid taylored file name '${userInputFileName}' after ${mode}. It cannot start with '--'.`, true));
                }
                if (userInputFileName.includes(path.sep) || userInputFileName.includes('/') || userInputFileName.includes('\\')) {
                    throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: <taylored_file_name> ('${userInputFileName}') must be a simple filename without path separators (e.g., 'my_patch'). It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`, true));
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
                throw new CliUsageError(formatUsageMessage(`CRITICAL ERROR: Unknown option or command '${mode}'.`, true));
            }
        }
    } catch (error: any) {
        // This is the global error handler.
        if (error instanceof CliUsageError) {
            // Special case for "No command provided" from the initial check
            if (error.message.startsWith("No command provided.") && (error as any).printFullUsage === true) {
                 console.log(formatUsageMessage(undefined,true)); // Print full usage on stdout
                 process.exit(0); // Exit cleanly
            } else {
                // For other CLI errors, formatUsageMessage was already called by the thrower
                console.error(error.message);
                // And then print the full usage guide
                console.log("\n" + formatUsageMessage(undefined, true));
            }
        } else if (error instanceof PatchPurityError) {
            console.error(`CRITICAL ERROR: ${error.message}`);
            console.error(`  Details: Additions: ${error.details.additions}, Deletions: ${error.details.deletions}`);
        } else if (error instanceof GitOperationError) {
            console.error(`CRITICAL GIT ERROR: ${error.message}`);
            if(error.command) {
                console.error(`  Command: ${error.command}`);
            }
            if(error.stderr) {
                console.error(`  Stderr: ${error.stderr}`);
            }
        } else if (error instanceof FileNotFoundError) {
             console.error(`CRITICAL FILE ERROR: ${error.message}`);
        } else if (error instanceof ScriptExecutionError) {
            console.error(`CRITICAL SCRIPT EXECUTION ERROR: ${error.message}`);
            if(error.stdout) console.error(`  STDOUT: ${error.stdout}`);
            if(error.stderr) console.error(`  STDERR: ${error.stderr}`);
            if(error.exitCode !== undefined) console.error(`  EXIT CODE: ${error.exitCode}`);
        } else if (error instanceof PurchaseError) {
            console.error(`CRITICAL PURCHASE ERROR: ${error.message}`);
            console.error(error.assistanceMessage);
        } else if (error instanceof BackendSetupError) {
            console.error(`CRITICAL BACKEND SETUP ERROR: ${error.message}`);
        } else {
            // Generic fallback for unexpected errors
            console.error(`CRITICAL UNHANDLED ERROR: ${error.message || 'An unknown error occurred.'}`);
            if (error.stack && !process.env.JEST_WORKER_ID) {
                console.error(`Stack: ${error.stack}`);
            }
        }
        process.exit(1);
    }
}

// Final catch for any unhandled promise rejections from main() itself if it somehow throws outside the main try/catch.
main().catch((err) => {
    // This should ideally not be reached if all errors within main() are caught by its own try/catch.
    // But as a safeguard:
    const errorMessage = err && err.message ? err.message : 'Unknown fatal error in CLI execution.';
    if (!errorMessage.toUpperCase().includes("CRITICAL")) { // Avoid double "CRITICAL" if it was already added
        console.error(`FATAL UNCAUGHT ERROR: ${errorMessage}`);
    } else {
        console.error(errorMessage);
    }
    if (err.stack && !process.env.JEST_WORKER_ID) {
        console.error(err.stack);
    }
    process.exit(1);
});
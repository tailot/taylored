#!/usr/bin/env node

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

/*
Usage:
  For applying changes from a taylored file:
    taylored --add <taylored_file_name>

  For removing changes specified in a taylored file:
    taylored --remove <taylored_file_name>

  For verifying if changes can be applied (atomicity check):
    taylored --verify-add <taylored_file_name>

  For verifying if changes can be removed (atomicity check):
    taylored --verify-remove <taylored_file_name>

  For generating a taylored file against a branch:
    taylored --save <branch_name>
    (File is saved into .taylored/<branch_name>.taylored only if diff contains exclusively additions or exclusively deletions of lines)

  For listing available taylored files:
    taylored --list

Arguments:
  <taylored_file_name>      : Name of the taylored file (e.g., my_patch.taylored).
                              This file is assumed to be located in the '.taylored/' directory.
                              Used by --add, --remove, --verify-add, --verify-remove.
  <branch_name>             : Name of the branch to diff against HEAD for --save.
                              The output will be .taylored/<branch_name_sanitized>.taylored in the current directory.

Options:
  --add                     : Apply changes from the taylored file (from .taylored/ directory) to the current directory.
  --remove                  : Remove/revert changes (specified in .taylored/<file_name>) from the current directory.
  --verify-add              : Check if the taylored file (from .taylored/ directory) can be applied cleanly.
  --verify-remove           : Check if the taylored file (from .taylored/ directory) can be reverted cleanly.
  --save                    : Generate a taylored file into the '.taylored/' directory.
                              File saved ONLY if diff is purely additions or purely deletions.
  --list                    : List all .taylored files found in the '.taylored/' directory.

Note:
  All operations must be run from the root directory of a Git repository (i.e., a directory containing a '.git' folder).

Example (apply changes):
  taylored --add my_changes.taylored

Example (generate a taylored file - conditional):
  taylored --save feature-branch

Example (list taylored files):
  taylored --list

Description:
  This script has several modes:
  1. Applying/Removing/Verifying Patches: Uses 'git apply' to manage changes.
     Patches are sourced from the '.taylored/' directory and applied to the current working directory.
  2. Generating Taylored Files: Uses 'git diff' to compare a branch with HEAD.
     The diff is saved to '.taylored/<branch_name_sanitized>.taylored' ONLY if it meets the criteria.
  3. Listing Taylored Files: Shows available .taylored files in the '.taylored/' directory.
  The script must be run from the root of a Git repository.
*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import * as parseDiffModule from 'parse-diff';

function printUsageAndExit(detailed: boolean = false): void {
    console.error("Usage:");
    console.error("  taylored --add <taylored_file_name>");
    console.error("  taylored --remove <taylored_file_name>");
    console.error("  taylored --verify-add <taylored_file_name>");
    console.error("  taylored --verify-remove <taylored_file_name>");
    console.error("  taylored --save <branch_name>");
    console.error("  taylored --list");
    if (detailed) {
        console.error("\nArguments:");
        console.error("  <taylored_file_name>      : Name of the .taylored file (e.g., 'my_patch.taylored').");
        console.error("                            Assumed to be in the '.taylored/' directory. Used by apply/remove/verify modes.");
        console.error("  <branch_name>             : Branch name for 'git diff <branch_name> HEAD' (for --save).");
        console.error("                            Output: .taylored/<branch_name_sanitized>.taylored");
        console.error("\nOptions:");
        console.error("  --add                     : Apply changes from '.taylored/<file_name>' to current directory.");
        console.error("  --remove                  : Revert changes from '.taylored/<file_name>' in current directory.");
        console.error("  --verify-add              : Dry-run apply from '.taylored/<file_name>'.");
        console.error("  --verify-remove           : Dry-run revert from '.taylored/<file_name>'.");
        console.error("  --save                    : Generate diff file into '.taylored/<branch_name_sanitized>.taylored'.");
        console.error("                            (File saved only if diff is all additions or all deletions of lines).");
        console.error("  --list                    : List all .taylored files in the '.taylored/' directory.");
        console.error("\nNote:");
        console.error("  All commands must be run from the root of a Git repository.");
        console.error("\nExamples:");
        console.error("  taylored --add changes.taylored");
        console.error("  taylored --save feature/new-design");
        console.error("  taylored --list");
    }
    process.exit(1);
}

async function handleSaveOperation(branchName: string): Promise<void> {
    const outputFileName = `${branchName.replace(/[/\\]/g, '-')}.taylored`;
    const targetDirectoryName = '.taylored';
    const CWD = process.cwd();
    const targetDirectoryPath = path.join(CWD, targetDirectoryName);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    console.log(`INFO: Executing --save operation for branch "${branchName}".`);
    console.log(`  Target output directory: ${targetDirectoryPath}`);
    console.log(`  Target output file: ${resolvedOutputFileName}`);

    try {
        await fs.mkdir(targetDirectoryPath, { recursive: true });
        console.log(`INFO: Ensured directory '${targetDirectoryName}' exists at '${targetDirectoryPath}'.`);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError;
    }

    const command = `git diff "${branchName}" HEAD`;
    let diffOutput: string;
    try {
        diffOutput = execSync(command, { encoding: 'utf8', cwd: CWD });
    } catch (error: any) {
        if (error.status === 1 && typeof error.stdout === 'string') {
            diffOutput = error.stdout;
        } else {
            console.error(`CRITICAL ERROR: 'git diff' command failed or encountered an unexpected issue.`);
            if (error.status) console.error(`  Exit status: ${error.status}`);
            if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
                console.error("  Git stderr:\n", error.stderr.toString());
            }
            if (error.stdout && typeof error.stdout === 'string' && error.stdout.trim() !== '' && error.status !==1) {
                 console.error("  Git stdout:\n", error.stdout.toString());
            }
            if (error.message && !error.stderr && !(error.stdout && error.status ===1) ) console.error("  Error message:", error.message);
            console.error(`  Attempted command: ${command}`);
            throw error;
        }
    }

    const parsedDiffFiles: parseDiffModule.File[] = parseDiffModule.default(diffOutput);
    let cumulativeAdditions = 0;
    let cumulativeDeletions = 0;
    for (const file of parsedDiffFiles) {
        cumulativeAdditions += file.additions;
        cumulativeDeletions += file.deletions;
    }

    const isAllAdditions = cumulativeAdditions > 0 && cumulativeDeletions === 0;
    const isAllDeletions = cumulativeDeletions > 0 && cumulativeAdditions === 0;
    const isEmptyTextualChanges = cumulativeAdditions === 0 && cumulativeDeletions === 0;

    if (isAllAdditions || isAllDeletions || isEmptyTextualChanges) {
        try {
            await fs.writeFile(resolvedOutputFileName, diffOutput);
            console.log(`SUCCESS: Diff file '${resolvedOutputFileName}' created.`);
            if (isEmptyTextualChanges) {
                console.log(`INFO: The diff ${diffOutput.trim() === '' ? 'is empty' : 'contains no textual line changes'}. Additions: 0, Deletions: 0.`);
            } else if (isAllAdditions) {
                console.log(`INFO: The diff contains only additions (${cumulativeAdditions} line(s)).`);
            } else if (isAllDeletions) {
                console.log(`INFO: The diff contains only deletions (${cumulativeDeletions} line(s)).`);
            }
        } catch (writeError: any) {
            console.error(`CRITICAL ERROR: Failed to write diff file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
            throw writeError;
        }
    } else {
        console.error(`ERROR: Taylored file '${resolvedOutputFileName}' was NOT generated.`);
        console.error(`Reason: The diff between "${branchName}" and HEAD contains a mix of content line additions and deletions.`);
        console.error(`  Total lines added: ${cumulativeAdditions}`);
        console.error(`  Total lines deleted: ${cumulativeDeletions}`);
        console.error("This script, for the --save operation, requires the diff to consist exclusively of additions or exclusively of deletions (of lines).");
        throw new Error(`Mixed diff content (Additions: ${cumulativeAdditions}, Deletions: ${cumulativeDeletions}) is not allowed for --save.`);
    }
}

async function handleApplyOperation(
    tayloredFileName: string,
    isVerify: boolean,
    isReverse: boolean,
    modeName: string
): Promise<void> {
    const CWD = process.cwd();
    const tayloredDir = path.join(CWD, '.taylored');
    const actualTayloredFilePath = path.join(tayloredDir, tayloredFileName);

    console.log(`INFO: Initiating ${modeName} operation.`);
    console.log(`  Taylored File:     ${actualTayloredFilePath} (from .taylored/${tayloredFileName})`);
    console.log(`  Project Directory: ${CWD} (current working directory)`);

    if (isVerify) {
        console.log("  Mode:              Verification only (using 'git apply --check').");
    } else {
        console.log("  Mode:              Execution (applying changes to filesystem).");
    }
    if (isReverse) {
        console.log("  Action:            Reverting/Removing differences based on taylored file.");
    } else {
        console.log("  Action:            Applying/Adding differences from taylored file.");
    }

    try {
        await fs.access(actualTayloredFilePath);
    } catch (e: any) {
        console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found or not accessible in '.taylored/' directory.`);
        throw e; 
    }

    let gitApplyCommand = `git apply --verbose`; 
    if (isVerify) {
        gitApplyCommand += " --check";
    }
    if (isReverse) {
        gitApplyCommand += " --reverse";
    }
    gitApplyCommand += ` "${actualTayloredFilePath}"`;

    console.log(`  Executing command in '${CWD}': ${gitApplyCommand}`);

    try {
        execSync(gitApplyCommand, { cwd: CWD, stdio: 'inherit' });
        if (isVerify) {
            console.log(`SUCCESS: Verification for ${modeName} successful. The taylored file ${isReverse ? 'can be reverted' : 'can be applied'} cleanly.`);
        } else {
            console.log(`SUCCESS: ${modeName} operation completed.`);
        }
    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: 'git apply' failed during ${modeName} operation.`);
        if (isVerify) {
            console.error("  Verification failed. The patch may not apply/revert cleanly (atomicity check failed).");
        } else {
            console.error("  Execution failed. The current directory might be in an inconsistent or partially modified state.");
            console.error("  Please check git status.");
        }
        throw error; 
    }
}

/**
 * Handles the --list operation to show taylored files in the .taylored directory.
 */
async function handleListOperation(): Promise<void> {
    const CWD = process.cwd();
    const tayloredDirName = '.taylored';
    const tayloredDirPath = path.join(CWD, tayloredDirName);

    console.log(`INFO: Listing .taylored files from '${tayloredDirPath}'...`);

    try {
        try {
            const stats = await fs.stat(tayloredDirPath);
            if (!stats.isDirectory()) {
                console.log(`INFO: Expected '${tayloredDirName}' to be a directory, but it's not (found at '${tayloredDirPath}').`);
                console.log("No taylored files to list.");
                return;
            }
        } catch (statError: any) {
            if (statError.code === 'ENOENT') {
                console.log(`INFO: Directory '${tayloredDirName}' not found at '${tayloredDirPath}'.`);
                console.log("No taylored files to list.");
                return;
            }
            // For other errors (e.g., permission denied to stat .taylored itself)
            console.error(`CRITICAL ERROR: Could not access directory '${tayloredDirPath}'. Details: ${statError.message}`);
            throw statError;
        }

        const entries = await fs.readdir(tayloredDirPath);
        const tayloredFiles: string[] = [];

        for (const entry of entries) {
            const entryPath = path.join(tayloredDirPath, entry);
            try {
                const entryStat = await fs.stat(entryPath);
                if (entryStat.isFile() && entry.endsWith('.taylored')) {
                    tayloredFiles.push(entry);
                }
            } catch (fileStatError: any) {
                // Silently ignore entries that can't be stat-ed or are not files/don't match criteria
                // Or log a warning for debugging if needed:
                // console.warn(`WARN: Could not process entry '${entryPath}': ${fileStatError.message}`);
            }
        }

        if (tayloredFiles.length === 0) {
            console.log(`INFO: No .taylored files found in '${tayloredDirPath}'.`);
        } else {
            console.log(`\nAvailable .taylored files in '${tayloredDirName}/':`);
            tayloredFiles.sort().forEach(fileName => { // Sort for consistent order
                console.log(`  - ${fileName}`);
            });
        }
    } catch (error: any) { // Catch errors from fs.readdir or rethrown fs.stat errors
        console.error(`CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`);
        throw error; 
    }
}


async function main(): Promise<void> {
    const rawArgs: string[] = process.argv.slice(2);
    const CWD = process.cwd();

    if (rawArgs.length === 0) {
        printUsageAndExit(true);
        return; 
    }

    const mode = rawArgs[0];
    let tayloredFileName: string | undefined;
    let branchName: string | undefined;

    // Git Repository Root Check for all relevant modes
    const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list'];
    if (relevantModesForGitCheck.includes(mode)) {
        const gitDirPath = path.join(CWD, '.git');
        try {
            const gitDirStats = await fs.stat(gitDirPath);
            if (!gitDirStats.isDirectory()) {
                console.error(`CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository.`);
                process.exit(1);
            }
            console.log(`INFO: Verified execution within a Git repository root ('${CWD}').`);
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                console.error(`CRITICAL ERROR: No '.git' directory found in '${CWD}'. This script must be run from the root of a Git repository.`);
            } else {
                console.error(`CRITICAL ERROR: Could not verify '.git' directory presence in '${CWD}'. Details: ${error.message}`);
            }
            process.exit(1);
        }
    }

    try {
        if (mode === '--save') {
            if (rawArgs.length !== 2) {
                console.error("CRITICAL ERROR: --save option requires exactly one <branch_name> argument.");
                printUsageAndExit(); 
            }
            branchName = rawArgs[1];
            if (branchName.startsWith('--')) {
                console.error(`CRITICAL ERROR: Invalid branch name '${branchName}' after --save. It cannot start with '--'.`);
                printUsageAndExit(); 
            }
            await handleSaveOperation(branchName);
        } else if (mode === '--list') {
            if (rawArgs.length !== 1) {
                console.error("CRITICAL ERROR: --list option does not take any arguments.");
                printUsageAndExit();
            }
            await handleListOperation();
        } else {
            const applyModes = ['--add', '--remove', '--verify-add', '--verify-remove'];
            if (applyModes.includes(mode)) {
                if (rawArgs.length !== 2) {
                    console.error(`CRITICAL ERROR: ${mode} requires a <taylored_file_name> argument.`);
                    printUsageAndExit(); 
                }
                tayloredFileName = rawArgs[1];

                if (tayloredFileName.includes(path.sep) || tayloredFileName.includes('/') || tayloredFileName.includes('\\')) {
                    console.error(`CRITICAL ERROR: <taylored_file_name> ('${tayloredFileName}') must be a simple filename without path separators (e.g., 'my_changes.taylored'). It is assumed to be in the '.taylored/' directory.`);
                    printUsageAndExit();
                }
                
                let isVerify = false;
                let isReverse = false;
                switch (mode) {
                    case '--add': break;
                    case '--remove': isReverse = true; break;
                    case '--verify-add': isVerify = true; break;
                    case '--verify-remove': isVerify = true; isReverse = true; break;
                }
                await handleApplyOperation(tayloredFileName, isVerify, isReverse, mode);
            } else {
                console.error(`CRITICAL ERROR: Unknown option or command '${mode}'.`);
                printUsageAndExit(true); 
            }
        }
    } catch (error: any) {
        console.error("\nOperation terminated due to an error.");
        // Specific messages should have been logged by the handlers.
        // If error.message is generic and we want to avoid redundancy, we could check.
        // However, for now, this ensures some feedback if an unlogged error bubbles up.
        // if (error && error.message && !console.error.toString().includes(error.message)) {
        //    console.error(`  Error details: ${error.message}`);
        // }
        process.exit(1);
    }
}

main();
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

  For upgrading existing taylored files:
    taylored --upgrade
    (Re-generates each .taylored file against HEAD, checking for continued purity. Reports conflicts.)

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
  --upgrade                 : Attempt to upgrade all existing .taylored files in the '.taylored/' directory.
                              Each file is re-diffed against HEAD using its name as the branch name.
                              Updates if still pure, otherwise reports as obsolete/conflicted.

Note:
  All operations must be run from the root directory of a Git repository (i.e., a directory containing a '.git' folder).

Example (apply changes):
  taylored --add my_changes.taylored

Example (generate a taylored file - conditional):
  taylored --save feature-branch

Example (list taylored files):
  taylored --list

Example (upgrade taylored files):
  taylored --upgrade

Description:
  This script has several modes:
  1. Applying/Removing/Verifying Patches: Uses 'git apply' to manage changes.
     Patches are sourced from the '.taylored/' directory and applied to the current working directory.
  2. Generating Taylored Files: Uses 'git diff' to compare a branch with HEAD.
     The diff is saved to '.taylored/<branch_name_sanitized>.taylored' ONLY if it meets the criteria.
  3. Listing Taylored Files: Shows available .taylored files in the '.taylored/' directory.
  4. Upgrading Taylored Files: Re-evaluates each existing .taylored file against the current HEAD.
     It attempts to regenerate the diff using the taylored file's name (minus extension) as the branch name.
     If the new diff is still 'pure' (all additions or all deletions), the file is updated.
     If the new diff is mixed, the file is reported as 'obsolete' or 'conflicted' and is not changed.
  The script must be run from the root of a Git repository.
*/

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import * as parseDiffModule from 'parse-diff';

const TAYLORED_DIR_NAME = '.taylored';
const TAYLORED_FILE_EXTENSION = '.taylored';

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
    console.error(`  taylored --upgrade`);

    if (detailed || errorMessage) { // Show details if error or explicitly requested
        console.error("\nArguments:");
        console.error(`  <taylored_file_name>      : Name of the ${TAYLORED_FILE_EXTENSION} file (e.g., 'my_patch${TAYLORED_FILE_EXTENSION}').`);
        console.error(`                            Assumed to be in the '${TAYLORED_DIR_NAME}/' directory. Used by apply/remove/verify modes.`);
        console.error(`  <branch_name>             : Branch name for 'git diff <branch_name> HEAD' (for --save).`);
        console.error(`                            Output: ${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}`);
        console.error("\nOptions:");
        console.error(`  --add                     : Apply changes from '${TAYLORED_DIR_NAME}/<file_name>' to current directory.`);
        console.error(`  --remove                  : Revert changes from '${TAYLORED_DIR_NAME}/<file_name>' in current directory.`);
        console.error(`  --verify-add              : Dry-run apply from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --verify-remove           : Dry-run revert from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --save                    : Generate diff file into '${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}'.`);
        console.error(`                            (File saved only if diff is all additions or all deletions of lines).`);
        console.error(`  --list                    : List all ${TAYLORED_FILE_EXTENSION} files in the '${TAYLORED_DIR_NAME}/' directory.`);
        console.error(`  --upgrade                 : Attempt to upgrade all ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/'.`);
        console.error("\nNote:");
        console.error(`  All commands must be run from the root of a Git repository.`);
        console.error("\nExamples:");
        console.error(`  taylored --add changes${TAYLORED_FILE_EXTENSION}`);
        console.error(`  taylored --save feature/new-design`);
        console.error(`  taylored --list`);
        console.error(`  taylored --upgrade`);
    }
    process.exit(1);
}

async function handleSaveOperation(branchName: string, CWD: string): Promise<void> {
    const outputFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    console.log(`INFO: Executing --save operation for branch "${branchName}".`);
    console.log(`  Target output directory: ${targetDirectoryPath}`);
    console.log(`  Target output file: ${resolvedOutputFileName}`);

    try {
        await fs.mkdir(targetDirectoryPath, { recursive: true });
        console.log(`INFO: Ensured directory '${TAYLORED_DIR_NAME}' exists at '${targetDirectoryPath}'.`);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError;
    }

    const command = `git diff HEAD "${branchName}"`;
    let diffOutput: string;
    try {
        diffOutput = execSync(command, { encoding: 'utf8', cwd: CWD });
    } catch (error: any) {
        if (error.status === 1 && typeof error.stdout === 'string') { // status 1: differences found
            diffOutput = error.stdout;
        } else if (error.status === 0 && typeof error.stdout === 'string') { // status 0: no differences
             diffOutput = error.stdout;
        }else {
            console.error(`CRITICAL ERROR: 'git diff' command failed or encountered an unexpected issue.`);
            if (error.status) console.error(`  Exit status: ${error.status}`);
            if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
                console.error("  Git stderr:\n", error.stderr.toString());
            }
            if (error.stdout && typeof error.stdout === 'string' && error.stdout.trim() !== '' && error.status !==1 && error.status !==0) {
                 console.error("  Git stdout:\n", error.stdout.toString());
            }
            if (error.message && !error.stderr && !(error.stdout && (error.status ===1 || error.status === 0)) ) console.error("  Error message:", error.message);
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
    modeName: string,
    CWD: string
): Promise<void> {
    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    const actualTayloredFilePath = path.join(tayloredDir, tayloredFileName);

    console.log(`INFO: Initiating ${modeName} operation.`);
    console.log(`  Taylored File:     ${actualTayloredFilePath} (from ${TAYLORED_DIR_NAME}/${tayloredFileName})`);
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
        console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found or not accessible in '${TAYLORED_DIR_NAME}/' directory.`);
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

async function handleListOperation(CWD: string): Promise<void> {
    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);

    console.log(`INFO: Listing ${TAYLORED_FILE_EXTENSION} files from '${tayloredDirPath}'...`);

    try {
        try {
            const stats = await fs.stat(tayloredDirPath);
            if (!stats.isDirectory()) {
                console.log(`INFO: Expected '${TAYLORED_DIR_NAME}' to be a directory, but it's not (found at '${tayloredDirPath}').`);
                console.log("No taylored files to list.");
                return;
            }
        } catch (statError: any) {
            if (statError.code === 'ENOENT') {
                console.log(`INFO: Directory '${TAYLORED_DIR_NAME}' not found at '${tayloredDirPath}'.`);
                console.log("No taylored files to list.");
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
            console.log(`INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}'.`);
        } else {
            console.log(`\nAvailable ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/':`);
            tayloredFilesList.sort().forEach(fileName => {
                console.log(`  - ${fileName}`);
            });
        }
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`);
        throw error;
    }
}

async function handleUpgradeOperation(CWD: string): Promise<void> {
    console.log("INFO: Starting --upgrade operation.");
    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);

    let filesInDir: string[];
    try {
        const stats = await fs.stat(tayloredDirPath);
        if (!stats.isDirectory()) {
            console.log(`INFO: Expected '${TAYLORED_DIR_NAME}' to be a directory, but it's not. No files to upgrade.`);
            return;
        }
        filesInDir = await fs.readdir(tayloredDirPath);
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            console.log(`INFO: Directory '${TAYLORED_DIR_NAME}' not found. No files to upgrade.`);
            return;
        }
        console.error(`CRITICAL ERROR: Could not read directory '${tayloredDirPath}'. Details: ${error.message}`);
        throw error;
    }

    const tayloredFilesToUpgrade = filesInDir.filter(f => f.endsWith(TAYLORED_FILE_EXTENSION));

    if (tayloredFilesToUpgrade.length === 0) {
        console.log(`INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}' to upgrade.`);
        return;
    }

    console.log(`INFO: Found ${tayloredFilesToUpgrade.length} ${TAYLORED_FILE_EXTENSION} file(s) to process for upgrade.`);

    let upgradedCount = 0;
    let obsoleteCount = 0;
    let errorCount = 0;

    for (const fileName of tayloredFilesToUpgrade) {
        const assumedBranchName = fileName.replace(new RegExp(`\\${TAYLORED_FILE_EXTENSION}$`), '');
        const filePath = path.join(tayloredDirPath, fileName);
        console.log(`\nINFO: Processing '${fileName}' (assumed branch for diff: '${assumedBranchName}')...`);

        const diffCommand = `git diff HEAD "${assumedBranchName}"`;
        let diffOutput: string | undefined = undefined;

        try {
            diffOutput = execSync(diffCommand, { encoding: 'utf8', cwd: CWD });
        } catch (error: any) {
            if (error.status === 1 && typeof error.stdout === 'string') { // status 1: differences found
                diffOutput = error.stdout;
            } else if (error.status === 0 && typeof error.stdout === 'string') { // status 0: no differences
                diffOutput = error.stdout; // Empty string
            } else {
                console.error(`  ERROR: Failed to generate diff for branch '${assumedBranchName}'. Git command issue.`);
                if (error.status) console.error(`    Exit status: ${error.status}`);
                if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
                     console.error("    Git stderr:\n", error.stderr.toString().trim());
                }
                if (error.stdout && typeof error.stdout === 'string' && error.stdout.trim() !== '' && error.status !==1 && error.status !==0) {
                    console.error("    Git stdout:\n", error.stdout.toString().trim());
                }
                if (error.message && !error.stderr && !(error.stdout && (error.status ===1 || error.status ===0)) ) console.error("    Error message:", error.message);
                console.error(`    Attempted command: ${diffCommand}`);
                errorCount++;
                continue; 
            }
        }
        
        if (typeof diffOutput !== 'string') {
             console.error(`  ERROR: Diff output for branch '${assumedBranchName}' was unexpectedly undefined after git command execution.`);
             errorCount++;
             continue;
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
                await fs.writeFile(filePath, diffOutput);
                console.log(`  SUCCESS: '${fileName}' upgraded successfully.`);
                if (isEmptyTextualChanges) {
                     console.log(`    INFO: The new diff for '${assumedBranchName}' ${diffOutput.trim() === '' ? 'is empty' : 'contains no textual line changes'}.`);
                } else if (isAllAdditions) {
                    console.log(`    INFO: The new diff contains only additions (${cumulativeAdditions} line(s)).`);
                } else if (isAllDeletions) {
                    console.log(`    INFO: The new diff contains only deletions (${cumulativeDeletions} line(s)).`);
                }
                upgradedCount++;
            } catch (writeError: any) {
                console.error(`  ERROR: Failed to write updated taylored file '${filePath}'. Details: ${writeError.message}`);
                errorCount++;
            }
        } else {
            console.warn(`  WARNING: '${fileName}' is now obsolete (conflicted). The file was NOT modified.`);
            console.warn(`    Reason: The diff between assumed branch '${assumedBranchName}' and HEAD now contains a mix of line additions and deletions.`);
            console.warn(`    New diff details - Total lines added: ${cumulativeAdditions}, Total lines deleted: ${cumulativeDeletions}.`);
            obsoleteCount++;
        }
    }

    console.log("\n--- Upgrade Summary ---");
    console.log(`Successfully upgraded: ${upgradedCount} file(s).`);
    console.log(`Found obsolete (conflicted): ${obsoleteCount} file(s).`);
    console.log(`Encountered errors during diff generation: ${errorCount} file(s).`);
    console.log("-----------------------");

    if (obsoleteCount > 0 || errorCount > 0) {
        console.log("\nINFO: For obsolete or error files, manual review is recommended.");
        console.log("      An 'obsolete' file means its corresponding assumed branch, when diffed against HEAD, no longer produces a 'pure' diff.");
        console.log("      This can happen if the branch has been merged, rebased, or changed significantly relative to HEAD.");
        console.log("      Consider regenerating these files with 'taylored --save <original_branch_name>' if the assumed branch name was incorrect.");
        console.log("\n      Limitation reminder: The 'assumed branch for diff' is derived directly from the .taylored filename (e.g., 'my-feat.taylored' -> assumed branch 'my-feat').");
        console.log("      If the original branch name used to create the file contained '/' (e.g., 'feature/my-feat'), this automatic upgrade might fail or use an incorrect branch name if a branch matching the sanitized filename does not reflect the original intent.");
    }
}


async function main(): Promise<void> {
    const rawArgs: string[] = process.argv.slice(2);
    const CWD = process.cwd();

    if (rawArgs.length === 0) {
        printUsageAndExit(undefined, true);
        return;
    }

    const mode = rawArgs[0];
    let tayloredFileName: string | undefined;
    let branchName: string | undefined;

    const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list', '--upgrade'];
    if (relevantModesForGitCheck.includes(mode)) {
        const gitDirPath = path.join(CWD, '.git');
        try {
            const gitDirStats = await fs.stat(gitDirPath);
            if (!gitDirStats.isDirectory()) {
                printUsageAndExit(`CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository.`);
            }
            console.log(`INFO: Verified execution within a Git repository root ('${CWD}').`);
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
            branchName = rawArgs[1];
            if (branchName.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${branchName}' after --save. It cannot start with '--'.`);
            }
            await handleSaveOperation(branchName, CWD);
        } else if (mode === '--list') {
            if (rawArgs.length !== 1) {
                printUsageAndExit("CRITICAL ERROR: --list option does not take any arguments.");
            }
            await handleListOperation(CWD);
        } else if (mode === '--upgrade') {
            if (rawArgs.length !== 1) {
                printUsageAndExit("CRITICAL ERROR: --upgrade option does not take any arguments.");
            }
            await handleUpgradeOperation(CWD);
        }
        else {
            const applyModes = ['--add', '--remove', '--verify-add', '--verify-remove'];
            if (applyModes.includes(mode)) {
                if (rawArgs.length !== 2) {
                    printUsageAndExit(`CRITICAL ERROR: ${mode} requires a <taylored_file_name> argument.`);
                }
                tayloredFileName = rawArgs[1];

                if (tayloredFileName.includes(path.sep) || tayloredFileName.includes('/') || tayloredFileName.includes('\\')) {
                    printUsageAndExit(`CRITICAL ERROR: <taylored_file_name> ('${tayloredFileName}') must be a simple filename without path separators (e.g., 'my_changes${TAYLORED_FILE_EXTENSION}'). It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`);
                }
                if (!tayloredFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
                     printUsageAndExit(`CRITICAL ERROR: <taylored_file_name> ('${tayloredFileName}') must end with '${TAYLORED_FILE_EXTENSION}'.`);
                }

                let isVerify = false;
                let isReverse = false;
                switch (mode) {
                    case '--add': break;
                    case '--remove': isReverse = true; break;
                    case '--verify-add': isVerify = true; break;
                    case '--verify-remove': isVerify = true; isReverse = true; break;
                }
                await handleApplyOperation(tayloredFileName, isVerify, isReverse, mode, CWD);
            } else {
                printUsageAndExit(`CRITICAL ERROR: Unknown option or command '${mode}'.`, true);
            }
        }
    } catch (error: any) {
        console.error("\nOperation terminated due to an error.");
        // Specific messages should have been logged by the handlers.
        // Additional generic error message if not already part of the thrown error.
        if (error && error.message && !error.alreadyLogged) {
           // console.error(`  Error details: ${error.message}`); // Usually redundant if handlers log well
        }
        process.exit(1);
    }
}

main();
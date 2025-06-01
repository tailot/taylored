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

  For updating offsets of an existing taylored file:
    taylored --offset <taylored_file_name> [--message "Custom commit message"]
    (Updates the specified .taylored file. If --message is provided, a warning is shown as it's not used by the new logic.)

  For extracting data (commit message) from a taylored file:
    taylored --data <taylored_file_name>
    (Reads the specified .taylored file and prints the extracted commit message, if any. Prints empty string if not found.)


Arguments:
  <taylored_file_name>      : Name of the taylored file (e.g., 'my_patch' or 'my_patch.taylored').
                              If the '.taylored' extension is omitted, it will be automatically appended.
                              This file is assumed to be located in the '.taylored/' directory.
                              Used by --add, --remove, --verify-add, --verify-remove, --offset, --data.
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
  --offset                  : Update offsets for a given patch file in .taylored/
                              (e.g., my-feature or my-feature.taylored)
  --message "Custom Text"   : Optional. Used with --offset. A warning is shown as this is not used by the new offset logic.
  --data                    : Extract and print the message from a specified .taylored file.
                              Prints an empty string if no message is found.

Note:
  All operations must be run from the root directory of a Git repository (i.e., a directory containing a '.git' folder).

Example (apply changes):
  taylored --add my_changes

Example (generate a taylored file - conditional):
  taylored --save feature-branch

Example (update patch offsets):
  taylored --offset my_changes.taylored

Example (extract data from taylored file):
  taylored --data my_changes

Description:
  This script has several modes including applying/removing patches, generating taylored files,
  listing, upgrading, updating patch offsets, and extracting commit messages from taylored files.
  The script must be run from the root of a Git repository.
*/

import * as fs from 'fs/promises'; // Using fs/promises for async file operations
import * as fsExtra from 'fs-extra'; // For ensureDir
import * as path from 'path';
import { execSync } from 'child_process'; // Retained for simple git apply in some handlers
import * as parseDiffModule from 'parse-diff'; // Used for --save and --upgrade logic
import { updatePatchOffsets, extractMessageFromPatch } from './lib/git-patch-offset-updater';

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
        console.error(`  --upgrade                 : Attempt to upgrade all ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/'.`);
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
        // git diff exits with 1 if there are differences, 0 if no differences.
        // We are interested in the output (stdout) in both cases.
        // A real error (e.g., branch not found) would typically have a different status or no stdout.
        if (typeof error.stdout === 'string') {
            diffOutput = error.stdout;
            success = true; // Treat as success if we got diff output
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
            // Pure if only additions, or only deletions, or no changes at all.
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
    // Sanitize branch name for use as a filename (replace slashes)
    const outputFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    console.log(`INFO: Executing --save operation for branch "${branchName}".`);
    console.log(`  Target output directory: ${targetDirectoryPath}`);
    console.log(`  Target output file: ${resolvedOutputFileName}`);

    try {
        // Ensure the .taylored directory exists
        await fsExtra.ensureDir(targetDirectoryPath);
        console.log(`INFO: Ensured directory '${TAYLORED_DIR_NAME}' exists at '${targetDirectoryPath}'.`);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError; // Propagate error to main
    }

    const diffResult = getAndAnalyzeDiff(branchName, CWD);

    if (diffResult.success && diffResult.isPure) {
        if (typeof diffResult.diffOutput === 'string') {
            try {
                await fs.writeFile(resolvedOutputFileName, diffResult.diffOutput);
                console.log(`SUCCESS: Diff file '${resolvedOutputFileName}' created.`);
                if (diffResult.additions === 0 && diffResult.deletions === 0) {
                    console.log(`INFO: The diff ${diffResult.diffOutput.trim() === '' ? 'is empty' : 'contains no textual line changes'}. Additions: 0, Deletions: 0.`);
                } else if (diffResult.additions > 0) {
                    console.log(`INFO: The diff contains only additions (${diffResult.additions} line(s)).`);
                } else if (diffResult.deletions > 0) {
                    console.log(`INFO: The diff contains only deletions (${diffResult.deletions} line(s)).`);
                }
            } catch (writeError: any) {
                console.error(`CRITICAL ERROR: Failed to write diff file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
                throw writeError;
            }
        } else {
            console.error(`CRITICAL ERROR: Diff output is unexpectedly undefined for branch '${branchName}' despite successful analysis.`);
            throw new Error(`Undefined diff output for pure diff on branch '${branchName}'.`);
        }
    } else {
        // Handle cases where diff generation failed or was not pure
        if (!diffResult.success && diffResult.errorMessage) {
            console.error(diffResult.errorMessage); // Already detailed
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
        // Throw an error to indicate failure of the operation
        throw new Error(diffResult.errorMessage || `Failed to save taylored file for branch '${branchName}' due to purity or diff generation issues.`);
    }
}

/**
 * Handles apply, remove, verify-add, verify-remove operations.
 * @param tayloredFileNameWithExt The full name of the .taylored file.
 * @param isVerify True if it's a verification (dry-run) operation.
 * @param isReverse True if the patch should be applied in reverse (for remove/verify-remove).
 * @param modeName A string representing the current mode (e.g., '--add') for logging.
 * @param CWD The current working directory (Git repository root).
 */
async function handleApplyOperation(
    tayloredFileNameWithExt: string,
    isVerify: boolean,
    isReverse: boolean,
    modeName: string,
    CWD: string
): Promise<void> {
    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    const actualTayloredFilePath = path.join(tayloredDir, tayloredFileNameWithExt);

    console.log(`INFO: Initiating ${modeName} operation.`);
    console.log(`  Taylored File:     ${actualTayloredFilePath} (from ${TAYLORED_DIR_NAME}/${tayloredFileNameWithExt})`);
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
        // Check if the taylored file exists and is accessible
        await fs.access(actualTayloredFilePath);
    } catch (e: any) {
        console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found or not accessible in '${TAYLORED_DIR_NAME}/' directory.`);
        throw e; // Propagate error
    }

    // Construct the git apply command
    // Using --verbose for more output from git apply
    // Using --whitespace=fix to handle potential whitespace issues more gracefully
    // Using --reject to create .rej files instead of failing outright on conflicts,
    // which can be useful for debugging, though the primary check is still the exit code.
    let gitApplyCommand = `git apply --verbose --whitespace=fix --reject`;
    if (isVerify) {
        gitApplyCommand += " --check";
    }
    if (isReverse) {
        gitApplyCommand += " --reverse";
    }
    // Ensure the filepath is quoted, especially if it could contain spaces (though unlikely for .taylored files)
    gitApplyCommand += ` "${actualTayloredFilePath.replace(/"/g, '\\"')}"`;

    console.log(`  Executing command in '${CWD}': ${gitApplyCommand}`);

    try {
        // Execute the command. stdio: 'inherit' shows git's output directly.
        execSync(gitApplyCommand, { cwd: CWD, stdio: 'inherit' });
        if (isVerify) {
            console.log(`SUCCESS: Verification for ${modeName} successful. The taylored file ${isReverse ? 'can be reverted' : 'can be applied'} cleanly.`);
        } else {
            console.log(`SUCCESS: ${modeName} operation completed.`);
        }
    } catch (error: any) {
        // execSync throws an error if the command exits with a non-zero status
        console.error(`\nCRITICAL ERROR: 'git apply' failed during ${modeName} operation.`);
        if (isVerify) {
            console.error("  Verification failed. The patch may not apply/revert cleanly (atomicity check failed).");
        } else {
            console.error("  Execution failed. The current directory might be in an inconsistent or partially modified state.");
            console.error("  Please check git status and any .rej files created.");
        }
        throw error; // Propagate error
    }
}

/**
 * Handles the --list operation: lists all .taylored files.
 * @param CWD The current working directory (Git repository root).
 */
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
            if (statError.code === 'ENOENT') { // Directory doesn't exist
                console.log(`INFO: Directory '${TAYLORED_DIR_NAME}' not found at '${tayloredDirPath}'.`);
                console.log("No taylored files to list.");
                return;
            }
            // Other stat errors (e.g., permission issues)
            console.error(`CRITICAL ERROR: Could not access directory '${tayloredDirPath}'. Details: ${statError.message}`);
            throw statError;
        }

        const entries = await fs.readdir(tayloredDirPath);
        const tayloredFilesList: string[] = [];

        for (const entry of entries) {
            const entryPath = path.join(tayloredDirPath, entry);
            try {
                const entryStat = await fs.stat(entryPath);
                // Ensure it's a file and ends with the correct extension
                if (entryStat.isFile() && entry.endsWith(TAYLORED_FILE_EXTENSION)) {
                    tayloredFilesList.push(entry);
                }
            } catch (fileStatError: any) {
                // Log a warning if an entry inside .taylored cannot be stat'd, but continue listing others
                // console.warn(`WARN: Could not process entry '${entryPath}': ${fileStatError.message}`);
            }
        }

        if (tayloredFilesList.length === 0) {
            console.log(`INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${tayloredDirPath}'.`);
        } else {
            console.log(`\nAvailable ${TAYLORED_FILE_EXTENSION} files in '${TAYLORED_DIR_NAME}/':`);
            tayloredFilesList.sort().forEach(fileName => { // Sort for consistent listing
                console.log(`  - ${fileName}`);
            });
        }
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Failed to list taylored files from '${tayloredDirPath}'. Details: ${error.message}`);
        throw error;
    }
}

/**
 * Handles the --upgrade operation: attempts to update all .taylored files.
 * @param CWD The current working directory (Git repository root).
 */
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
        // Assumed branch name is the filename without the .taylored extension
        const assumedBranchName = fileName.replace(new RegExp(`\\${TAYLORED_FILE_EXTENSION}$`), '');
        const filePath = path.join(tayloredDirPath, fileName);
        console.log(`\nINFO: Processing '${fileName}' (assumed branch for diff: '${assumedBranchName}')...`);

        const diffResult = getAndAnalyzeDiff(assumedBranchName, CWD);

        if (diffResult.success && diffResult.isPure) {
            if (typeof diffResult.diffOutput === 'string') {
                try {
                    await fs.writeFile(filePath, diffResult.diffOutput);
                    console.log(`  SUCCESS: '${fileName}' upgraded successfully.`);
                    if (diffResult.additions === 0 && diffResult.deletions === 0) {
                        console.log(`    INFO: The new diff for '${assumedBranchName}' ${diffResult.diffOutput.trim() === '' ? 'is empty' : 'contains no textual line changes'}.`);
                    } else if (diffResult.additions > 0) {
                        console.log(`    INFO: The new diff contains only additions (${diffResult.additions} line(s)).`);
                    } else if (diffResult.deletions > 0) {
                        console.log(`    INFO: The new diff contains only deletions (${diffResult.deletions} line(s)).`);
                    }
                    upgradedCount++;
                } catch (writeError: any) {
                    console.error(`  ERROR: Failed to write updated taylored file '${filePath}'. Details: ${writeError.message}`);
                    errorCount++;
                }
            } else {
                console.error(`  ERROR: Diff output is unexpectedly undefined for branch '${assumedBranchName}' during upgrade of '${fileName}' despite successful analysis.`);
                errorCount++;
            }
        } else if (diffResult.success && !diffResult.isPure) { // Diff obtained but not pure
            console.warn(`  WARNING: '${fileName}' is now obsolete (conflicted). The file was NOT modified.`);
            console.warn(`    Reason: The diff between assumed branch '${assumedBranchName}' and HEAD now contains a mix of line additions and deletions.`);
            console.warn(`    New diff details - Total lines added: ${diffResult.additions}, Total lines deleted: ${diffResult.deletions}.`);
            obsoleteCount++;
        } else { // !diffResult.success (diff generation failed)
            console.error(`  ERROR: Failed to generate or parse diff for branch '${assumedBranchName}' during upgrade of '${fileName}'.`);
            if (diffResult.errorMessage) {
                const indentedErrorMessage = diffResult.errorMessage.split('\n').map(line => `    ${line}`).join('\n');
                console.error(indentedErrorMessage);
            }
            errorCount++;
        }
    }

    console.log("\n--- Upgrade Summary ---");
    console.log(`Successfully upgraded: ${upgradedCount} file(s).`);
    console.log(`Found obsolete (conflicted): ${obsoleteCount} file(s).`);
    console.log(`Encountered errors during diff generation: ${errorCount} file(s).`);
    console.log("-----------------------");

    if (obsoleteCount > 0 || errorCount > 0) {
        console.log("\nINFO: For obsolete or error files, manual review is recommended.");
    }
}

/**
 * Handles the --offset command: updates patch offsets using the new logic.
 * @param userInputFileName The name of the .taylored file (without path).
 * @param CWD The current working directory (Git repository root).
 * @param customCommitMessage Optional custom commit message (will trigger a warning as it's unused).
 */
async function handleOffsetCommand(userInputFileName: string, CWD: string, customCommitMessage?: string): Promise<void> {
    console.log(`INFO: Initiating --offset operation for taylored file: '${userInputFileName}'.`);
    // customCommitMessage is passed to updatePatchOffsets, which will warn if it's provided but unused.

    let resolvedTayloredFileName = userInputFileName;
    if (!userInputFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
        resolvedTayloredFileName = userInputFileName + TAYLORED_FILE_EXTENSION;
        console.log(`INFO: Using actual file name '${resolvedTayloredFileName}' based on provided name '${userInputFileName}'.`);
    }

    console.log(`  Target Patch File: ${resolvedTayloredFileName} (located in '${TAYLORED_DIR_NAME}/' directory)`);
    console.log(`  Repository Root: ${CWD}`);

    try {
        const result = await updatePatchOffsets(resolvedTayloredFileName, CWD, customCommitMessage);

        // With the new logic, if updatePatchOffsets completes without throwing, it was successful.
        // The detailed logging about operationType, etc., is no longer applicable.
        console.log(`\nSUCCESS: Offset update process for '${resolvedTayloredFileName}' completed.`);
        console.log(`  Updated patch file: ${result.outputPath}`); 
        // The result object from the new updatePatchOffsets only contains outputPath.

    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: Failed to update offsets for '${resolvedTayloredFileName}'.`);
        // The error message from updatePatchOffsets (e.g., "ATTENZIONE: Il file taylored è obsoleto.")
        // will be error.message.
        let message = error.message || 'An unknown error occurred during offset update.';
        
        console.error(`  Error: ${message}`);
        // If the error object has stderr (e.g., from a direct GitExecutionError rethrow)
        if (error.stderr) { // Check if stderr property exists
            console.error(`  Git STDERR details: ${error.stderr}`);
        }
        throw error; // Re-throw to be caught by main, which will exit(1)
    }
}

/**
 * Handles the '--data' command: extracts and prints the commit message from a taylored file.
 * @param userInputFileName The name of the taylored file provided by the user.
 * @param CWD The current working directory (expected to be the Git repository root).
 */
async function handleDataOperation(userInputFileName: string, CWD: string): Promise<void> {
    let resolvedTayloredFileName = userInputFileName;
    if (!userInputFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
        resolvedTayloredFileName = userInputFileName + TAYLORED_FILE_EXTENSION;
    }

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    const actualTayloredFilePath = path.join(tayloredDir, resolvedTayloredFileName);

    try {
        await fs.access(actualTayloredFilePath); // Check if file exists and is accessible
        const patchContent = await fs.readFile(actualTayloredFilePath, 'utf8');
        const message = extractMessageFromPatch(patchContent);
        // Print message or empty string directly to stdout, without extra newline from console.log
        process.stdout.write(message || "");
    } catch (error: any) {
        // Error handling for file not found or other read issues
        if (error.code === 'ENOENT') {
            console.error(`CRITICAL ERROR: Taylored file '${actualTayloredFilePath}' not found.`);
        } else {
            console.error(`CRITICAL ERROR: Failed to read or process taylored file '${actualTayloredFilePath}'. Details: ${error.message}`);
        }
        throw error; // Re-throw to be caught by main, which will exit(1)
    }
}

/**
 * Main function to parse arguments and dispatch to handlers.
 */
async function main(): Promise<void> {
    const rawArgs: string[] = process.argv.slice(2);
    const CWD = process.cwd(); // Current Working Directory

    if (rawArgs.length === 0) {
        printUsageAndExit(undefined, true); // Show detailed usage if no args
        return;
    }

    const mode = rawArgs[0]; // The command, e.g., --add, --save
    let argument: string | undefined; // Argument for the command, e.g., filename or branch name
    let customMessage: string | undefined; // For --offset --message

    // Check if running in a Git repository root for relevant commands
    const relevantModesForGitCheck = ['--add', '--remove', '--verify-add', '--verify-remove', '--save', '--list', '--upgrade', '--offset', '--data'];
    if (relevantModesForGitCheck.includes(mode)) {
        const gitDirPath = path.join(CWD, '.git');
        try {
            const gitDirStats = await fs.stat(gitDirPath);
            if (!gitDirStats.isDirectory()) {
                printUsageAndExit(`CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. This script must be run from the root of a Git repository.`);
            }
            // Suppress "Verified execution..." for --data to keep stdout clean for scripting
            if (mode !== '--data') {
                console.log(`INFO: Verified execution within a Git repository root ('${CWD}').`);
            }
        } catch (error: any) {
            if (error.code === 'ENOENT') { // .git directory not found
                printUsageAndExit(`CRITICAL ERROR: No '.git' directory found in '${CWD}'. This script must be run from the root of a Git repository.`);
            } else { // Other errors (permissions, etc.)
                printUsageAndExit(`CRITICAL ERROR: Could not verify '.git' directory presence in '${CWD}'. Details: ${error.message}`);
            }
        }
    }

    try {
        // Dispatch based on the mode
        if (mode === '--save') {
            if (rawArgs.length !== 2) {
                printUsageAndExit("CRITICAL ERROR: --save option requires exactly one <branch_name> argument.");
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) { // Basic validation for branch name
                printUsageAndExit(`CRITICAL ERROR: Invalid branch name '${argument}' after --save. It cannot start with '--'.`);
            }
            await handleSaveOperation(argument, CWD);
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
        else if (mode === '--offset') {
            if (rawArgs.length < 2) { // Requires at least <taylored_file_name>
                printUsageAndExit("CRITICAL ERROR: --offset option requires at least one <taylored_file_name> argument.");
            }
            argument = rawArgs[1]; // This is userInputFileName for handleOffsetCommand
            if (argument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid taylored file name '${argument}' after --offset. It cannot start with '--'.`);
            }
            // Ensure filename doesn't contain path separators
            if (argument.includes(path.sep) || argument.includes('/') || argument.includes('\\')) {
                printUsageAndExit(`CRITICAL ERROR: <taylored_file_name> ('${argument}') must be a simple filename without path separators. It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`);
            }

            // Check for optional --message argument
            if (rawArgs.length > 2) { // If there are more args after <file_name>
                if (rawArgs[2] === '--message') {
                    if (rawArgs.length > 3 && rawArgs[3] && !rawArgs[3].startsWith('--')) {
                        customMessage = rawArgs[3]; // The message string
                    } else {
                        printUsageAndExit("CRITICAL ERROR: --message option for --offset requires a message string argument.");
                    }
                } else {
                     printUsageAndExit(`CRITICAL ERROR: Unknown argument or incorrect usage after --offset <file_name>. Expected optional --message "text", got '${rawArgs[2]}'.`);
                }
            }
             if (rawArgs.length > 4) { // Max args: --offset file --message "text"
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
        else { // Apply modes (--add, --remove, --verify-add, --verify-remove)
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

                // Automatically append .taylored if not provided
                let resolvedTayloredFileName = userInputFileName;
                if (!userInputFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
                    resolvedTayloredFileName = userInputFileName + TAYLORED_FILE_EXTENSION;
                    // Log this for apply modes, but not for --data (which is handled separately)
                    if (mode !== '--data') {
                         console.log(`INFO: Using actual file '${resolvedTayloredFileName}' based on provided name '${userInputFileName}'.`);
                    }
                }

                let isVerify = false;
                let isReverse = false;
                switch (mode) {
                    case '--add': break; // Defaults are correct
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
        // Errors thrown by handlers will be caught here.
        // Specific error messages should have been printed by the handlers or printUsageAndExit.
        // This ensures the process exits with an error code.
        // console.error("\nOperation terminated due to an error."); // This can be redundant
        process.exit(1);
    }
}

main();

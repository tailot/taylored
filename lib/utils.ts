import { execSync } from 'child_process';
import * as parseDiffModule from 'parse-diff';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './constants';

/**
 * Resolves the taylored file name by appending the default extension if not present.
 * @param userInputFileName The file name input by the user.
 * @returns The resolved file name with the extension.
 */
export function resolveTayloredFileName(userInputFileName: string): string {
    if (userInputFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
        return userInputFileName;
    }
    return userInputFileName + TAYLORED_FILE_EXTENSION;
}

export function printUsageAndExit(message?: string, printFullUsage: boolean = false): void {
    if (message) {
        console.error(message);
    }
    if (printFullUsage || message) { // Always print usage if there's a message
        console.log(`
Usage: taylored <option> [arguments]`);
        console.log(`
Core Patching Commands (require to be run in a Git repository root):`);
        console.log(`  --add <taylored_file_name>          Applies the patch.`);
        console.log(`  --remove <taylored_file_name>       Reverses the patch.`);
        console.log(`  --verify-add <taylored_file_name>   Verifies if the patch can be applied.`);
        console.log(`  --verify-remove <taylored_file_name> Verifies if the patch can be reversed.`);
        console.log(`  --save <branch_name>                Creates a patch from changes in <branch_name>.`);
        console.log(`  --list                              Lists all applied patches.`);
        console.log(`  --offset <taylored_file_name> [BRANCH_NAME] Adjusts patch offsets based on current branch or specified BRANCH_NAME.`);
        console.log(`  --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`);
        console.log(`                                      Automatically computes and applies line offsets for patches based on Git history.`);

        console.log(`
Taysell Monetization Commands:`);
        console.log(`  setup-backend                       Sets up the Taysell 'Backend-in-a-Box'.`);
        console.log(`  create-taysell <file.taylored> [--price <price>] [--desc "description"]`);
        console.log(`                                      Creates a .taysell package for selling a patch.`);
        console.log(`  --buy <file.taysell> [--dry-run]    Initiates the purchase and application of a patch.`);
        // Add more details for each command as needed
    }
    if (!message) {
        process.exit(0);
    }
    process.exit(1);
}

/**
 * Analyzes diff content string to determine additions, deletions, and purity.
 * @param diffOutput The string output from a diff command.
 * @returns An object containing additions, deletions, purity, success status, and an optional error message.
 */
export function analyzeDiffContent(diffOutput: string | undefined): { additions: number; deletions: number; isPure: boolean; success: boolean; errorMessage?: string } {
    let additions = 0;
    let deletions = 0;
    let isPure = false;
    let success = true;
    let errorMessage: string | undefined;

    if (typeof diffOutput === 'string') {
        if (diffOutput.trim() === "") { // Handle empty diff string as no changes
            isPure = true; // No changes is pure
            // additions and deletions remain 0
        } else {
            try {
                const parsedDiffFiles: parseDiffModule.File[] = parseDiffModule.default(diffOutput);
                for (const file of parsedDiffFiles) {
                    additions += file.additions;
                    deletions += file.deletions;
                }
                isPure = (additions > 0 && deletions === 0) || (deletions > 0 && additions === 0) || (additions === 0 && deletions === 0);
            } catch (parseError: any) {
                errorMessage = `Failed to parse diff output. Error: ${parseError.message}`;
                success = false;
            }
        }
    } else { // Should ideally not be called with undefined, but handle defensively
        errorMessage = `Diff output was unexpectedly undefined.`;
        success = false;
    }
    return { additions, deletions, isPure, success, errorMessage };
}

/**
 * Analyzes git diff output to determine if it's "pure" (all additions or all deletions).
 * @param branchName The branch to diff against HEAD.
 * @param CWD The current working directory (Git repository root).
 * @returns An object containing diff output, counts, purity, and success status.
 */
export function getAndAnalyzeDiff(branchName: string, CWD: string): { diffOutput?: string; additions: number; deletions: number; isPure: boolean; errorMessage?: string; success: boolean } {
    const command = `git diff HEAD "${branchName.replace(/"/g, '\\"')}"`; // Basic quoting for branch name
    let diffOutput: string | undefined;
    let errorMessage: string | undefined;
    let commandSuccess = false;
    let additions = 0;
    let deletions = 0;
    let isPure = false;

    try {
        diffOutput = execSync(command, { encoding: 'utf8', cwd: CWD });
        commandSuccess = true; // Command succeeded, implies diffOutput is valid (even if empty)
    } catch (error: any) {
        if (error.status === 1 && typeof error.stdout === 'string') {
            // git diff found differences and exited with 1. This is not an error for getAndAnalyzeDiff's purpose.
            diffOutput = error.stdout;
            commandSuccess = true;
        } else {
            // Actual error from execSync or git diff
            errorMessage = `CRITICAL ERROR: 'git diff' command failed for branch '${branchName}'.`;
            if (error.status) { errorMessage += ` Exit status: ${error.status}.`; }
            if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
                errorMessage += ` Git stderr: ${error.stderr.trim()}.`;
            } else if (error.message) {
                errorMessage += ` Error message: ${error.message}.`;
            }
            errorMessage += ` Attempted command: ${command}.`;
            commandSuccess = false;
            // diffOutput remains undefined
        }
    }

    if (commandSuccess) { // diffOutput could be an empty string (no diff) or the diff content
        const analysis = analyzeDiffContent(diffOutput); // diffOutput is defined if commandSuccess is true
        if (analysis.success) {
            additions = analysis.additions;
            deletions = analysis.deletions;
            isPure = analysis.isPure;
        } else {
            errorMessage = (errorMessage ? errorMessage + "\n" : "") + `CRITICAL ERROR: Post-diff analysis failed. ${analysis.errorMessage}`;
            commandSuccess = false; // Mark overall success as false if parsing/analysis fails
        }
    }
    // If !commandSuccess initially, diffOutput is undefined. additions, deletions, isPure remain 0, false.

    return { diffOutput, additions, deletions, isPure, errorMessage, success: commandSuccess };
}

export function extractMessageFromPatch(patchContent: string | null | undefined): string | null {
    if (!patchContent || typeof patchContent !== 'string') {
        return null;
    }
    const lines = patchContent.split('\n');
    // Attempt to find Subject line
    for (const line of lines) {
        if (line.startsWith('Subject:')) {
            let message = line.substring('Subject:'.length).trim();
            // Remove common prefixes like [PATCH], [PATCH 0/N], [PATCH N/M]
            message = message.replace(/^\[PATCH(?:\s+\d+\/\d+)?\]\s*/, '');
            if (message) {
                return message;
            }
        }
    }

    // Fallback: Look for non-header, non-diff lines near the beginning
    let inHeader = true;
    const potentialMessageLines: string[] = [];
    for (const line of lines) {
        if (line.startsWith('---') || line.startsWith('diff --git')) {
            inHeader = false;
            break; // Stop after first diff line
        }
        if (inHeader && (line.startsWith('From:') || line.startsWith('Date:') || line.startsWith('Signed-off-by:'))) {
            continue; // Skip common header lines
        }
        // Heuristic: message lines don't usually start with space, and are not empty.
        // Also, avoid lines that look like git commands or file paths if they were not caught by Subject
        if (inHeader && line.trim() !== '' && !line.startsWith(' ') && !line.startsWith('git') && !line.includes('/')) {
             potentialMessageLines.push(line.trim());
        }
    }

    if (potentialMessageLines.length > 0) {
        // Return the first few non-empty lines, joined.
        return potentialMessageLines.slice(0, 3).join('\n');
    }

    return null;
}

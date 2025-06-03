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

export function printUsageAndExit(errorMessage?: string, detailed: boolean = false): void {
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
    console.error(`  taylored --automatic <EXTENSIONS> <branch_name>`);
    console.error(`  taylored --offset <taylored_file_name> [--message "Custom commit message"]`);
    console.error(`  taylored --data <taylored_file_name>`);

    if (detailed || errorMessage) {
        console.error("\nArguments:");
        console.error(`  <taylored_file_name>      : Name of the taylored file (e.g., 'my_patch' or 'my_patch${TAYLORED_FILE_EXTENSION}').`);
        console.error(`                            If the '${TAYLORED_FILE_EXTENSION}' extension is omitted, it will be automatically appended.`);
        console.error(`                            Assumed to be in the '${TAYLORED_DIR_NAME}/' directory. Used by apply/remove/verify/offset/data modes.`);
        console.error(`  <branch_name>             : Branch name. Used by --save (target for diff) and --automatic (target for comparison).`);
        console.error(`                            Output for --save: ${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}`);
        console.error(`  <EXTENSIONS>              : File extension(s) to scan (e.g., 'ts' or 'ts,js,py'). Used by --automatic.`);
        console.error("\nOptions:");
        console.error(`  --add                     : Apply changes from '${TAYLORED_DIR_NAME}/<file_name>' to current directory.`);
        console.error(`  --remove                  : Revert changes from '${TAYLORED_DIR_NAME}/<file_name>' in current directory.`);
        console.error(`  --verify-add              : Dry-run apply from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --verify-remove           : Dry-run revert from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --save                    : Generate diff file into '${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}'.`);
        console.error(`                            (File saved only if diff is all additions or all deletions of lines).`);
        console.error(`  --list                    : List all ${TAYLORED_FILE_EXTENSION} files in the '${TAYLORED_DIR_NAME}/' directory.`);
        console.error(`  --automatic <EXTENSIONS> <branch_name> : Automatically search for taylored blocks in files with specified <EXTENSIONS> (e.g., .js, .ts, .py) using <branch_name> as the target for comparison, and create taylored files from them. Markers: <taylored NUMERO> and </taylored> (where NUMERO is an integer).`);
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
export function getAndAnalyzeDiff(branchName: string, CWD: string): { diffOutput?: string; additions: number; deletions: number; isPure: boolean; errorMessage?: string; success: boolean } {
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
        // If execSync throws, the command is considered to have failed.
        errorMessage = `CRITICAL ERROR: 'git diff' command failed for branch '${branchName}'.`;
        if (error.status) { // status is the exit code
            errorMessage += ` Exit status: ${error.status}.`;
        }
        // stderr usually contains the actual error message from git
        if (error.stderr && typeof error.stderr === 'string' && error.stderr.trim() !== '') {
            errorMessage += ` Git stderr: ${error.stderr.trim()}.`;
        } else if (error.message) { // Fallback if stderr is not informative
            errorMessage += ` Error message: ${error.message}.`;
        }
        errorMessage += ` Attempted command: ${command}.`;
        success = false;
        // diffOutput remains undefined because the command failed
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

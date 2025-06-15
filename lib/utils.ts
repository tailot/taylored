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
    console.error(`  taylored --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`);
    console.error(`  taylored --offset <taylored_file_name> [BRANCH_NAME]`);

    if (detailed || errorMessage) {
        console.error("\nArguments:");
        console.error(`  <taylored_file_name>      : Name of the taylored file (e.g., 'my_patch' or 'my_patch${TAYLORED_FILE_EXTENSION}').`);
        console.error(`                            If the '${TAYLORED_FILE_EXTENSION}' extension is omitted, it will be automatically appended.`);
        console.error(`                            Assumed to be in the '${TAYLORED_DIR_NAME}/' directory. Used by apply/remove/verify/offset/data modes.`);
        console.error(`  <branch_name>             : Branch name. Used by --save (target for diff) and --automatic (target for comparison).`);
        console.error(`                            Output for --save: ${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}`);
        console.error(`  <EXTENSIONS>              : File extension(s) to scan (e.g., 'ts' or 'ts,js,py'). Used by --automatic.`);
        console.error(`  [BRANCH_NAME]             : Optional. Branch name to use as a base for --offset. Defaults to 'main'.`);
        console.error(`  <DIR_LIST>                : Optional. Comma-separated list of directory names to exclude (e.g., 'dist,build,test'). Used by --automatic with --exclude.`);
        console.error("\nOptions:");
        console.error(`  --add                     : Apply changes from '${TAYLORED_DIR_NAME}/<file_name>' to current directory.`);
        console.error(`  --remove                  : Revert changes from '${TAYLORED_DIR_NAME}/<file_name>' in current directory.`);
        console.error(`  --verify-add              : Dry-run apply from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --verify-remove           : Dry-run revert from '${TAYLORED_DIR_NAME}/<file_name>'.`);
        console.error(`  --save                    : Generate diff file into '${TAYLORED_DIR_NAME}/<branch_name_sanitized>${TAYLORED_FILE_EXTENSION}'.`);
        console.error(`                            (File saved only if diff is all additions or all deletions of lines).`);
        console.error(`  --list                    : List all ${TAYLORED_FILE_EXTENSION} files in the '${TAYLORED_DIR_NAME}/' directory.`);
        console.error(`  --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>] :`);
        console.error(`                            Automatically search for taylored blocks in files with specified <EXTENSIONS>`);
        console.error(`                            (e.g., .js, .ts, .py) using <branch_name> as the target for comparison,`);
        console.error(`                            and create taylored files from them. Markers: <taylored number="NUMERO"> and </taylored>`);
        console.error(`                            (where NUMERO is an integer).`);
        console.error(`                            The <taylored number="NUMERO"> tag can optionally include a 'compute="CHARS_TO_STRIP_PATTERNS"' attribute.`);
        console.error(`                            If 'compute' is present, the content within the taylored block is executed as a Node.js script.`);
        console.error(`                            'CHARS_TO_STRIP_PATTERNS' is an optional comma-separated string of patterns. Before execution, Taylored removes all occurrences of each specified pattern from the script content.`);
        console.error(`                            The script's standard output then replaces the entire taylored block (from \\\`<taylored ...>\\\` to \\\`</taylored>\\\`) in the generated patch.`);
        console.error(`                            This means the dynamic content or calculation result is saved as a standard diff, which can then be applied or reverted using Taylored's \\\`--add\\\` or \\\`--remove\\\` commands.`);
        console.error(`                            Example: <taylored number="1" compute="/*,*/">/*
#!/usr/bin/env node
console.log("Computed value: " + (Math.random() * 100).toFixed(0)); //NOSONAR
*\/</taylored>\`);`);
        console.error(`                            (The \\\`#!/usr/bin/env node\\\` shebang makes the script directly executable in environments where Node.js is in the system's PATH.)`);
        console.error(`                            If --exclude is provided, specified directories (and their subdirectories) will be ignored.`);
        console.error(`  --offset                  : Update offsets for a given patch file in '${TAYLORED_DIR_NAME}/'. Optionally specify a branch to diff against.`);
        console.error("\nNote:");
        console.error(`  All commands must be run from the root of a Git repository.`);
        console.error("\nExamples:");
        console.error(`  taylored --add my_changes`);
        console.error(`  taylored --save feature/new-design`);
    console.error(`  taylored --offset my_feature_patch develop`);
    }
    if (!errorMessage) {
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

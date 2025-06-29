import { execSync } from 'child_process';
import * as parseDiffModule from 'parse-diff';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './constants';
import { GitOperationError, PatchPurityError } from './errors';

/**
 * Ensures a Taylored filename ends with the standard .taylored extension.
 *
 * If the provided filename already has the correct extension, it's returned as is.
 * Otherwise, the .taylored extension is appended. This helps standardize
 * Taylored file naming and retrieval.
 *
 * @param userInputFileName The filename input by the user, potentially without an extension.
 * @returns The fully resolved Taylored filename including the .taylored extension.
 * @example
 * resolveTayloredFileName("my_patch") // returns "my_patch.taylored"
 * resolveTayloredFileName("feature.taylored") // returns "feature.taylored"
 */
export function resolveTayloredFileName(userInputFileName: string): string {
    if (userInputFileName.endsWith(TAYLORED_FILE_EXTENSION)) {
        return userInputFileName;
    }
    return userInputFileName + TAYLORED_FILE_EXTENSION;
}

/**
 * Prints usage information or an error message to the console and exits the process.
 *
 * This function is typically called when the CLI is used incorrectly (e.g., wrong arguments)
 * or when a user requests help (though full help might be triggered by `printFullUsage`).
 * It displays a general error message if provided, followed by the command usage summary.
 * The process exits with code 1 if an error message is provided, and code 0 otherwise (graceful exit).
 *
 * The usage information includes core patching commands and Taysell monetization commands,
 * giving users a quick reference.
 *
 * @param message An optional error message to display before the usage information.
 *                If provided, the process will exit with a status code of 1.
 * @param printFullUsage If true, or if a message is provided, the full usage text is printed.
 *                       Defaults to false.
 * @returns {string} The formatted usage message.
 */
export function formatUsageMessage(errorMessage?: string, printFullUsage: boolean = false): string {
    let usageText = "";
    if (errorMessage) {
        usageText += errorMessage + "\n\n";
    }

    if (printFullUsage || errorMessage) { // Always include usage details if there's an error message or full usage is requested
        usageText += `Usage: taylored <option> [arguments]\n`;
        usageText += `\nCore Patching Commands (require to be run in a Git repository root):\n`;
        usageText += `  --add <taylored_file_name>          Applies the patch.\n`;
        usageText += `  --remove <taylored_file_name>       Reverses the patch.\n`;
        usageText += `  --verify-add <taylored_file_name>   Verifies if the patch can be applied.\n`;
        usageText += `  --verify-remove <taylored_file_name> Verifies if the patch can be reversed.\n`;
        usageText += `  --save <branch_name>                Creates a patch from changes in <branch_name>.\n`;
        usageText += `  --list                              Lists all applied patches.\n`;
        usageText += `  --offset <taylored_file_name> [BRANCH_NAME] Adjusts patch offsets based on current branch or specified BRANCH_NAME.\n`;
        usageText += `  --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]\n`;
        usageText += `                                      Automatically computes and applies line offsets for patches based on Git history.\n`;
        usageText += `  --upgrade <patch_file> [target_file_path]\n`;
        usageText += `                                      Analyzes patch frames against the target file (or inferred file).\n`;
        usageText += `                                      If frames are intact, updates the patch content from the target file.\n`;

        // <taylored number="9003">
        usageText += `\nTaysell Monetization Commands:\n`;
        usageText += `  setup-backend                       Sets up the Taysell 'Backend-in-a-Box'.\n`;
        usageText += `  create-taysell <file.taylored> [--price <price>] [--desc "description"]\n`;
        usageText += `                                      Creates a .taysell package for selling a patch.\n`;
        usageText += `  --buy <file.taysell> [--dry-run]    Initiates the purchase and application of a patch.\n`;
        // </taylored>
    }
    return usageText.trim();
}


/**
 * Parses git diff output to count additions and deletions and determine if the diff is "pure".
 *
 * A diff is considered "pure" if it contains only additions, only deletions, or no changes at all.
 * Mixed additions and deletions are not pure. This function uses the `parse-diff` library
 * to interpret the diff string.
 *
 * @param diffOutput The string output from a `git diff` command. Can be an empty string for no changes.
 *                   Undefined input will result in a failure status.
 * @returns An object detailing:
 *          - `additions`: The total number of lines added.
 *          - `deletions`: The total number of lines deleted.
 *          - `isPure`: Boolean indicating if the diff is purely additive, purely deletive, or empty.
 *          - `success`: Boolean indicating if the parsing and analysis were successful.
 *          - `errorMessage`: An optional message if parsing failed or input was invalid.
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
 * Executes a `git diff HEAD <branchName>` command and analyzes its output for purity.
 *
 * This function captures the diff between the current HEAD and a specified branch.
 * It then uses `analyzeDiffContent` to count additions/deletions and determine
 * if the diff is pure (all additions or all deletions).
 * Handles cases where `git diff` itself might exit with a non-zero status (e.g., status 1
 * when differences are found, which is normal for diffing).
 *
 * @param branchName The name of the branch to compare against the current HEAD.
 *                   The branch name is sanitized for use in the shell command.
 * @param CWD The current working directory, expected to be the root of a Git repository.
 * @returns An object containing:
 *          - `diffOutput`: The raw string output from the `git diff` command. Undefined if the command failed critically.
 *          - `additions`: Total lines added.
 *          - `deletions`: Total lines deleted.
 *          - `isPure`: Boolean indicating if the diff is pure.
 *          - `errorMessage`: An optional error message if the command or analysis failed.
 *          - `success`: Boolean indicating overall success of both fetching and analyzing the diff.
 */
export function getAndAnalyzeDiff(branchName: string, CWD: string): { diffOutput: string; additions: number; deletions: number; isPure: boolean } {
    const command = `git diff HEAD "${branchName.replace(/"/g, '\\"')}"`;
    let diffOutput: string;

    try {
        diffOutput = execSync(command, { encoding: 'utf8', cwd: CWD });
    } catch (error: any) {
        if (error.status === 1 && typeof error.stdout === 'string') {
            // git diff found differences and exited with 1. This is normal.
            diffOutput = error.stdout;
        } else {
            // Actual error from execSync or git diff
            let errMsg = `'git diff' command failed for branch '${branchName}'.`;
            if (error.status) { errMsg += ` Exit status: ${error.status}.`; }
            // error.stderr might be a Buffer, ensure it's stringified
            const stderrString = error.stderr ? error.stderr.toString().trim() : '';
            if (stderrString) {
                errMsg += ` Git stderr: ${stderrString}.`;
            } else if (error.message) {
                errMsg += ` Error message: ${error.message}.`;
            }
            throw new GitOperationError(errMsg, command, stderrString);
        }
    }

    const analysis = analyzeDiffContent(diffOutput);
    if (!analysis.success) {
        // This case should ideally not happen if diffOutput is always a string.
        // If analyzeDiffContent itself fails (e.g. due to unexpected undefined input, though guarded),
        // it's an internal error.
        throw new Error(`Post-diff analysis failed unexpectedly. ${analysis.errorMessage || ''}`);
    }

    if (!analysis.isPure) {
        throw new PatchPurityError(
            `The diff between "${branchName}" and HEAD contains a mix of content line additions and deletions.`,
            { additions: analysis.additions, deletions: analysis.deletions }
        );
    }

    return { diffOutput, additions: analysis.additions, deletions: analysis.deletions, isPure: analysis.isPure };
}

/**
 * Attempts to extract a commit-like message from the header of a patch file content.
 *
 * It primarily looks for a "Subject:" line, similar to `git format-patch` output,
 * and cleans common prefixes like "[PATCH]".
 * If no "Subject:" line is found, it uses a heuristic to find potential message lines
 * from the beginning of the patch, avoiding common Git header lines and diff content.
 *
 * This is useful for automatically deriving a description or name for a patch
 * based on its content.
 *
 * @param patchContent The full string content of a .taylored patch file.
 * @returns The extracted message string, or null if no suitable message could be found
 *          or if the input is null/undefined.
 */
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

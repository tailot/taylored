import { execSync } from 'child_process';
import * as parseDiffModule from 'parse-diff';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as inquirer from 'inquirer'; // Added for promptOrUseDefaults
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
    const exitCode = message ? 1 : 0; // Exit with 1 if there's an error message, 0 otherwise.

    if (message) {
        console.error(message);
    }

    // Print full usage if requested, or if there's an error message (unless it's a non-critical info message that doesn't need full usage).
    // For now, any message triggers full usage details alongside the message.
    // Calls like `taylored` (no args) or `taylored --help` should result in printFullUsage = true.
    if (printFullUsage || message) {
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
        console.log(
            `  --offset <taylored_file_name> [BRANCH_NAME] Adjusts patch offsets based on current branch or specified BRANCH_NAME.`
        );
        console.log(`  --automatic <EXTENSIONS> <branch_name> [--exclude <DIR_LIST>]`);
        console.log(
            `                                      Automatically computes and applies line offsets for patches based on Git history.`
        );

        console.log(`
Taysell Monetization Commands:`);
        console.log(`  setup-backend                       Sets up the Taysell 'Backend-in-a-Box'.`);
        console.log(`  create-taysell <file.taylored> [--price <price>] [--desc "description"]`);
        console.log(`                                      Creates a .taysell package for selling a patch.`);
        console.log(`  --buy <file.taysell> [--dry-run]    Initiates the purchase and application of a patch.`);
        // Add more details for each command as needed
    }

    process.exit(exitCode);
}

/**
 * Analyzes diff content string to determine additions, deletions, and purity.
 * @param diffOutput The string output from a diff command.
 * @returns An object containing additions, deletions, purity, success status, and an optional error message.
 */
export function analyzeDiffContent(diffOutput: string | undefined): {
    additions: number;
    deletions: number;
    isPure: boolean;
    success: boolean;
    errorMessage?: string;
} {
    let additions = 0;
    let deletions = 0;
    let isPure = false;
    let success = true;
    let errorMessage: string | undefined;

    if (typeof diffOutput === 'string') {
        if (diffOutput.trim() === '') {
            // Handle empty diff string as no changes
            isPure = true; // No changes is pure
            // additions and deletions remain 0
        } else {
            try {
                const parsedDiffFiles: parseDiffModule.File[] = parseDiffModule.default(diffOutput);
                for (const file of parsedDiffFiles) {
                    additions += file.additions;
                    deletions += file.deletions;
                }
                isPure =
                    (additions > 0 && deletions === 0) ||
                    (deletions > 0 && additions === 0) ||
                    (additions === 0 && deletions === 0);
            } catch (parseError: any) {
                errorMessage = `Failed to parse diff output. Error: ${parseError.message}`;
                success = false;
            }
        }
    } else {
        // Should ideally not be called with undefined, but handle defensively
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
export function getAndAnalyzeDiff(
    branchName: string,
    CWD: string
): {
    diffOutput?: string;
    additions: number;
    deletions: number;
    isPure: boolean;
    errorMessage?: string;
    success: boolean;
} {
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
            if (error.status) {
                errorMessage += ` Exit status: ${error.status}.`;
            }
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

    if (commandSuccess) {
        // diffOutput could be an empty string (no diff) or the diff content
        const analysis = analyzeDiffContent(diffOutput); // diffOutput is defined if commandSuccess is true
        if (analysis.success) {
            additions = analysis.additions;
            deletions = analysis.deletions;
            isPure = analysis.isPure;
        } else {
            errorMessage =
                (errorMessage ? errorMessage + '\n' : '') +
                `CRITICAL ERROR: Post-diff analysis failed. ${analysis.errorMessage}`;
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

// CLI Argument Validation Utility Functions

/**
 * Checks if the current working directory is the root of a Git repository.
 * If not, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {string} CWD - The current working directory.
 * @param {string} commandName - The name of the command being executed, used in error messages.
 * @returns {Promise<void>}
 */
export async function ensureGitRepository(CWD: string, commandName: string): Promise<void> {
    const gitDirPath = path.join(CWD, '.git');
    try {
        const gitDirStats = await fs.stat(gitDirPath);
        if (!gitDirStats.isDirectory()) {
            printUsageAndExit(
                `CRITICAL ERROR: A '.git' entity exists at '${gitDirPath}', but it is not a directory. The command '${commandName}' must be run from the root of a Git repository.`
            );
        }
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            printUsageAndExit(
                `CRITICAL ERROR: No '.git' directory found in '${CWD}'. The command '${commandName}' must be run from the root of a Git repository.`
            );
        } else {
            printUsageAndExit(
                `CRITICAL ERROR: Could not verify '.git' directory presence for '${commandName}' in '${CWD}'. Details: ${error.message}`
            );
        }
    }
}

/**
 * Validates that the actual number of arguments matches an expected count.
 * If not, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {number} actualLength - The actual number of arguments received (typically `args.length`).
 * @param {number} expectedCount - The exact number of arguments expected.
 * @param {string} commandName - The name of the command for error messages.
 * @param {string} usageHint - A specific hint about the command's usage, appended to the error message.
 */
export function validateExactArgCount(
    actualLength: number,
    expectedCount: number,
    commandName: string,
    usageHint: string
): void {
    if (actualLength !== expectedCount) {
        printUsageAndExit(
            `CRITICAL ERROR: ${commandName} option requires exactly ${expectedCount} argument(s). ${usageHint}`
        );
    }
}

/**
 * Validates that the actual number of arguments is at least a minimum expected count.
 * If not, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {number} actualLength - The actual number of arguments received (typically `args.length`).
 * @param {number} minCount - The minimum number of arguments expected.
 * @param {string} commandName - The name of the command for error messages.
 * @param {string} usageHint - A specific hint about the command's usage, appended to the error message.
 */
export function validateMinArgCount(
    actualLength: number,
    minCount: number,
    commandName: string,
    usageHint: string
): void {
    if (actualLength < minCount) {
        printUsageAndExit(
            `CRITICAL ERROR: ${commandName} option requires at least ${minCount} argument(s). ${usageHint}`
        );
    }
}

/**
 * Ensures a given argument value is a string and does not start with '--' (which would indicate it's a flag, not a value).
 * If validation fails, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {string | undefined} argValue - The value of the argument to check.
 * @param {string} argName - A descriptive name for the argument (e.g., "<branch_name>", "<taylored_file_name>"), used in error messages.
 * @param {string} commandName - The name of the command for error messages.
 */
export function ensureArgumentNotFlag(argValue: string | undefined, argName: string, commandName: string): void {
    if (typeof argValue !== 'string') {
        printUsageAndExit(
            `CRITICAL ERROR: Expected a value for ${argName} with ${commandName}, but received undefined.`
        );
    }
    if (argValue.startsWith('--')) {
        printUsageAndExit(
            `CRITICAL ERROR: Invalid ${argName} '${argValue}' for ${commandName}. It cannot start with '--'.`
        );
    }
}

/**
 * Validates the format of a Taylored filename.
 * It ensures the filename does not start with '--' and does not contain path separators.
 * If validation fails, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {string} fileName - The Taylored filename to validate.
 * @param {string} commandName - The name of the command for error messages.
 */
export function validateTayloredFileNameFormat(fileName: string, commandName: string): void {
    ensureArgumentNotFlag(fileName, '<taylored_file_name>', commandName);
    if (fileName.includes(path.sep) || fileName.includes('/') || fileName.includes('\\')) {
        printUsageAndExit(
            `CRITICAL ERROR: <taylored_file_name> ('${fileName}') for ${commandName} must be a simple filename without path separators. It is assumed to be in the '${TAYLORED_DIR_NAME}/' directory.`
        );
    }
}

/**
 * Validates a generic string argument, ensuring it's provided, not empty, and not a flag.
 * If validation fails, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {string | undefined} argValue - The argument value to check.
 * @param {string} argName - A user-friendly name for the argument (e.g., "EXTENSIONS", "branch name"), used in error messages.
 * @param {string} commandName - The name of the command for error messages.
 */
export function validateStringArgument(argValue: string | undefined, argName: string, commandName: string): void {
    if (typeof argValue !== 'string' || argValue.trim() === '') {
        printUsageAndExit(`CRITICAL ERROR: Missing or empty ${argName} for ${commandName}.`);
    }
    ensureArgumentNotFlag(argValue, argName, commandName);
}

/**
 * Checks for and disallows any unexpected arguments beyond a specified index.
 * If unexpected arguments are found, it prints an error message via `printUsageAndExit` and exits the process.
 * @param {string[]} rawArgs - The array of raw command-line arguments (from process.argv.slice(2), excluding the command itself).
 * @param {number} startIndex - The index in `rawArgs` from which arguments are considered unexpected.
 * @param {string} commandName - The name of the command for error messages.
 * @param {string} [contextMessage=''] - An optional message describing the expected arguments up to `startIndex`.
 */
export function checkForUnexpectedArgs(
    rawArgs: string[],
    startIndex: number,
    commandName: string,
    contextMessage: string = ''
): void {
    if (rawArgs.length > startIndex) {
        printUsageAndExit(
            `CRITICAL ERROR: Unknown or unexpected argument '${rawArgs[startIndex]}' for ${commandName}. ${contextMessage}`
        );
    }
}

// Inquirer test mode helper

/**
 * Wraps `inquirer.prompt` to facilitate testing.
 * If the `JEST_WORKER_ID` environment variable is set (indicating a Jest test environment),
 * this function bypasses `inquirer.prompt` and immediately resolves with `defaultAnswers`.
 * Otherwise, it calls `inquirer.prompt(questions)`.
 *
 * @template T The type of answers expected, extending `inquirer.Answers`.
 * @param {inquirer.QuestionCollection<T>} questions The questions object for `inquirer.prompt`.
 * @param {T} defaultAnswers The default answers to return when in a test environment.
 * @returns {Promise<T>} A promise that resolves with the user's answers or the default answers.
 */
export async function promptOrUseDefaults<T extends inquirer.Answers>(
    questions: inquirer.QuestionCollection<T>,
    defaultAnswers: T
): Promise<T> {
    if (process.env.JEST_WORKER_ID) {
        console.log('Running in test environment, using default answers for prompts.');
        return Promise.resolve(defaultAnswers);
    }
    return inquirer.prompt(questions);
}

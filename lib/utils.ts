import * as fs from 'fs-extra';
import * as path from 'path';
import parseDiff from 'parse-diff';
import { execSync } from 'child_process'; // For getAndAnalyzeDiff
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './constants'; // TAYLORED_FILE_EXTENSION will be added to constants.ts


export function resolveTayloredFileName(userInput: string): string {
    if (userInput.endsWith('.taylored')) {
        return userInput;
    }
    return `${userInput}.taylored`;
}

export function getTayloredFilePaths(CWD: string): string[] {
    const tayloredDirPath = path.join(CWD, TAYLORED_DIR_NAME);
    if (!fs.existsSync(tayloredDirPath)) {
        return [];
    }
    const allFiles = fs.readdirSync(tayloredDirPath);
    return allFiles.filter(file => file.endsWith('.taylored'));
}

export function analyzeDiffContent(diffContent: string): { additions: number; deletions: number; isPure: boolean } {
    const files = parseDiff(diffContent);
    if (files.length === 0) {
        return { additions: 0, deletions: 0, isPure: true };
    }

    const additions = files.reduce((acc: number, file: parseDiff.File) => acc + file.additions, 0);
    const deletions = files.reduce((acc: number, file: parseDiff.File) => acc + file.deletions, 0);

    return {
        additions,
        deletions,
        isPure: (additions > 0 && deletions === 0) || (deletions > 0 && additions === 0),
    };
}

/**
 * Executes a git diff command between HEAD and a specified branch,
 * then analyzes the diff content for purity (only additions or only deletions).
 *
 * @param {string} branchName - The name of the Git branch to compare against HEAD.
 * @param {string} CWD - The current working directory (Git repository root).
 * @returns {{ success: boolean; diffOutput?: string; isPure?: boolean; additions?: number; deletions?: number; errorMessage?: string }}
 *          An object containing the diff result, analysis, and any error messages.
 */
export function getAndAnalyzeDiff(branchName: string, CWD: string): { success: boolean; diffOutput?: string; isPure?: boolean; additions?: number; deletions?: number; errorMessage?: string } {
    let diffOutput: string;
    try {
        // --no-color: Ensures no ANSI escape codes in output.
        // --no-ext-diff: Disables external diff tools.
        // --no-textconv: Disables text conversion filters.
        // --binary: Ensures binary files are handled correctly (though we expect text patches).
        // --unified=0: Shows no context lines, making purity check simpler (though git apply needs context).
        //              However, for a save operation, we want a standard patch.
        //              A standard diff will show context, and parse-diff handles it.
        diffOutput = execSync(`git diff HEAD "${branchName}" --patch --no-color --no-ext-diff --no-textconv`, { cwd: CWD, encoding: 'utf8' });
    } catch (error: any) {
        const errorMessage = `CRITICAL ERROR: Failed to generate diff for branch '${branchName}'. Details: ${error.stderr || error.message}`;
        return { success: false, errorMessage };
    }

    const analysis = analyzeDiffContent(diffOutput);

    if (!analysis.isPure) {
        const errorMessage = `CRITICAL ERROR: The diff between "HEAD" and "${branchName}" contains mixed additions and deletions. This operation requires a pure diff (only additions or only deletions).`;
        return {
            success: false,
            diffOutput,
            isPure: false,
            additions: analysis.additions,
            deletions: analysis.deletions,
            errorMessage
        };
    }

    return {
        success: true,
        diffOutput,
        isPure: true,
        additions: analysis.additions,
        deletions: analysis.deletions,
    };
}


export interface HunkHeaderInfo {
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
}

/**
 * Parses the headers of hunks from a git diff content string.
 * This is useful for structural analysis of a patch.
 * * @param patchContent - The string content of the git patch.
 * @returns An array of objects, each representing a hunk's header information.
 */
export function parsePatchHunks(patchContent: string): HunkHeaderInfo[] {
    const hunkHeaderRegex = /^@@ -(\d+)(,(\d+))? \+(\d+)(,(\d+))? @@/gm;
    const hunks: HunkHeaderInfo[] = [];
    let match;
    while ((match = hunkHeaderRegex.exec(patchContent)) !== null) {
        hunks.push({
            oldStart: parseInt(match[1], 10),
            oldLines: match[3] ? parseInt(match[3], 10) : 1,
            newStart: parseInt(match[4], 10),
            newLines: match[6] ? parseInt(match[6], 10) : 1,
        });
    }
    return hunks;
}

/**
 * Prints a usage message to the console and exits the process.
 * If an error message is provided, it is printed to stderr before the usage message.
 *
 * @param {string} [error] - An optional error message to display before exiting.
 */
export function printUsageAndExit(error?: string): void {
    if (error) {
        console.error(`\n${error}`);
    }
    console.log(`
    Usage: taylored <command> [options]

    Commands:
      --add <taylored_file_name>...   Applies one or more taylored patches.
      --remove <taylored_file_name>... Reverts one or more taylored patches.
      --save <branch_name>            Saves changes from a branch into a .taylored file.
      --list                          Lists all available .taylored files.
      --offset <taylored_file_name>   Updates patch file to match current code shifts.
      --upgrade <taylored_file_name> [base_branch]
                                      Upgrades a pure patch with new content, preserving its structure.
      --automatic [base_branch]       Analyzes the repo and suggests actions.
      --version                       Displays the current version.
      --help                          Displays this help message.

    Examples:
      taylored --add feature-x.taylored
      taylored --save new-feature-branch
      taylored --upgrade old-config.taylored main
    `);
    process.exit(1);
}

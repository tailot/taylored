import * as fs from 'fs/promises';
import * as fsExtra from 'fs-extra';
import * as path from 'path';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { getAndAnalyzeDiff } from '../utils';

/**
 * Handles the --save operation: generates a .taylored file from a branch diff.
 * @param branchName The name of the branch to diff against HEAD.
 * @param CWD The current working directory (Git repository root).
 * @param outputFileNameOverride Optional override for the output file name.
 */
export async function handleSaveOperation(branchName: string, CWD: string, outputFileNameOverride?: string): Promise<void> {
    const outputFileName = outputFileNameOverride
        ? `${outputFileNameOverride}${TAYLORED_FILE_EXTENSION}`
        : `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
    const targetDirectoryPath = path.join(CWD, TAYLORED_DIR_NAME);
    const resolvedOutputFileName = path.join(targetDirectoryPath, outputFileName);

    try {
        await fsExtra.ensureDir(targetDirectoryPath);
    } catch (mkdirError: any) {
        console.error(`CRITICAL ERROR: Failed to create directory '${targetDirectoryPath}'. Details: ${mkdirError.message}`);
        throw mkdirError;
    }

    const diffResult = getAndAnalyzeDiff(branchName, CWD);

    if (diffResult.success && diffResult.isPure) {
        if (typeof diffResult.diffOutput === 'string') {
            try {
                await fs.writeFile(resolvedOutputFileName, diffResult.diffOutput);
            } catch (writeError: any) {
                console.error(`CRITICAL ERROR: Failed to write diff file '${resolvedOutputFileName}'. Details: ${writeError.message}`);
                throw writeError;
            }
        } else {
            console.error(`CRITICAL ERROR: Diff output is unexpectedly undefined for branch '${branchName}' despite successful analysis.`);
            throw new Error(`Undefined diff output for pure diff on branch '${branchName}'.`);
        }
    } else {
        if (!diffResult.success && diffResult.errorMessage) {
            console.error(diffResult.errorMessage);
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
        throw new Error(diffResult.errorMessage || `Failed to save taylored file for branch '${branchName}' due to purity or diff generation issues.`);
    }
}

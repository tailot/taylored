// lib/git-patch-offset-updater.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, ExecOptions as ChildProcessExecOptions } from 'child_process';
import * as util from 'util';
import { handleApplyOperation } from './apply-logic';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from './constants';

const execAsync = util.promisify(exec);

/**
 * Quotes an argument for safe use in a shell command string.
 */
function quoteForShell(arg: string): string {
    if (!/[ \t\n\r"'();&|<>*?#~=%\\]/.test(arg)) {
        return arg;
    }
    const escaped = arg.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
    return `"${escaped}"`;
}

interface ExecGitOptions {
    allowFailure?: boolean;
    ignoreStderr?: boolean;
    execOptions?: ChildProcessExecOptions;
}

interface ExecGitResult {
    stdout: string;
    stderr: string;
    success: boolean;
    error?: Error & { stdout?: string; stderr?: string; code?: number };
}

class GitExecutionError extends Error {
    originalError?: Error & { stdout?: string; stderr?: string; code?: number };
    stdout?: string;
    stderr?: string;
    code?: number;

    constructor(message: string, originalError?: Error & { stdout?: string; stderr?: string; code?: number }) {
        super(message);
        this.name = 'GitExecutionError';
        if (originalError) {
            this.originalError = originalError;
            this.stdout = originalError.stdout?.trim();
            this.stderr = originalError.stderr?.trim();
            this.code = originalError.code;
        }
    }
}

async function execGit(repoRoot: string, args: string[], options: ExecGitOptions = {}): Promise<ExecGitResult> {
    const command = `git ${args.map(quoteForShell).join(' ')}`;
    const execOptions: ChildProcessExecOptions = { cwd: repoRoot, ...options.execOptions };
    try {
        const { stdout, stderr } = await execAsync(command, execOptions);
        if (stderr && !options.ignoreStderr && stderr.trim() !== "") {
            // console.warn(`Git command stderr for "${command}":\n${stderr.trim()}`);
        }
        return { stdout: stdout.trim(), stderr: stderr.trim(), success: true };
    } catch (error: any) {
        if (options.allowFailure) {
            return {
                stdout: error.stdout ? error.stdout.trim() : '',
                stderr: error.stderr ? error.stderr.trim() : '',
                success: false,
                error: error as Error & { stdout?: string; stderr?: string; code?: number }
            };
        }
        const errorMessage = `Error executing git command: ${command}\nRepo: ${repoRoot}\nExit Code: ${error.code}\nStdout: ${error.stdout ? error.stdout.trim() : 'N/A'}\nStderr: ${error.stderr ? error.stderr.trim() : 'N/A'}`;
        throw new GitExecutionError(errorMessage, error);
    }
}

function extractMessageFromPatch(patchContent: string | null | undefined): string | null {
    if (!patchContent || typeof patchContent !== 'string') {
        return null;
    }
    const lines = patchContent.split('\n');
    for (const line of lines) {
        if (line.startsWith('Subject:')) {
            let message = line.substring('Subject:'.length).trim();
            message = message.replace(/^\[PATCH(?:\s+\d+\/\d+)?\]\s*/, '');
            if (message) {
                return message;
            }
        }
    }
    let inHeader = true;
    const potentialMessageLines: string[] = [];
    let foundDiff = false;
    const commonHeaderPatterns: RegExp[] = [
        /^From[:\s]/i, /^Date[:\s]/i, /^Subject[:\s]/i, /^Signed-off-by:/i,
        /^Cc:/i, /^Reported-by:/i, /^Acked-by:/i, /^Reviewed-by:/i,
        /^Fixes:/i, /^Link:/i, /^[a-zA-Z0-9-]+:/
    ];
    for (const line of lines) {
        if (line.startsWith('---')) { inHeader = false; continue; }
        if (line.startsWith('diff --git')) { foundDiff = true; break; }
        if (!inHeader && !foundDiff && line.trim() !== '') {
            const trimmedLine = line.trim();
            let isHeaderLike = false;
            for (const pattern of commonHeaderPatterns) {
                if (pattern.test(trimmedLine)) {
                    isHeaderLike = true;
                    break;
                }
            }
            if (!isHeaderLike) {
                if (potentialMessageLines.length < 10) {
                    potentialMessageLines.push(trimmedLine);
                }
            }
        }
    }
    if (potentialMessageLines.length > 0) {
        for (const pLine of potentialMessageLines) {
            const colonIndex = pLine.indexOf(':');
            if (colonIndex === -1 || colonIndex > 30) {
                 return pLine;
            }
        }
        return potentialMessageLines[0];
    }
    return null;
}

interface HunkHeaderInfo {
    originalHeaderLine: string;
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
}

function parsePatchHunks(patchContent: string | null | undefined): HunkHeaderInfo[] {
    if (!patchContent) {
        return [];
    }
    const hunks: HunkHeaderInfo[] = [];
    const lines = patchContent.split('\n');
    const hunkHeaderRegex = /^@@ -(\d+)(,(\d+))? \+(\d+)(,(\d+))? @@/;

    for (const line of lines) {
        const match = line.match(hunkHeaderRegex);
        if (match) {
            const oldStart = parseInt(match[1], 10);
            const oldLines = match[3] !== undefined ? parseInt(match[3], 10) : 1;
            const newStart = parseInt(match[4], 10);
            const newLines = match[6] !== undefined ? parseInt(match[6], 10) : 1;

            hunks.push({
                originalHeaderLine: line,
                oldStart,
                oldLines,
                newStart,
                newLines,
            });
        }
    }
    return hunks;
}

/**
 * Helper function to embed a message as a Subject line into patch content.
 * @param diffBody The main body of the diff.
 * @param message The message to embed. If null, diffBody is returned as is.
 * @returns Patch content with the message embedded, or original if no message.
 */
function embedMessageInContent(diffBody: string, message: string | null): string {
    let contentToWrite = diffBody;
    if (message) {
        const subjectLine = `Subject: [PATCH] ${message}`;
        // Ensure diffBody is trimmed before checking if it's empty,
        // but use the un-trimmed version if adding subject.
        if (diffBody.trim() !== "") {
            contentToWrite = `${subjectLine}\n\n${diffBody}`;
        } else {
            // If original diff body was effectively empty, and we have a message,
            // the patch should represent no changes, so it should be empty.
            contentToWrite = "";
        }
    }
    // Ensure the final string written to file ends with a newline if not empty
    if (contentToWrite !== "" && !contentToWrite.endsWith('\n')) {
        contentToWrite += '\n';
    }
    return contentToWrite;
}

/**
 * Helper function to get the actual diff body, stripping any existing Subject line.
 * @param patchFileContent The full content of the patch file.
 * @returns The diff body.
 */
function getActualDiffBody(patchFileContent: string): string {
    const lines = patchFileContent.split('\n');
    if (lines.length > 0 && lines[0].startsWith('Subject: [PATCH]')) {
        // Check for the empty line after Subject
        if (lines.length > 1 && lines[1] === '') { 
            return lines.slice(2).join('\n'); // Skip Subject and empty line
        }
        // If Subject line exists but no empty line follows (e.g., an empty patch that only had a Subject)
        // consider the body to be empty.
        return ""; 
    }
    return patchFileContent; // No Subject line found, return content as is
}


interface SimplifiedUpdatePatchOffsetsResult {
    outputPath: string;
}

async function updatePatchOffsets(
    patchFileName: string,
    repoRoot: string,
    customCommitMessage?: string
): Promise<SimplifiedUpdatePatchOffsetsResult> {
    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    if (!fs.existsSync(absolutePatchFilePath) || !fs.statSync(absolutePatchFilePath).isFile()) {
        throw new Error(`Patch file '${absolutePatchFilePath}' not found or is not a file.`);
    }

    const mainBranchExistsResult = await execGit(repoRoot, ['rev-parse', '--verify', 'main'], { allowFailure: true, ignoreStderr: true });
    if (!mainBranchExistsResult.success) {
        throw new GitExecutionError("CRITICAL ERROR: The 'main' branch does not exist in the repository. Cannot calculate diff against 'main'.", mainBranchExistsResult.error);
    }

    let originalBranchOrCommit: string = '';
    try {
        const symbolicRefResult = await execGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true, ignoreStderr: true });
        if (symbolicRefResult.success && symbolicRefResult.stdout) {
            originalBranchOrCommit = symbolicRefResult.stdout;
        } else {
            originalBranchOrCommit = (await execGit(repoRoot, ['rev-parse', 'HEAD'])).stdout;
        }
        if (!originalBranchOrCommit) {
            throw new Error("Could not determine the current branch or commit.");
        }
    } catch (e: any) {
        throw new GitExecutionError(`Failed to determine current branch/commit: ${e.message}`, e);
    }

    const tempBranchName = `temp/offset-automation-${Date.now()}`;
    let operationSucceeded = false;
    let cliEquivalentCallSucceeded = false;

    try {
        console.log(`INFO: Creating temporary branch '${tempBranchName}' from '${originalBranchOrCommit}'.`);
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, originalBranchOrCommit, '--quiet']);
        console.log(`INFO: Switched to temporary branch '${tempBranchName}'.`);

        try {
            console.log(`INFO: On branch '${tempBranchName}', attempting to execute internal remove for: ${patchFileName}`);
            await handleApplyOperation(patchFileName, false, true, '--remove (invoked by offset)', repoRoot);
            console.log(`INFO: Internal remove of '${patchFileName}' command executed successfully on temp branch.`);
            cliEquivalentCallSucceeded = true;
        } catch (removeError: any) {
            console.warn(`WARN: Internal remove of '${patchFileName}' command failed on temp branch.`);
            if (removeError.message) {
                console.warn(`  Error details: ${removeError.message}`);
            }

            console.log(`INFO: On branch '${tempBranchName}', attempting to execute internal add for: ${patchFileName} (after remove failed)`);
            try {
                await handleApplyOperation(patchFileName, false, false, '--add (invoked by offset, after remove failed)', repoRoot);
                console.log(`INFO: Internal add of '${patchFileName}' command executed successfully on temp branch.`);
                cliEquivalentCallSucceeded = true;
            } catch (addError: any) {
                console.warn(`WARN: Internal add of '${patchFileName}' command also failed on temp branch.`);
                if (addError.message) {
                    console.warn(`  Error details: ${addError.message}`);
                }
                cliEquivalentCallSucceeded = false;
            }
        }

        if (cliEquivalentCallSucceeded) {
            console.log(`INFO: Staging changes on temporary branch '${tempBranchName}'.`);
            await execGit(repoRoot, ['add', '.']);

            const tempCommitMessageText = "Internal: Staged changes for offset update";
            console.log(`INFO: Committing staged changes on temporary branch '${tempBranchName}'.`);
            await execGit(repoRoot, ['commit', '--allow-empty', '-m', tempCommitMessageText, '--quiet']);

            const tayloredDirPath = path.join(repoRoot, TAYLORED_DIR_NAME);
            await fs.ensureDir(tayloredDirPath);

            console.log(`INFO: On branch '${tempBranchName}', calculating new patch content using 'git diff main HEAD'.`);
            const diffCmdResult = await execGit(repoRoot, ['diff', 'main', 'HEAD'], { allowFailure: true });

            const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
            const rawNewDiffContent = diffCmdResult.stdout || "";

            // Determine effective message to embed (custom takes precedence)
            let effectiveMessageToEmbed: string | null = null;
            if (customCommitMessage) {
                effectiveMessageToEmbed = customCommitMessage;
            } else {
                effectiveMessageToEmbed = extractMessageFromPatch(originalPatchContent);
            }

            if (diffCmdResult.error && diffCmdResult.error.code !== 0 && diffCmdResult.error.code !== 1) {
                console.error(`ERRORE: L'esecuzione del comando 'git diff main HEAD' è fallita con un codice di uscita imprevisto ${diffCmdResult.error.code} sul branch temporaneo.`);
                if (diffCmdResult.stderr) console.error(`  Stderr: ${diffCmdResult.stderr}`);
            } else {
                const originalHunks = parsePatchHunks(originalPatchContent);
                const newHunks = parsePatchHunks(rawNewDiffContent);
                
                let allHunksAreConsideredInverted = false;
                if (originalHunks.length > 0 && originalHunks.length === newHunks.length) {
                    let numInvertedHunks = 0;
                    for (let i = 0; i < originalHunks.length; i++) {
                        const origHunk = originalHunks[i];
                        const newHunk = newHunks[i];
                        if (
                            newHunk.oldStart === origHunk.newStart &&
                            newHunk.oldLines === origHunk.newLines &&
                            newHunk.newStart === origHunk.oldStart &&
                            newHunk.newLines === origHunk.oldLines &&
                            origHunk.oldLines !== origHunk.newLines
                        ) {
                            numInvertedHunks++;
                        }
                    }
                    if (numInvertedHunks > 0 && numInvertedHunks === originalHunks.length) {
                        allHunksAreConsideredInverted = true;
                    }
                }

                let finalOutputContentToWrite: string;

                if (allHunksAreConsideredInverted) {
                    console.log("INFO: Gli hunk della patch ricalcolata sono invertiti. Si procede ad aggiornare/inserire il messaggio nel file di patch mantenendo il contenuto diff originale.");
                    const bodyOfOriginalPatch = getActualDiffBody(originalPatchContent);
                    finalOutputContentToWrite = embedMessageInContent(bodyOfOriginalPatch, effectiveMessageToEmbed);

                    if (finalOutputContentToWrite === originalPatchContent) {
                        console.log(`INFO: Il file taylored è già aggiornato con il messaggio corretto e contenuto diff originale (hunk invertiti). Nessun aggiornamento necessario.`);
                    } else {
                        await fs.writeFile(absolutePatchFilePath, finalOutputContentToWrite);
                        console.log(`SUCCESSO: Il file di patch '${absolutePatchFilePath}' è stato aggiornato con il messaggio (contenuto diff originale mantenuto a seguito di hunk invertiti).`);
                    }
                    operationSucceeded = true;
                } else { // Not allHunksAreConsideredInverted - use new diff content
                    if (originalHunks.length !== newHunks.length && !(originalHunks.length === 0 && newHunks.length > 0) && !(originalHunks.length > 0 && newHunks.length === 0) ) { // only log if not add/del of all hunks
                         console.log(`INFO: Il numero di hunk differisce (originale: ${originalHunks.length}, nuovo: ${newHunks.length}). La patch verrà aggiornata con il nuovo contenuto se differente.`);
                    }
                    const cleanedDiffContent = rawNewDiffContent.split('\n').map(line => line.trimEnd()).join('\n');
                    finalOutputContentToWrite = embedMessageInContent(cleanedDiffContent, effectiveMessageToEmbed);
                    
                    if (finalOutputContentToWrite === originalPatchContent) {
                        console.log(`INFO: Il contenuto della patch (messaggio e nuovo diff) è identico a quello originale. Non è necessario aggiornare il file taylored.`);
                    } else {
                        await fs.writeFile(absolutePatchFilePath, finalOutputContentToWrite);
                        console.log(`SUCCESSO: Il file di patch '${absolutePatchFilePath}' è stato aggiornato con nuovo contenuto e messaggio (se applicabile).`);
                    }
                    operationSucceeded = true;
                }
            }
        } else { 
            console.error(`ERRORE: Le operazioni interne preliminari di apply/remove per '${patchFileName}' sono fallite sul branch temporaneo.`);
        }

    } catch (error: any) {
        console.error(`CRITICAL ERROR during offset update process: ${error.message}`);
        if (error instanceof GitExecutionError && error.stderr) {
            console.error(`Git STDERR: ${error.stderr}`);
        }
        operationSucceeded = false;
    } finally {
        console.log("INFO: Cleaning up temporary branch and restoring original state...");
        try {
            console.log(`INFO: Checking out original branch/commit '${originalBranchOrCommit}'.`);
            await execGit(repoRoot, ['checkout', '--force', originalBranchOrCommit, '--quiet']);

            const tempBranchExistsResult = await execGit(repoRoot, ['rev-parse', '--verify', tempBranchName], { allowFailure: true, ignoreStderr: true });
            if (tempBranchExistsResult.success) {
                console.log(`INFO: Deleting temporary branch '${tempBranchName}'.`);
                await execGit(repoRoot, ['branch', '-D', tempBranchName, '--quiet']);
            }
        } catch (cleanupErr: any) {
            console.warn(`WARN: Error during Git cleanup: ${cleanupErr.message}. Manual cleanup of branch '${tempBranchName}' and checkout of '${originalBranchOrCommit}' might be needed.`);
        }
    }

    if (!operationSucceeded) {
        throw new Error(`WARNING: The taylored file '${patchFileName}' is obsolete or could not be processed for offset update.`);
    }

    return { outputPath: absolutePatchFilePath };
}

export { updatePatchOffsets, extractMessageFromPatch, parsePatchHunks, quoteForShell, GitExecutionError };

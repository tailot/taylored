// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, ExecOptions as ChildProcessExecOptions } from 'child_process';
import * as util from 'util';

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

interface SimplifiedUpdatePatchOffsetsResult {
    outputPath: string;
}

async function updatePatchOffsets(
    patchFileName: string,
    repoRoot: string,
    customCommitMessage?: string
): Promise<SimplifiedUpdatePatchOffsetsResult> {
    const tayloredDirName = '.taylored';
    const TAYLORED_FILE_EXTENSION = '.taylored';
    const absolutePatchFilePath = path.join(repoRoot, tayloredDirName, patchFileName);

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
    let cliCallSucceeded = false;

    try {
        console.log(`INFO: Creating temporary branch '${tempBranchName}' from '${originalBranchOrCommit}'.`);
        await execGit(repoRoot, ['checkout', '-b', tempBranchName, originalBranchOrCommit, '--quiet']);
        console.log(`INFO: Switched to temporary branch '${tempBranchName}'.`);

        const baseName = patchFileName.replace(new RegExp(`\\${TAYLORED_FILE_EXTENSION}$`), '');
        const nodeExecutable = process.argv[0];
        const scriptPath = process.argv[1];
        const tayloredCliCommandBase = `${quoteForShell(nodeExecutable)} ${quoteForShell(scriptPath)}`;

        const removeCommand = `${tayloredCliCommandBase} --remove ${quoteForShell(baseName)}`;
        console.log(`INFO: On branch '${tempBranchName}', attempting to execute: ${removeCommand}`);
        try {
            const { stdout, stderr } = await execAsync(removeCommand, { cwd: repoRoot });
            if (stderr && stderr.trim() !== '') console.warn(`WARN: Stderr from 'taylored --remove ${baseName}' on temp branch:\n${stderr.trim()}`);
            console.log(`INFO: 'taylored --remove ${baseName}' command executed successfully on temp branch.`);
            cliCallSucceeded = true;
        } catch (removeError: any) {
            console.warn(`WARN: 'taylored --remove ${baseName}' command failed on temp branch.`);
            if (removeError.stdout && removeError.stdout.trim() !== '') console.warn(`  Stdout: ${removeError.stdout.trim()}`);
            if (removeError.stderr && removeError.stderr.trim() !== '') console.warn(`  Stderr: ${removeError.stderr.trim()}`);
            
            const addCommand = `${tayloredCliCommandBase} --add ${quoteForShell(baseName)}`;
            console.log(`INFO: On branch '${tempBranchName}', attempting to execute: ${addCommand}`);
            try {
                const { stdout, stderr } = await execAsync(addCommand, { cwd: repoRoot });
                if (stderr && stderr.trim() !== '') console.warn(`WARN: Stderr from 'taylored --add ${baseName}' on temp branch:\n${stderr.trim()}`);
                console.log(`INFO: 'taylored --add ${baseName}' command executed successfully on temp branch.`);
                cliCallSucceeded = true;
            } catch (addError: any) {
                console.warn(`WARN: 'taylored --add ${baseName}' command also failed on temp branch.`);
                if (addError.stdout && addError.stdout.trim() !== '') console.warn(`  Stdout: ${addError.stdout.trim()}`);
                if (addError.stderr && addError.stderr.trim() !== '') console.warn(`  Stderr: ${addError.stderr.trim()}`);
                cliCallSucceeded = false; 
            }
        }

        if (cliCallSucceeded) {
            console.log(`INFO: Staging changes on temporary branch '${tempBranchName}'.`);
            await execGit(repoRoot, ['add', '.']);

            const tempCommitMessage = "Internal: Staged changes for offset update";
            console.log(`INFO: Committing staged changes on temporary branch '${tempBranchName}'.`);
            await execGit(repoRoot, ['commit', '--allow-empty', '-m', tempCommitMessage, '--quiet']);

            const tayloredDirPath = path.join(repoRoot, tayloredDirName);
            await fs.ensureDir(tayloredDirPath);

            console.log(`INFO: On branch '${tempBranchName}', calculating new patch content using 'git diff main HEAD'.`);
            const diffCmdResult = await execGit(repoRoot, ['diff', 'main', 'HEAD'], { allowFailure: true });
            
            const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
            const rawNewDiffContent = diffCmdResult.stdout || ""; 

            if (diffCmdResult.error && diffCmdResult.error.code !== 0 && diffCmdResult.error.code !== 1) {
                console.error(`ERROR: 'git diff main HEAD' command execution failed with unexpected exit code ${diffCmdResult.error.code} on temp branch.`);
                if (diffCmdResult.stderr) console.error(`  Stderr: ${diffCmdResult.stderr}`);
            } else {
                const originalHunks = parsePatchHunks(originalPatchContent);
                const newHunks = parsePatchHunks(rawNewDiffContent);
                
                let numCorrespondingHunks = 0;
                let numInvertedHunks = 0;
                let allHunksAreConsideredInverted = false;

                if (originalHunks.length > 0 && originalHunks.length === newHunks.length) {
                    numCorrespondingHunks = originalHunks.length;
                    for (let i = 0; i < originalHunks.length; i++) {
                        const origHunk = originalHunks[i];
                        const newHunk = newHunks[i];

                        // Stricter inversion check: checks start lines and line counts
                        if (
                            newHunk.oldStart === origHunk.newStart &&
                            newHunk.oldLines === origHunk.newLines &&
                            newHunk.newStart === origHunk.oldStart &&
                            newHunk.newLines === origHunk.oldLines &&
                            origHunk.oldLines !== origHunk.newLines // Asymmetry condition
                        ) {
                            numInvertedHunks++;
                        }
                    }
                    if (numInvertedHunks > 0 && numInvertedHunks === numCorrespondingHunks) {
                        allHunksAreConsideredInverted = true;
                    }
                } else if (originalHunks.length !== newHunks.length) {
                     console.log(`INFO: Number of hunks differs (original: ${originalHunks.length}, new: ${newHunks.length}). Patch will be updated with new content if different.`);
                }

                if (allHunksAreConsideredInverted) {
                    console.log("INFO: Tutti gli hunk della patch ricalcolata risultano 'strettamente' invertiti rispetto all'originale. Il file taylored non verrà aggiornato.");
                    operationSucceeded = true; 
                } else {
                    let messageToEmbed: string | null = null;
                    if (customCommitMessage) {
                        messageToEmbed = customCommitMessage;
                    } else {
                        messageToEmbed = extractMessageFromPatch(originalPatchContent);
                    }

                    let finalOutputContent = rawNewDiffContent; 
                    if (messageToEmbed) {
                        const subjectLine = `Subject: [PATCH] ${messageToEmbed}`;
                        if (rawNewDiffContent.trim() === "") {
                           finalOutputContent = `${subjectLine}\n`; 
                        } else {
                           finalOutputContent = `${subjectLine}\n\n${rawNewDiffContent}`;
                        }
                    }
                    
                    if (finalOutputContent.trim() === originalPatchContent.trim()) {
                        console.log(`INFO: Il contenuto della patch (messaggio e nuovo diff) è identico a quello originale. Non è necessario aggiornare il file taylored.`);
                        operationSucceeded = true;
                    } else {
                        await fs.writeFile(absolutePatchFilePath, finalOutputContent);
                        console.log(`SUCCESS: Patch file '${absolutePatchFilePath}' aggiornato con nuovo contenuto e messaggio (se applicabile).`);
                        operationSucceeded = true;
                    }
                }
            }
        } else {
            console.error(`ERROR: Prerequisite 'taylored --remove ${baseName}' or 'taylored --add ${baseName}' failed on temp branch.`);
        }

    } catch (error: any) {
        console.error(`CRITICAL ERROR during offset update process: ${error.message}`);
        if (error instanceof GitExecutionError && error.stderr) {
            console.error(`Git STDERR: ${error.stderr}`);
        }
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
        throw new Error(`WARNING: The taylored file '${patchFileName}' is obsolete or could not be processed.`);
    }

    return { outputPath: absolutePatchFilePath };
}

// La funzione getDiffBody è stata rimossa perché non più necessaria con questa logica.
export { updatePatchOffsets, extractMessageFromPatch, parsePatchHunks, quoteForShell, GitExecutionError };
// lib/git-patch-upgrader.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { exec, ExecOptions as ChildProcessExecOptions } from 'child_process';
import * as util from 'util';
import { TAYLORED_DIR_NAME } from './constants'; // Corrected path
import { Hunk, parsePatchHunks } from './utils'; // Hunk and parsePatchHunks from utils

const execAsync = util.promisify(exec);

// Minimal git interaction, primarily for fetching file content from a branch.
async function getFileContentFromGit(
    repoRoot: string,
    filePath: string,
    branchName: string
): Promise<string | null> {
    const command = `git show ${branchName}:${filePath}`;
    try {
        const { stdout } = await execAsync(command, { cwd: repoRoot });
        return stdout;
    } catch (error) {
        // console.warn(`Warn: Could not fetch file '${filePath}' from branch '${branchName}'. Error: ${error}`);
        return null; // Return null if file not found or other git error
    }
}

interface PatchLine {
    type: 'context' | 'add' | 'remove' | 'header' | 'index' | 'special'; // '---', '+++', '@@ ... @@'
    content: string;
    originalLineNumber?: number; // Line number in the original patch file
}

interface DetailedHunk extends Hunk {
    lines: PatchLine[];
    // We might not need to store headerString separately if lines[0] is the header
}

// Simplified parsing focusing on lines within hunks for surgical modification
function parsePatchForSurgicalUpdate(patchContent: string): {
    headerLines: PatchLine[]; // All lines before the first hunk (diff --git, index, ---, +++)
    hunks: DetailedHunk[];
    noNewlineAtEndFile: boolean;
} {
    const lines = patchContent.split('\n');
    const parsedHunks: DetailedHunk[] = [];
    let currentHunkLines: PatchLine[] = [];
    let currentHunkHeaderInfo: Hunk | null = null;
    const headerLines: PatchLine[] = [];
    let inHunkContent = false;
    let noNewlineAtEndFile = patchContent.endsWith('\n\\ No newline at end of file') || patchContent.endsWith('\r\n\\ No newline at end of file');
    if (noNewlineAtEndFile) {
        const lfMatch = lines[lines.length -1] === '\\ No newline at end of file';
        // Attempt to detect if the actual last content line was blank, then \No new...
        const crlfMatch = lines.length > 1 && lines[lines.length -2] === '' && lines[lines.length-1] === '\\ No newline at end of file';
        if (lfMatch || crlfMatch) {
            if (lfMatch && !crlfMatch) lines.pop(); // Remove only "\ No newline..."
            if (crlfMatch) { lines.pop(); lines.pop(); } // Remove blank line and "\ No newline..."
        } else {
            noNewlineAtEndFile = false; // False positive
        }
    }


    const genericHunks = parsePatchHunks(patchContent); // To get overall hunk structures
    let hunkIdx = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.startsWith('diff --git')) {
            headerLines.push({ type: 'header', content: line, originalLineNumber: i + 1 });
            inHunkContent = false;
        } else if (line.startsWith('index ')) {
            headerLines.push({ type: 'index', content: line, originalLineNumber: i + 1 });
            inHunkContent = false;
        } else if (line.startsWith('--- ')) {
            headerLines.push({ type: 'special', content: line, originalLineNumber: i + 1 });
            inHunkContent = false;
        } else if (line.startsWith('+++ ')) {
            headerLines.push({ type: 'special', content: line, originalLineNumber: i + 1 });
            inHunkContent = false;
        } else if (line.startsWith('@@ ')) {
            if (currentHunkHeaderInfo && currentHunkLines.length > 0) {
                // This logic might be flawed if hunks are processed out of order or genericHunks is not aligned
                const fullHunkInfo = genericHunks.find(gh => gh.originalHeaderLine === line);
                if (fullHunkInfo) {
                    parsedHunks.push({ ...fullHunkInfo, lines: currentHunkLines });
                } else {
                     // Fallback or error: could not find matching generic hunk for current lines
                }
            }
            currentHunkHeaderInfo = genericHunks[hunkIdx++]; // Relies on hunkIdx being in sync
            currentHunkLines = [{ type: 'special', content: line, originalLineNumber: i + 1 }]; // Hunk header
            inHunkContent = true;
        } else if (inHunkContent) {
            if (line.startsWith('+')) {
                currentHunkLines.push({ type: 'add', content: line, originalLineNumber: i + 1 });
            } else if (line.startsWith('-')) {
                currentHunkLines.push({ type: 'remove', content: line, originalLineNumber: i + 1 });
            } else { // context line starts with a space or is empty (though empty lines in patches are rare)
                currentHunkLines.push({ type: 'context', content: line, originalLineNumber: i + 1 });
            }
        } else {
            // Lines before any hunk or after all hunks, not fitting standard headers
            if (parsedHunks.length === 0 && headerLines.length < 4) { // Still in header part (diff, index, ---, +++)
                 headerLines.push({ type: 'header', content: line, originalLineNumber: i + 1 });
            }
            // Footer lines or unexpected lines could be collected separately if needed
        }
    }

    if (currentHunkHeaderInfo && currentHunkLines.length > 0) {
         const fullHunkInfo = genericHunks.find(gh => gh.originalHeaderLine === currentHunkLines[0].content);
         if (fullHunkInfo) {
            parsedHunks.push({ ...fullHunkInfo, lines: currentHunkLines });
         } else {
            // Fallback for last hunk if its header line wasn't matched by find.
            // This might happen if currentHunkHeaderInfo was from genericHunks[hunkIdx-1]
            // and currentHunkLines[0].content is the actual header.
            // A more robust way would be to directly use currentHunkHeaderInfo if it's correctly assigned.
            if(genericHunks[hunkIdx-1]) { // Check if hunkIdx-1 is valid
                 parsedHunks.push({ ...genericHunks[hunkIdx-1], lines: currentHunkLines });
            }
         }
    }

    return { headerLines, hunks: parsedHunks, noNewlineAtEndFile };
}


export async function upgradePatch(
    patchFileName: string, // This is the fully resolved name like my_patch.taylored
    repoRoot: string,
    branchName?: string
): Promise<{ upgraded: boolean; message: string }> {
    const absolutePatchFilePath = path.isAbsolute(patchFileName)
        ? patchFileName
        : path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    if (!await fs.pathExists(absolutePatchFilePath)) {
        return { upgraded: false, message: `CRITICAL ERROR: Patch file not found: ${absolutePatchFilePath}` };
    }

    const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
    const { headerLines, hunks: parsedDetailedHunks, noNewlineAtEndFile } = parsePatchForSurgicalUpdate(originalPatchContent);

    if (parsedDetailedHunks.length === 0 && !originalPatchContent.startsWith('diff --git')) {
        // Allow empty patches (only headers) to pass through without error, but mark as not upgraded.
        if (originalPatchContent.trim() === "" || headerLines.length > 0) {
             return { upgraded: false, message: `Patch '${patchFileName}' is empty or contains no standard hunks to process.` };
        }
        return { upgraded: false, message: `Patch '${patchFileName}' could not be parsed correctly or contains no hunks.` };
    }


    let targetFileRelativePath: string | null = null;
    for (const line of headerLines) {
        if (line.type === 'header' && line.content.startsWith('diff --git a/')) {
            const match = line.content.match(/^diff --git a\/(.+?) b\/.+$/);
            if (match && match[1]) {
                targetFileRelativePath = match[1];
                break;
            }
        }
    }

    if (!targetFileRelativePath) {
         // If there are no hunks, it might be an empty patch (e.g. only headers).
        // In this case, not finding a target file path from "diff --git" is expected for empty patches.
        if (parsedDetailedHunks.length === 0) {
             return { upgraded: false, message: `Patch '${patchFileName}' appears to be empty (no hunks); no target file to upgrade.` };
        }
        return { upgraded: false, message: `CRITICAL ERROR: Could not determine target file name from patch header in '${patchFileName}'.` };
    }

    const absoluteTargetFilePath = path.join(repoRoot, targetFileRelativePath);

    let currentFileContentString: string | null;
    if (branchName) {
        currentFileContentString = await getFileContentFromGit(repoRoot, targetFileRelativePath, branchName);
        if (currentFileContentString === null) {
            return { upgraded: false, message: `CRITICAL ERROR: Could not read target file '${targetFileRelativePath}' from branch '${branchName}'.` };
        }
    } else {
        if (!await fs.pathExists(absoluteTargetFilePath)) {
            return { upgraded: false, message: `CRITICAL ERROR: Target file '${absoluteTargetFilePath}' not found in the workspace.` };
        }
        currentFileContentString = await fs.readFile(absoluteTargetFilePath, 'utf-8');
    }

    const currentFileLines = currentFileContentString.split('\n');
    let patchWasModified = false;
    const newHunksSourceLines: string[][] = [];


    for (const hunk of parsedDetailedHunks) {
        const contextLinesBefore: string[] = [];
        const contextLinesAfter: string[] = [];
        const addLinesOriginalData: { content: string, indexInHunk: number }[] = [];
        const addLinesContentOriginal: string[] = []; // For matching and comparison
        const currentHunkSourceLines: string[] = [hunk.lines[0].content]; // Start with hunk header

        type ParsingStage = 'beforeContext' | 'additions' | 'afterContext';
        let parsingStage: ParsingStage = 'beforeContext';
        let pureToAdd = true; // Assume pure until a '-' is found in this hunk's modifications

        for(let i = 1; i < hunk.lines.length; i++) {
            const lineObj = hunk.lines[i];
            currentHunkSourceLines.push(lineObj.content); // Keep original line for reconstruction if hunk is skipped

            if(lineObj.type === 'add') {
                parsingStage = 'additions';
                const lineContent = lineObj.content.substring(1);
                addLinesOriginalData.push({ content: lineContent, indexInHunk: i });
                addLinesContentOriginal.push(lineContent);
            } else if (lineObj.type === 'remove') {
                pureToAdd = false;
                break;
            } else if (lineObj.type === 'context') {
                const lineContent = lineObj.content.substring(1);
                if (parsingStage === 'beforeContext') {
                    contextLinesBefore.push(lineContent);
                } else { // Includes 'additions' stage (transitioning) or already 'afterContext'
                    parsingStage = 'afterContext';
                    contextLinesAfter.push(lineContent);
                }
            }
        }

        if (!pureToAdd) {
            newHunksSourceLines.push(currentHunkSourceLines);
            continue;
        }
        if (addLinesOriginalData.length === 0) { // No additions in this hunk to upgrade
            newHunksSourceLines.push(currentHunkSourceLines);
            continue;
        }

        let currentFileSearchIndex = 0;
        let firstContextBlockMatchIndex = -1;

        if (contextLinesBefore.length > 0) {
            firstContextBlockMatchIndex = findSubsequence(currentFileLines, contextLinesBefore, currentFileSearchIndex);
            if (firstContextBlockMatchIndex === -1) {
                newHunksSourceLines.push(currentHunkSourceLines); // Context fail, keep original
                // console.warn(`Upper context not found for hunk starting with ${hunk.lines[0].content}`);
                continue;
            }
            currentFileSearchIndex = firstContextBlockMatchIndex + contextLinesBefore.length;
        } else {
            currentFileSearchIndex = Math.max(0, hunk.newStart -1);
        }

        const targetFileLinesForHunk: string[] = [];
        // Use addLinesContentOriginal for length checks and content comparison
        let expectedLinesInFile = addLinesContentOriginal.length;

        if (contextLinesAfter.length > 0) {
            const secondContextBlockMatchIndex = findSubsequence(currentFileLines, contextLinesAfter, currentFileSearchIndex);
            if (secondContextBlockMatchIndex === -1 || (contextLinesBefore.length > 0 && secondContextBlockMatchIndex < currentFileSearchIndex)) {
                newHunksSourceLines.push(currentHunkSourceLines);
                continue;
            }
            // The number of lines in the file that correspond to the patch's add/remove lines
            const linesBetweenContextsInFile = secondContextBlockMatchIndex - currentFileSearchIndex;
            for(let i = 0; i < linesBetweenContextsInFile; i++) {
                targetFileLinesForHunk.push(currentFileLines[currentFileSearchIndex + i]);
            }
            // expectedLinesInFile is already addLinesContentOriginal.length
        } else {
            // No lower context, so we take 'addLinesContentOriginal.length' lines from currentFileSearchIndex
            for(let i = 0; i < addLinesContentOriginal.length && (currentFileSearchIndex + i) < currentFileLines.length; i++) {
                targetFileLinesForHunk.push(currentFileLines[currentFileSearchIndex + i]);
            }
            // expectedLinesInFile is already addLinesContentOriginal.length; targetFileLinesForHunk might be shorter if EOF
        }

        // Check for "pure" modification: only if the number of lines to be added matches
        // the number of lines found in the target file between contexts.
        if (addLinesContentOriginal.length !== targetFileLinesForHunk.length) { // Compare with actual lines read
            newHunksSourceLines.push(currentHunkSourceLines);
            continue;
        }

        // If we reach here, context and cardinality match. Now, update lines.
        const modifiedHunkLinesThisIteration: string[] = [hunk.lines[0].content];
        let hunkContentChangedThisIteration = false;

        // Iterate based on addLinesOriginalData to get original indexInHunk for modification
        let targetFileLineIdx = 0;
        for (let i = 1; i < hunk.lines.length; i++) {
            const originalLineObj = hunk.lines[i];
            if (originalLineObj.type === 'add') {
                // Find the corresponding entry in addLinesOriginalData to ensure we're updating the correct line
                const addData = addLinesOriginalData.find(ad => ad.indexInHunk === i);
                if (addData) {
                    const originalContent = addData.content;
                    // Use targetFileLineIdx for targetFileLinesForHunk as it's dense
                    const newContentInFile = targetFileLinesForHunk[targetFileLineIdx];
                    targetFileLineIdx++;
                    if (originalContent !== newContentInFile) {
                        modifiedHunkLinesThisIteration.push('+' + newContentInFile);
                        hunkContentChangedThisIteration = true;
                        patchWasModified = true;
                    } else {
                        modifiedHunkLinesThisIteration.push(originalLineObj.content);
                    }
                } else {
                     // Should not happen if logic is correct, means an 'add' line in hunk.lines was not in addLinesOriginalData
                    modifiedHunkLinesThisIteration.push(originalLineObj.content);
                }
            } else { // context lines
                modifiedHunkLinesThisIteration.push(originalLineObj.content);
            }
        }
        newHunksSourceLines.push(modifiedHunkLinesThisIteration);

    } // End of hunk iteration

    if (patchWasModified) {
        let newPatchContentLines = headerLines.map(l => l.content);
        newHunksSourceLines.forEach(hunkLinesArray => {
            newPatchContentLines = newPatchContentLines.concat(hunkLinesArray);
        });

        let finalNewPatchContent = newPatchContentLines.join('\n');

        if (noNewlineAtEndFile) {
            // Ensure it doesn't end with a newline before adding the comment
            if (finalNewPatchContent.endsWith('\n')) {
                 finalNewPatchContent = finalNewPatchContent.substring(0, finalNewPatchContent.length -1);
            }
            finalNewPatchContent += '\n\\ No newline at end of file';
        } else {
            // Ensure it ends with a single newline if it's not empty and not the "no newline" case
            if (finalNewPatchContent.trim() !== "" && !finalNewPatchContent.endsWith('\n')) {
                finalNewPatchContent += '\n';
            }
        }

        // Only write if the content (ignoring only trailing newline differences if not \No newline) actually changed
        const originalComparison = noNewlineAtEndFile ? originalPatchContent : originalPatchContent.trimEnd();
        const newComparison = noNewlineAtEndFile ? finalNewPatchContent : finalNewPatchContent.trimEnd();

        if (originalComparison !== newComparison) {
            await fs.writeFile(absolutePatchFilePath, finalNewPatchContent, 'utf-8');
            return { upgraded: true, message: `Patch '${patchFileName}' has been surgically updated.` };
        } else {
            return { upgraded: false, message: `Patch '${patchFileName}' content did not change after surgical update analysis.` };
        }
    } else {
        return { upgraded: false, message: `Patch '${patchFileName}' is already up-to-date with the target file or no applicable modifications found.` };
    }
}

// Helper to find subsequence, needed for context matching
function findSubsequence(arr: string[], subArr: string[], startIndex: number = 0): number {
    if (subArr.length === 0) return startIndex; // Empty subsequence found at current startIndex
    for (let i = startIndex; i <= arr.length - subArr.length; i++) {
        let found = true;
        for (let j = 0; j < subArr.length; j++) {
            if (arr[i + j] !== subArr[j]) {
                found = false;
                break;
            }
        }
        if (found) {
            return i;
        }
    }
    return -1;
}

import * as fs from 'fs';
import * as path from 'path';

/**
 * Represents a single change (addition, deletion, or context) within a hunk.
 */
interface Change {
    /** The type of change: ' ' (context), '+' (addition), or '-' (deletion). */
    type: string;
    /** The content of the line, excluding the type character. */
    content: string;
    /** The original line number in the patch file (may not be accurate for file context). */
    lineNumber: number;
}

/**
 * Represents a hunk of changes in a patch file.
 * A hunk is a contiguous block of changes.
 */
interface Hunk {
    /** The starting line number of the hunk in the old file. */
    oldStart: number;
    /** The number of lines the hunk covers in the old file. */
    oldCount: number;
    /** The starting line number of the hunk in the new file. */
    newStart: number;
    /** The number of lines the hunk covers in the new file. */
    newCount: number;
    /** An array of changes within this hunk. */
    changes: Change[];
    /** Context information, originally from JS version, seems unused. */
    context: any[];
}

/**
 * Represents a single patch, typically for one file.
 * A patch file can contain multiple such patches if it's a combined diff.
 */
interface Patch {
    /** The path to the old file (e.g., 'a/path/to/file.txt'). */
    oldFile: string;
    /** The path to the new file (e.g., 'b/path/to/file.txt'), or null if the file was deleted. */
    newFile: string | null;
    /** An array of hunks that make up this patch. */
    hunks: Hunk[];
}

/**
 * Represents a context line used as a frame for a modification block.
 * Frames help anchor modification blocks to the target file content.
 */
interface Frame {
    /** The content of the context line. */
    content: string;
    /** The line number of this frame in the old file version. */
    oldLineNumber: number;
    /** The line number of this frame in the new file version. */
    newLineNumber: number;
}

/**
 * Represents a block of homogeneous modifications (all additions or all deletions)
 * and its surrounding context frames.
 */
interface ModificationBlock {
    /** The type of modification: 'addition' or 'deletion'. */
    type: 'addition' | 'deletion';
    /** An array of change objects that form this block. */
    changes: Change[];
    /** The context frame immediately preceding this block, if any. */
    topFrame: Frame | null;
    /** The context frame immediately following this block, if any. */
    bottomFrame: Frame | null;
    /** The index of the hunk within the patch where this block is located. */
    hunkIndex: number;
    /** The 1-based starting line number of this block in the relevant file (old for deletion, new for addition). */
    startLineNumber: number;
}

/**
 * Represents the result of checking a single frame's integrity.
 */
interface FrameCheckResult {
    /** Whether the frame content matches the expected content in the target file. */
    intact: boolean;
    /** A message describing the outcome of the check. */
    message: string;
    /** The expected content of the frame from the patch. Null if no frame. */
    expected: string | null;
    /** The actual content found at the expected line in the target file. Null if line is out of bounds or no frame. */
    actual: string | null;
    /** The 1-based line number where the frame was expected in the target file. */
    lineNumber?: number;
}

/**
 * Represents the results of checking the top and bottom frames of a modification block.
 */
interface BlockCheck {
    /** The type of the modification block ('addition' or 'deletion'). */
    blockType: 'addition' | 'deletion';
    /** The result of checking the top frame. */
    topFrame: FrameCheckResult;
    /** The result of checking the bottom frame. */
    bottomFrame: FrameCheckResult;
}

/**
 * Represents the overall result of verifying a patch against a target file,
 * including the status and details of any frame checks.
 */
interface VerificationResult {
    /** The path to the file being verified. */
    file: string;
    /** The status of the verification: 'intact', 'corrupted', or 'error'. */
    status: 'intact' | 'corrupted' | 'error';
    /** A summary message of the verification result. */
    message: string;
    /** Detailed results of checks for each modification block, if applicable. */
    blocks?: BlockCheck[];
    /** Whether the patch content was updated based on the target file. */
    updated?: boolean;
}

/**
 * Analyzes patch files to verify their integrity against target files and
 * can upgrade patch content if context frames are intact.
 * This class is primarily used for the `--upgrade` functionality.
 */
export class PatchAnalyzer {
    /**
     * Initializes a new instance of the PatchAnalyzer.
     * The constructor currently does not perform any specific setup.
     */
    constructor() {
        // Patches are processed one by one, so no need for this.patches array at class level for now
    }

    /**
     * Reads a patch file from the specified path and parses its content.
     * @param patchPath The path to the .patch file.
     * @returns An array of Patch objects parsed from the file.
     * @throws Error if the patch file cannot be read or parsed.
     */
    public readPatch(patchPath: string): Patch[] {
        try {
            const patchContent = fs.readFileSync(patchPath, 'utf8');
            return this.parsePatch(patchContent);
        } catch (error: any) {
            throw new Error(`Error reading patch file ${patchPath}: ${error.message}`);
        }
    }

    /**
     * Parses the string content of a patch file into structured Patch objects.
     * @param patchContent The string content of the patch file.
     * @returns An array of Patch objects.
     */
    private parsePatch(patchContent: string): Patch[] {
        const lines = patchContent.split('\n');
        const patches: Patch[] = [];
        let currentPatch: Patch | null = null;
        let currentHunk: Hunk | null = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];

            if (line.startsWith('---')) {
                if (currentPatch) {
                    patches.push(currentPatch);
                }
                currentPatch = {
                    oldFile: line.substring(4).trim(),
                    newFile: null,
                    hunks: []
                };
            } else if (line.startsWith('+++')) {
                if (currentPatch) {
                    currentPatch.newFile = line.substring(4).trim();
                }
            } else if (line.startsWith('@@')) {
                const hunkInfo = this.parseHunkHeader(line);
                currentHunk = {
                    oldStart: hunkInfo.oldStart,
                    oldCount: hunkInfo.oldCount,
                    newStart: hunkInfo.newStart,
                    newCount: hunkInfo.newCount,
                    changes: [],
                    context: [] // context remains unused from original JS
                };
                if (currentPatch) {
                    currentPatch.hunks.push(currentHunk);
                }
            } else if (currentHunk && (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))) {
                const changeType = line.charAt(0);
                const content = line.substring(1);

                currentHunk.changes.push({
                    type: changeType,
                    content: content,
                    // lineNumber is a placeholder, actual line calculation is handled elsewhere if needed.
                    lineNumber: 0
                });
            }
        }

        if (currentPatch) {
            patches.push(currentPatch);
        }
        return patches;
    }

    /**
     * Parses a hunk header line (e.g., "@@ -1,4 +1,4 @@") to extract line numbers and counts.
     * @param header The hunk header string.
     * @returns An object containing old/new start lines and counts.
     * @throws Error if the hunk header format is invalid.
     */
    private parseHunkHeader(header: string): { oldStart: number, oldCount: number, newStart: number, newCount: number } {
        const match = header.match(/@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/);
        if (!match) {
            throw new Error(`Invalid hunk header: ${header}`);
        }
        return {
            oldStart: parseInt(match[1], 10),
            oldCount: parseInt(match[2], 10) || 1, // Default count is 1 if not specified
            newStart: parseInt(match[3], 10),
            newCount: parseInt(match[4], 10) || 1  // Default count is 1 if not specified
        };
    }

    /**
     * Identifies homogeneous modification blocks (sequences of only additions or only deletions)
     * and their surrounding context frames within a single patch object.
     * Context lines (' ') delimit these blocks.
     * @param patch The Patch object to analyze.
     * @returns An array of ModificationBlock objects found in the patch.
     */
    private identifyModificationBlocks(patch: Patch): ModificationBlock[] {
        const blocks: ModificationBlock[] = [];

        patch.hunks.forEach((hunk, hunkIndex) => {
            let currentBlock: ModificationBlock | null = null;
            let lastContextLine: Frame | null = null;

            for (let i = 0; i < hunk.changes.length; i++) {
                const change = hunk.changes[i];

                if (change.type === ' ') { // Context line
                    const currentOldLine = this.calculateActualLineNumber(hunk, i, 'old');
                    const currentNewLine = this.calculateActualLineNumber(hunk, i, 'new');

                    if (currentBlock && !currentBlock.bottomFrame) {
                        currentBlock.bottomFrame = {
                            content: change.content,
                            oldLineNumber: currentOldLine,
                            newLineNumber: currentNewLine
                        };
                        blocks.push(currentBlock);
                        currentBlock = null;
                    }
                    lastContextLine = {
                        content: change.content,
                        oldLineNumber: currentOldLine,
                        newLineNumber: currentNewLine
                    };
                } else if (change.type === '+' || change.type === '-') { // Modification line
                    if (!currentBlock) {
                        currentBlock = {
                            type: change.type === '+' ? 'addition' : 'deletion',
                            changes: [],
                            topFrame: lastContextLine,
                            bottomFrame: null,
                            hunkIndex: hunkIndex,
                            startLineNumber: this.calculateActualLineNumber(hunk, i, change.type === '+' ? 'new' : 'old')
                        };
                    }

                    const expectedType = currentBlock.type === 'addition' ? '+' : '-';
                    if (change.type !== expectedType) {
                        console.warn(`Warning: Mixed modification block detected in hunk ${hunkIndex}. Current block processing stopped.`);
                        currentBlock = null;
                        lastContextLine = null;
                        continue;
                    }
                    currentBlock.changes.push(change);
                }
            }

            if (currentBlock) {
                blocks.push(currentBlock);
            }
        });
        return blocks;
    }

    /**
     * Calculates the 1-based actual line number for a change within a hunk,
     * relative to the start of the hunk in either the 'old' or 'new' file version.
     * @param hunk The Hunk object containing the change.
     * @param changeIndexInHunk The 0-based index of the target change within the hunk's `changes` array.
     * @param lineType Specifies whether to calculate for the 'old' or 'new' file version.
     * @returns The 1-based line number.
     */
    private calculateActualLineNumber(hunk: Hunk, changeIndexInHunk: number, lineType: 'old' | 'new'): number {
        let oldLineCounter = hunk.oldStart;
        let newLineCounter = hunk.newStart;

        for (let i = 0; i < changeIndexInHunk; i++) {
            const change = hunk.changes[i];
            if (change.type === ' ') {
                oldLineCounter++;
                newLineCounter++;
            } else if (change.type === '-') {
                oldLineCounter++;
            } else if (change.type === '+') {
                newLineCounter++;
            }
        }
        return lineType === 'old' ? oldLineCounter : newLineCounter;
    }


    /**
     * Updates the content of modification blocks within a patch object based on lines from the target file.
     * This method directly modifies the `patch` object. It is intended to be called only if all
     * context frames for the blocks are verified as intact.
     * @param patch The Patch object to update. This object is modified directly.
     * @param blocks An array of ModificationBlock objects identified in the patch.
     * @param fileLines An array of strings, where each string is a line from the target file.
     */
    private updatePatchBlocks(patch: Patch, blocks: ModificationBlock[], fileLines: string[]): void {
        for (const block of blocks) {
            if (!block.topFrame) {
                console.warn("Skipping block update due to missing top frame. Block cannot be reliably anchored.");
                continue;
            }

            const topFrameLineInFile = block.type === 'addition' ? block.topFrame.newLineNumber : block.topFrame.oldLineNumber;
            let actualBlockStartInFile = -1; // 0-based index for fileLines

            // Search for the top frame's content to anchor the block
            for (let i = Math.max(0, topFrameLineInFile - 5); i < Math.min(fileLines.length, topFrameLineInFile + 5); i++) {
                 if (fileLines[i]?.trim() === block.topFrame.content.trim()) {
                    const expectedTopFrameIndex = (block.type === 'addition' ? block.topFrame.newLineNumber : block.topFrame.oldLineNumber) -1;
                    if (i === expectedTopFrameIndex) {
                        if (block.bottomFrame) {
                            const expectedBottomFrameIndex = i + 1 + block.changes.length; // Line after top frame + number of changes
                            // The line number for bottomFrame in the patch is relative to its position *after* the block's changes.
                            const expectedBottomFrameLineInFile = (block.type === 'addition' ? block.bottomFrame.newLineNumber : block.bottomFrame.oldLineNumber) -1;

                            if (expectedBottomFrameIndex < fileLines.length &&
                                fileLines[expectedBottomFrameIndex]?.trim() === block.bottomFrame.content.trim() &&
                                expectedBottomFrameIndex === expectedBottomFrameLineInFile // Also check if the bottom frame is at its expected line
                                ) {
                                actualBlockStartInFile = i + 1; // Content starts on the line after top frame
                                break;
                            } else {
                                console.warn(`Warning: Top frame matched at line ${i+1}, but bottom frame did not match or was misplaced. Expected bottom at ${expectedBottomFrameLineInFile +1}, found context at ${expectedBottomFrameIndex +1}. Block update skipped.`);
                                actualBlockStartInFile = -1;
                                break;
                            }
                        } else { // No bottom frame in the patch block
                            actualBlockStartInFile = i + 1;
                            break;
                        }
                    }
                }
            }


            if (actualBlockStartInFile !== -1) {
                const hunk = patch.hunks[block.hunkIndex];
                let firstChangeInHunkIndex = -1;

                // Find the starting index of this block's changes within the Hunk's original changes array.
                // This relies on block.startLineNumber being correctly calculated by identifyModificationBlocks.
                let tempOldLine = hunk.oldStart;
                let tempNewLine = hunk.newStart;

                for(let hunkChangeIndex = 0; hunkChangeIndex < hunk.changes.length; hunkChangeIndex++) {
                    const currentHunkChange = hunk.changes[hunkChangeIndex];
                    const isAdditionBlock = block.type === 'addition';
                    const isDeletionBlock = block.type === 'deletion';

                    // Check if current position matches the start of the block
                    if ((isAdditionBlock && currentHunkChange.type === '+' && tempNewLine === block.startLineNumber) ||
                        (isDeletionBlock && currentHunkChange.type === '-' && tempOldLine === block.startLineNumber)) {

                        // Potential start. Verify if the sequence of changes matches.
                        let sequenceMatches = true;
                        for(let k=0; k < block.changes.length; k++) {
                            if (hunkChangeIndex + k >= hunk.changes.length ||
                                hunk.changes[hunkChangeIndex+k].type !== block.changes[k].type ||
                                hunk.changes[hunkChangeIndex+k].content !== block.changes[k].content // Original content must match
                                ) {
                                sequenceMatches = false;
                                break;
                            }
                        }
                        if (sequenceMatches) {
                            firstChangeInHunkIndex = hunkChangeIndex;
                            break;
                        }
                    }

                    // Advance line counters based on the type of the current hunk change
                    if (currentHunkChange.type === ' ') {
                        tempOldLine++; tempNewLine++;
                    } else if (currentHunkChange.type === '-') {
                        tempOldLine++;
                    } else if (currentHunkChange.type === '+') {
                        tempNewLine++;
                    }
                }


                if (firstChangeInHunkIndex !== -1) {
                    for (let i = 0; i < block.changes.length; i++) {
                        const changeToUpdateInHunk = hunk.changes[firstChangeInHunkIndex + i];
                        const correspondingFileLineIndex = actualBlockStartInFile + i;

                        if (correspondingFileLineIndex < fileLines.length) {
                            changeToUpdateInHunk.content = fileLines[correspondingFileLineIndex];
                        } else {
                            console.warn(`Warning: Target file content ended before block of type '${block.type}' could be fully updated. Hunk ${block.hunkIndex}.`);
                            break;
                        }
                    }
                } else {
                     console.warn(`Warning: Could not find matching start of block in hunk for update. Hunk ${block.hunkIndex}. Start line: ${block.startLineNumber}, Type: ${block.type}. This may indicate an issue with startLineNumber calculation or block identification.`);
                }
            } else {
                console.warn(`Warning: Could not find block's starting position in the target file based on its top frame. Top frame content from patch: "${block.topFrame.content.trim()}". Block update skipped. Hunk ${block.hunkIndex}.`);
            }
        }
    }


    /**
     * Reconstructs the patch file content from an array of Patch objects.
     * @param patches An array of Patch objects.
     * @returns A string representing the content of a patch file.
     */
    public reconstructPatch(patches: Patch[]): string {
        let patchContent = '';
        for (const patch of patches) {
            patchContent += `--- ${patch.oldFile}\n`;
            patchContent += `+++ ${patch.newFile || '/dev/null'}\n`; // Use /dev/null if newFile is null (deletion)

            for (const hunk of patch.hunks) {
                patchContent += `@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@\n`;
                for (const change of hunk.changes) {
                    patchContent += `${change.type}${change.content}\n`;
                }
            }
        }
        return patchContent;
    }

    /**
     * Saves the provided patch content to a file, creating a backup of the original file if it exists.
     * @param patchPath The path where the patch file should be saved.
     * @param patchContent The string content of the patch to save.
     * @throws Error if there is an issue saving the patch file or creating the backup.
     */
    public savePatch(patchPath: string, patchContent: string): void {
        const backupPath = patchPath + '.backup';
        try {
            if (fs.existsSync(patchPath)) {
                fs.copyFileSync(patchPath, backupPath);
                console.log(`Backup of original patch saved to: ${backupPath}`);
            }
            fs.writeFileSync(patchPath, patchContent);
            console.log(`Updated patch saved to: ${patchPath}`);
        } catch (error: any) {
            throw new Error(`Error saving patch ${patchPath}: ${error.message}`);
        }
    }

    /**
     * Verifies the integrity of context frames in a patch file against a target file.
     * If all frames are intact, it attempts to update the content of the modification blocks
     * in the patch based on the current content of the target file.
     *
     * This is the main public method intended for use by CLI commands like `--upgrade`.
     *
     * @async
     * @param patchPath The path to the .patch file to verify and potentially upgrade.
     * @param targetFilePathOverride Optional. If provided, this path will be used as the target file
     *                               for verification, overriding the file path derived from the patch itself.
     * @returns A Promise that resolves to an array of VerificationResult objects, one for each
     *          patch processed from the input patch file.
     */
    public async verifyIntegrityAndUpgrade(patchPath: string, targetFilePathOverride?: string): Promise<VerificationResult[]> {
        const parsedPatches = this.readPatch(patchPath);
        const results: VerificationResult[] = [];

        for (const singlePatch of parsedPatches) {
            let filePath = targetFilePathOverride;
            if (!filePath) {
                // Determine file path from patch (e.g., strip 'a/' or 'b/')
                filePath = singlePatch.oldFile.startsWith('a/') ? singlePatch.oldFile.substring(2) : singlePatch.oldFile;
                if ((!filePath || filePath === '/dev/null') && singlePatch.newFile && singlePatch.newFile !== '/dev/null') {
                     filePath = singlePatch.newFile.startsWith('b/') ? singlePatch.newFile.substring(2) : singlePatch.newFile;
                }
            }

            if (!filePath || filePath === '/dev/null') {
                 results.push({
                    file: singlePatch.oldFile || singlePatch.newFile || "Unknown file (from patch)",
                    status: 'error',
                    message: 'Could not determine target file path from patch for verification.'
                });
                continue;
            }

            if (!fs.existsSync(filePath)) {
                results.push({
                    file: filePath,
                    status: 'error',
                    message: `Target file not found: ${filePath}`
                });
                continue;
            }

            const fileContent = fs.readFileSync(filePath, 'utf8');
            const fileLines = fileContent.split('\n');
            const modificationBlocks = this.identifyModificationBlocks(singlePatch);

            if (modificationBlocks.length === 0) {
                results.push({
                    file: filePath,
                    status: 'intact', // Or 'info' if preferred for no blocks
                    message: 'No homogeneous modification blocks found to verify or upgrade.',
                    blocks: []
                });
                continue;
            }

            const blockChecks: BlockCheck[] = [];
            let allFramesIntact = true;

            for (const block of modificationBlocks) {
                const topFrameCheck = this.checkFrame(fileLines, block.topFrame, 'top', block);
                const bottomFrameCheck = this.checkFrame(fileLines, block.bottomFrame, 'bottom', block);

                blockChecks.push({
                    blockType: block.type,
                    topFrame: topFrameCheck,
                    bottomFrame: bottomFrameCheck
                });

                if (!topFrameCheck.intact || !bottomFrameCheck.intact) {
                    allFramesIntact = false;
                }
            }

            const resultEntry: VerificationResult = {
                file: filePath,
                status: allFramesIntact ? 'intact' : 'corrupted',
                message: allFramesIntact ? 'All frames are intact.' : 'Some frames are modified or not found. Patch not updated.',
                blocks: blockChecks,
                updated: false
            };
            results.push(resultEntry);

            if (allFramesIntact && modificationBlocks.length > 0) {
                console.log(`Frames are intact for ${filePath}. Attempting to upgrade patch content...`);
                this.updatePatchBlocks(singlePatch, modificationBlocks, fileLines);
                resultEntry.updated = true;
                resultEntry.message = 'All frames are intact. Patch content has been updated from the target file.';
            }
        }

        const anyUpdates = results.some(result => result.updated);
        if (anyUpdates) {
            const updatedPatchContent = this.reconstructPatch(parsedPatches);
            this.savePatch(patchPath, updatedPatchContent);
            console.log('Patch file has been successfully updated with new content.');
        }

        return results;
    }

    /**
     * Checks a single context frame's integrity against the lines of a target file.
     * @param fileLines An array of strings representing the lines of the target file.
     * @param frame The Frame object to check. If null, the frame is considered intact (as it's not present).
     * @param position A string indicating whether this is the 'top' or 'bottom' frame, for messaging.
     * @param block The ModificationBlock to which this frame belongs. Used to determine expected line numbers.
     * @returns A FrameCheckResult object detailing whether the frame is intact and why.
     */
    private checkFrame(fileLines: string[], frame: Frame | null, position: 'top' | 'bottom', block: ModificationBlock): FrameCheckResult {
        if (!frame) {
            return {
                intact: true, // A non-existent frame doesn't break integrity for this check's purpose.
                message: `Frame ${position} not present in patch block definition.`,
                expected: null,
                actual: null
            };
        }

        let frameLineIndexInFile: number; // 0-based index in fileLines

        if (position === 'top') {
            // For top frame, its line number in the patch (old or new context) is its expected position.
            frameLineIndexInFile = (block.type === 'addition' ? frame.newLineNumber : frame.oldLineNumber) - 1;
        } else { // bottom frame
            // For bottom frame, its line number in the patch (old or new context) is its expected position.
            frameLineIndexInFile = (block.type === 'addition' ? frame.newLineNumber : frame.oldLineNumber) - 1;
        }


        if (frameLineIndexInFile < 0 || frameLineIndexInFile >= fileLines.length) {
            return {
                intact: false,
                message: `Frame ${position} expected line number ${frameLineIndexInFile + 1} (0-indexed: ${frameLineIndexInFile}) is outside file boundaries (0-${fileLines.length - 1}).`,
                expected: frame.content,
                actual: null,
                lineNumber: frameLineIndexInFile + 1
            };
        }

        const actualContent = fileLines[frameLineIndexInFile];
        // Trim whitespace for comparison robustness, as patch context lines might have different whitespace than file lines.
        const intact = actualContent?.trim() === frame.content.trim();

        return {
            intact: intact,
            message: intact ? `Frame ${position} is intact at line ${frameLineIndexInFile + 1}.` : `Frame ${position} content mismatch at line ${frameLineIndexInFile + 1}.`,
            expected: frame.content,
            actual: actualContent,
            lineNumber: frameLineIndexInFile + 1
        };
    }

    /**
     * Generates a human-readable report string from an array of verification results.
     * @param results An array of VerificationResult objects.
     * @returns A string formatted as a report.
     */
    public generateReport(results: VerificationResult[]): string {
        let report = '=== FRAME INTEGRITY VERIFICATION REPORT ===\n\n';

        for (const result of results) {
            report += `File: ${result.file}\n`;
            report += `Status: ${result.status.toUpperCase()}`;
            if (result.updated) {
                report += ' (PATCH UPDATED)';
            }
            report += '\n';
            report += `Message: ${result.message}\n`;

            if (result.blocks && result.blocks.length > 0) {
                report += `\n  Modification Blocks Checked: ${result.blocks.length}\n`;
                result.blocks.forEach((blockCheck, index) => {
                    report += `\n    Block ${index + 1} (${blockCheck.blockType}):\n`;
                    report += `      Top Frame: ${blockCheck.topFrame.intact ? 'INTACT' : 'MODIFIED/MISSING'}`;
                    if (blockCheck.topFrame.lineNumber) {
                        report += ` (Expected at line ${blockCheck.topFrame.lineNumber})`;
                    }
                    report += '\n';
                    if (!blockCheck.topFrame.intact && blockCheck.topFrame.expected !== null) {
                        report += `        Expected: "${blockCheck.topFrame.expected}"\n`;
                        report += `        Actual:   "${blockCheck.topFrame.actual}"\n`;
                    } else if (!blockCheck.topFrame.intact && blockCheck.topFrame.message && blockCheck.topFrame.expected === null) { // Message when expected is null (e.g. out of bounds)
                        report += `        Message: ${blockCheck.topFrame.message}\n`;
                    }

                    report += `      Bottom Frame: ${blockCheck.bottomFrame.intact ? 'INTACT' : 'MODIFIED/MISSING'}`;
                    if (blockCheck.bottomFrame.lineNumber) {
                        report += ` (Expected at line ${blockCheck.bottomFrame.lineNumber})`;
                    }
                    report += '\n';
                    if (!blockCheck.bottomFrame.intact && blockCheck.bottomFrame.expected !== null) {
                        report += `        Expected: "${blockCheck.bottomFrame.expected}"\n`;
                        report += `        Actual:   "${blockCheck.bottomFrame.actual}"\n`;
                    } else if (!blockCheck.bottomFrame.intact && blockCheck.bottomFrame.message && blockCheck.bottomFrame.expected === null) {
                        report += `        Message: ${blockCheck.bottomFrame.message}\n`;
                    }
                });
            }
            report += '\n' + '='.repeat(50) + '\n\n';
        }
        return report;
    }
}
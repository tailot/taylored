import * as fs from 'fs';

interface Change {
  type: string;
  content: string;
  lineNumber: number; // This was in the original JS, though calculateLineNumber was not fully implemented
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  changes: Change[];
  context: any[]; // Original JS had this, seems unused, keeping for now
}

interface Patch {
  oldFile: string;
  newFile: string | null;
  hunks: Hunk[];
}

interface Frame {
  content: string;
  oldLineNumber: number;
  newLineNumber: number;
}

interface ModificationBlock {
  type: 'addition' | 'deletion';
  changes: Change[];
  topFrame: Frame | null;
  bottomFrame: Frame | null;
  hunkIndex: number;
  startLineNumber: number; // Line number in the file where the block starts
}

interface FrameCheckResult {
  intact: boolean;
  message: string;
  expected: string | null;
  actual: string | null;
  lineNumber?: number;
}

interface BlockCheck {
  blockType: 'addition' | 'deletion';
  topFrame: FrameCheckResult;
  bottomFrame: FrameCheckResult;
}

interface VerificationResult {
  file: string;
  status: 'intact' | 'corrupted' | 'error';
  message: string;
  blocks?: BlockCheck[];
  updated?: boolean;
}

export class PatchAnalyzer {
  /**
   * Constructs a new PatchAnalyzer instance.
   */
  constructor() {
    // Patches are processed one by one, so no need for this.patches array at class level for now
  }

  /**
   * Reads and parses a patch file
   */
  public readPatch(patchPath: string): Patch[] {
    try {
      const patchContent = fs.readFileSync(patchPath, 'utf8');
      return this.parsePatch(patchContent);
    } catch (error: any) {
      throw new Error(
        `Error reading patch file ${patchPath}: ${error.message}`,
      );
    }
  }

  /**
   * Parses the content of a patch
   */
  private parsePatch(patchContent: string): Patch[] {
    const lines = patchContent.split('\n'); // Corrected line split
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
          hunks: [],
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
          context: [], // context remains unused from original JS
        };
        if (currentPatch) {
          currentPatch.hunks.push(currentHunk);
        }
      } else if (
        currentHunk &&
        (line.startsWith(' ') || line.startsWith('+') || line.startsWith('-'))
      ) {
        const changeType = line.charAt(0);
        const content = line.substring(1);

        currentHunk.changes.push({
          type: changeType,
          content: content,
          // lineNumber calculation was placeholder in original, will be handled by actual line calculation
          lineNumber: 0,
        });
      }
    }

    if (currentPatch) {
      patches.push(currentPatch);
    }
    return patches;
  }

  /**
   * Parses the hunk header (e.g., @@ -1,4 +1,4 @@)
   */
  private parseHunkHeader(header: string): {
    oldStart: number;
    oldCount: number;
    newStart: number;
    newCount: number;
  } {
    const match = header.match(
      /@@\s*-(\d+)(?:,(\d+))?\s*\+(\d+)(?:,(\d+))?\s*@@/,
    ); // Corrected regex
    if (!match) {
      throw new Error(`Invalid hunk header: ${header}`);
    }
    const oldStart = parseInt(match[1], 10);
    const oldCountRaw = parseInt(match[2], 10);
    const newStart = parseInt(match[3], 10);
    const newCountRaw = parseInt(match[4], 10);

    return {
      oldStart: oldStart,
      oldCount: isNaN(oldCountRaw) ? 1 : oldCountRaw,
      newStart: newStart,
      newCount: isNaN(newCountRaw) ? 1 : newCountRaw,
    };
  }

  /**
   * Identifies modification blocks (sequences of only additions or only deletions)
   * and their surrounding context frames within a single patch object.
   * A block is considered homogeneous if it contains only '+' lines or only '-' lines.
   * Context lines (' ') delimit these blocks.
   */
  private identifyModificationBlocks(patch: Patch): ModificationBlock[] {
    const blocks: ModificationBlock[] = [];

    patch.hunks.forEach((hunk, hunkIndex) => {
      let currentBlock: ModificationBlock | null = null;
      // lastContextLine stores the most recent context line encountered,
      // which can become the topFrame for a new modification block.
      let lastContextLine: Frame | null = null;

      for (let i = 0; i < hunk.changes.length; i++) {
        const change = hunk.changes[i];

        if (change.type === ' ') {
          // Context line
          const currentOldLine = this.calculateActualLineNumber(hunk, i, 'old');
          const currentNewLine = this.calculateActualLineNumber(hunk, i, 'new');

          // If a modification block was being built, this context line is its bottomFrame.
          if (currentBlock && !currentBlock.bottomFrame) {
            currentBlock.bottomFrame = {
              content: change.content,
              oldLineNumber: currentOldLine,
              newLineNumber: currentNewLine,
            };
            blocks.push(currentBlock);
            currentBlock = null; // Reset for the next block
          }
          // Update lastContextLine for potential use as a topFrame for a subsequent block.
          lastContextLine = {
            content: change.content,
            oldLineNumber: currentOldLine,
            newLineNumber: currentNewLine,
          };
        } else if (change.type === '+' || change.type === '-') {
          // Modification line
          // Start a new block if one isn't active
          if (!currentBlock) {
            currentBlock = {
              type: change.type === '+' ? 'addition' : 'deletion',
              changes: [],
              topFrame: lastContextLine, // The preceding context line is the topFrame
              bottomFrame: null, // To be found
              hunkIndex: hunkIndex,
              // startLineNumber is the 1-based line number in the relevant file (old for deletions, new for additions)
              // where this block of changes begins.
              startLineNumber: this.calculateActualLineNumber(
                hunk,
                i,
                change.type === '+' ? 'new' : 'old',
              ),
            };
          }

          // Ensure block homogeneity (all additions or all deletions)
          const expectedType = currentBlock.type === 'addition' ? '+' : '-';
          if (change.type !== expectedType) {
            // Mixed block type encountered. Current approach is to warn and discard the current block.
            // This means the current change and subsequent changes in this mixed segment won't be part of an upgradeable block.
            console.warn(
              `Warning: Mixed modification block (e.g., additions interspersed with deletions without intermediate context) detected in hunk ${hunkIndex}. Current block processing stopped.`,
            );
            currentBlock = null;
            lastContextLine = null; // Reset context, as the continuity is broken for upgrade purposes.
            continue; // Skip this change, look for a new potential block start.
          }
          currentBlock.changes.push(change);
        }
      }

      // If a block is still open at the end of all changes in the hunk (e.g., patch ends with +/- lines),
      // it implies there's no bottom frame within this hunk.
      if (currentBlock) {
        blocks.push(currentBlock);
      }
    });
    return blocks;
  }

  /**
   * Calculates the 1-based line number for the change at `changeIndexInHunk` within the given `hunk`.
   * `lineType` specifies whether to return the line number in the 'old' or 'new' file context.
   * Hunk start numbers are 1-based.
   */
  private calculateActualLineNumber(
    hunk: Hunk,
    changeIndexInHunk: number,
    lineType: 'old' | 'new',
  ): number {
    let oldLineCounter = hunk.oldStart;
    let newLineCounter = hunk.newStart;

    // Iterate through changes *before* the target change to update counters
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
    // The counters now reflect the starting line number of the change at `changeIndexInHunk`.
    if (lineType === 'old') {
      // If change is an addition '+', it doesn't have an old line number per se,
      // but oldLineCounter represents the line in the old file *before* which this new content is conceptually inserted.
      return oldLineCounter;
    } else {
      // 'new'
      // If change is a deletion '-', it doesn't have a new line number per se,
      // but newLineCounter represents the line in the new file *after* which this old content was conceptually removed.
      return newLineCounter;
    }
  }

  /**
   * Updates the content of the blocks in the patch object based on fileLines from the target file.
   * Modifies the `patch` object directly. This is done only if all frames are intact.
   */
  private updatePatchBlocks(
    patch: Patch,
    blocks: ModificationBlock[],
    fileLines: string[],
  ): void {
    for (const block of blocks) {
      if (!block.topFrame) {
        console.warn(
          'Skipping block update due to missing top frame. Block cannot be reliably anchored.',
        );
        continue;
      }

      // Determine the 0-based index in `fileLines` where the content *of the block* should start.
      // This is the line immediately after the topFrame's corresponding line in the target file.
      const topFrameLineInFile =
        block.type === 'addition'
          ? block.topFrame.newLineNumber
          : block.topFrame.oldLineNumber;

      let actualBlockStartInFile = -1; // 0-based index for fileLines

      // Search for the top frame's content in the fileLines to anchor the block.
      // Start searching from around where the top frame is expected.
      // topFrameLineInFile is 1-based.
      for (
        let i = Math.max(0, topFrameLineInFile - 5);
        i < fileLines.length;
        i++
      ) {
        // Search a small window around expected
        if (fileLines[i]?.trim() === block.topFrame.content.trim()) {
          // Found potential top frame. Now verify its position relative to the original patch.
          // And if bottom frame exists, verify it too.
          const expectedTopFrameIndex =
            (block.type === 'addition'
              ? block.topFrame.newLineNumber
              : block.topFrame.oldLineNumber) - 1;

          if (i === expectedTopFrameIndex) {
            // Top frame is exactly where expected
            if (block.bottomFrame) {
              const expectedBottomFrameIndex = i + 1 + block.changes.length;
              if (
                expectedBottomFrameIndex < fileLines.length &&
                fileLines[expectedBottomFrameIndex]?.trim() ===
                  block.bottomFrame.content.trim()
              ) {
                actualBlockStartInFile = i + 1; // Content starts on the line after top frame
                break;
              } else {
                // Top frame matched at expected location, but bottom frame didn't.
                // This implies content between frames changed length or bottom frame itself changed.
                // For auto-upgrade, we require bottom frame to also be stable if present in patch.
                console.warn(
                  `Warning: Top frame matched at line ${i + 1}, but bottom frame did not match as expected. Block update skipped for safety.`,
                );
                actualBlockStartInFile = -1; // Reset, effectively skipping this block
                break;
              }
            } else {
              // No bottom frame in the patch block (e.g., patch modifies to end of file)
              actualBlockStartInFile = i + 1;
              break;
            }
          }
          // If top frame content found, but not at exact expected line, it's considered a misplacement.
          // The current logic in checkFrame would have already marked such a frame as not intact.
          // This loop is more of a sanity check or could be enhanced for smarter anchoring if needed.
        }
      }

      if (actualBlockStartInFile !== -1) {
        const hunk = patch.hunks[block.hunkIndex];

        // Find the starting index of this block's changes within the Hunk's original changes array.
        // This is essential because block.changes is a filtered list (only +/-).
        // We need to modify the original hunk.changes array.
        let firstChangeInHunkIndex = -1;
        let tempOldLine = hunk.oldStart;
        let tempNewLine = hunk.newStart;
        let changesMatched = 0;

        for (
          let hunkChangeIndex = 0;
          hunkChangeIndex < hunk.changes.length;
          hunkChangeIndex++
        ) {
          const currentHunkChange = hunk.changes[hunkChangeIndex];
          const currentBlockChange = block.changes[changesMatched];

          if (
            currentBlockChange &&
            currentHunkChange.type === currentBlockChange.type &&
            ((block.type === 'addition' &&
              tempNewLine === block.startLineNumber) ||
              (block.type === 'deletion' &&
                tempOldLine === block.startLineNumber))
          ) {
            // Potential start of the block. Verify if the sequence matches.
            let sequenceMatches = true;
            for (let k = 0; k < block.changes.length; k++) {
              if (
                hunkChangeIndex + k >= hunk.changes.length ||
                hunk.changes[hunkChangeIndex + k].type !==
                  block.changes[k].type ||
                hunk.changes[hunkChangeIndex + k].content !==
                  block.changes[k].content // Original content must match
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
            tempOldLine++;
            tempNewLine++;
          } else if (currentHunkChange.type === '-') {
            tempOldLine++;
          } else if (currentHunkChange.type === '+') {
            tempNewLine++;
          }
        }

        if (firstChangeInHunkIndex !== -1) {
          for (let i = 0; i < block.changes.length; i++) {
            const changeToUpdateInHunk =
              hunk.changes[firstChangeInHunkIndex + i];
            const correspondingFileLineIndex = actualBlockStartInFile + i;

            if (correspondingFileLineIndex < fileLines.length) {
              // Update the content of the line in the patch, keeping the original +/- type.
              changeToUpdateInHunk.content =
                fileLines[correspondingFileLineIndex];
            } else {
              console.warn(
                `Warning: Target file content ended before block of type '${block.type}' could be fully updated. Hunk ${block.hunkIndex}.`,
              );
              break;
            }
          }
        } else {
          console.warn(
            `Warning: Could not find matching start of block in hunk for update. Hunk ${block.hunkIndex}. This may indicate an issue with startLineNumber calculation or block identification.`,
          );
        }
      } else {
        // This case should ideally be prevented by prior frame checks.
        // If frames weren't intact, allFramesIntact would be false.
        console.warn(
          `Warning: Could not find block's starting position in the target file based on its top frame. Top frame content from patch: "${block.topFrame.content.trim()}". Block update skipped. Hunk ${block.hunkIndex}.`,
        );
      }
    }
  }

  /**
   * Reconstructs the patch content from parsed data.
   */
  public reconstructPatch(patches: Patch[]): string {
    let patchContent = '';
    for (const patch of patches) {
      patchContent += `--- ${patch.oldFile}\n`;
      patchContent += `+++ ${patch.newFile}\n`;

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
   * Saves the updated patch, creating a backup of the original.
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
   * Verifies frame integrity and optionally updates the patch.
   * This is the main public method to be called by the CLI.
   */
  public async verifyIntegrityAndUpgrade(
    patchPath: string,
    targetFilePathOverride?: string,
  ): Promise<VerificationResult[]> {
    const parsedPatches = this.readPatch(patchPath);
    const results: VerificationResult[] = [];

    for (const singlePatch of parsedPatches) {
      let filePath = targetFilePathOverride;
      if (!filePath) {
        filePath = singlePatch.oldFile.startsWith('a/')
          ? singlePatch.oldFile.substring(2)
          : singlePatch.oldFile;
        if ((!filePath || filePath === '/dev/null') && singlePatch.newFile) {
          filePath = singlePatch.newFile.startsWith('b/')
            ? singlePatch.newFile.substring(2)
            : singlePatch.newFile;
        }
      }

      if (!filePath || filePath === '/dev/null') {
        results.push({
          file:
            singlePatch.oldFile ||
            singlePatch.newFile ||
            'Unknown file (from patch)',
          status: 'error',
          message:
            'Could not determine target file path from patch for verification.',
        });
        continue;
      }

      // Heuristic to determine if the patch covers the entire file.
      let isEntireFilePatch = false;
      if (singlePatch.hunks.length === 1) {
        const hunk = singlePatch.hunks[0];
        const isFullFileAddition = hunk.oldStart === 0 && hunk.oldCount === 0;
        const isFullFileDeletion = hunk.newStart === 0 && hunk.newCount === 0;
        const isFullFileReplacement =
          hunk.oldStart > 0 &&
          hunk.newStart > 0 &&
          !hunk.changes.some((c) => c.type === ' ');

        if (isFullFileAddition || isFullFileDeletion || isFullFileReplacement) {
          isEntireFilePatch = true;
        }
      }

      // **INIZIO LOGICA AGGIORNATA PER FILE INTERI**
      if (isEntireFilePatch) {
        const hunk = singlePatch.hunks[0];
        const isFullAddition = hunk.oldStart === 0 && hunk.oldCount === 0;
        const isFullDeletion = hunk.newStart === 0 && hunk.newCount === 0;

        // Caso 1: Aggiunta di un file completo
        if (isFullAddition) {
          console.log(
            `Patch for '${filePath}' is a full file addition. Updating content from target file...`,
          );
          const newFileLines = fs.readFileSync(filePath, 'utf8').split('\n');
          hunk.changes = newFileLines.map((line) => ({
            type: '+' as const,
            content: line,
            lineNumber: 0,
          }));
          hunk.newCount = newFileLines.length;
          results.push({
            file: filePath,
            status: 'intact',
            message:
              'Full file patch content was updated from the target file.',
            updated: true,
          });
          continue;
        }

        // Caso 2: Eliminazione di un file completo
        if (isFullDeletion) {
          console.log(
            `Patch for '${filePath}' is a full file deletion. Checking if file exists...`,
          );
          if (!fs.existsSync(filePath)) {
            results.push({
              file: filePath,
              status: 'intact',
              message:
                'Full file deletion patch is valid (file does not exist). No update needed.',
              updated: false,
            });
          } else {
            results.push({
              file: filePath,
              status: 'corrupted',
              message:
                'Full file deletion patch is corrupted (file still exists). No update performed.',
              updated: false,
            });
          }
          continue;
        }

        // Caso 3: Sostituzione completa del file (nessuna riga di contesto)
        if (fs.existsSync(filePath)) {
          console.log(
            `Patch for '${filePath}' is a full file replacement. Updating content from target file...`,
          );
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const fileLines = fileContent.split('\n');
          const originalLinesCount = hunk.changes.filter(
            (c) => c.type === '-',
          ).length;

          hunk.changes = fileLines.map((line) => ({
            type: '+' as const,
            content: line,
            lineNumber: 0,
          }));

          hunk.oldStart = 1;
          hunk.oldCount = originalLinesCount;
          hunk.newStart = 1;
          hunk.newCount = fileLines.length;

          results.push({
            file: filePath,
            status: 'intact',
            message:
              'Full file replacement patch content was updated from the target file.',
            updated: true,
          });
        } else {
          results.push({
            file: filePath,
            status: 'error',
            message: `Target file not found for full file replacement: ${filePath}`,
            updated: false,
          });
        }
        continue;
      }
      // **FINE LOGICA AGGIORNATA PER FILE INTERI**

      if (!fs.existsSync(filePath)) {
        results.push({
          file: filePath,
          status: 'error',
          message: `Target file not found: ${filePath}`,
        });
        continue;
      }

      const fileContent = fs.readFileSync(filePath, 'utf8');
      const fileLines = fileContent.split('\n');
      const modificationBlocks = this.identifyModificationBlocks(singlePatch);

      if (modificationBlocks.length === 0) {
        results.push({
          file: filePath,
          status: 'intact',
          message:
            'No homogeneous modification blocks found to verify or upgrade.',
          blocks: [],
        });
        continue;
      }

      const blockChecks: BlockCheck[] = [];
      let allFramesIntact = true;

      for (const block of modificationBlocks) {
        const topFrameCheck = this.checkFrame(
          fileLines,
          block.topFrame,
          'top',
          block,
          isEntireFilePatch,
        );
        const bottomFrameCheck = this.checkFrame(
          fileLines,
          block.bottomFrame,
          'bottom',
          block,
          isEntireFilePatch,
        );

        blockChecks.push({
          blockType: block.type,
          topFrame: topFrameCheck,
          bottomFrame: bottomFrameCheck,
        });

        if (!topFrameCheck.intact || !bottomFrameCheck.intact) {
          allFramesIntact = false;
        }
      }

      results.push({
        file: filePath,
        status: allFramesIntact ? 'intact' : 'corrupted',
        message: allFramesIntact
          ? 'All frames are intact.'
          : 'Some frames are modified or not found. Patch not updated.',
        blocks: blockChecks,
        updated: false,
      });

      if (allFramesIntact && modificationBlocks.length > 0) {
        console.log(
          `Frames are intact for ${filePath}. Attempting to upgrade patch content...`,
        );
        this.updatePatchBlocks(singlePatch, modificationBlocks, fileLines);
        const lastResult = results[results.length - 1];
        if (lastResult) {
          lastResult.updated = true;
          lastResult.message =
            'All frames are intact. Patch content has been updated from the target file.';
        }
      }
    }

    const anyUpdates = results.some((result) => result.updated);
    if (anyUpdates) {
      const updatedPatchContent = this.reconstructPatch(parsedPatches);
      this.savePatch(patchPath, updatedPatchContent);
      console.log('Patch file has been successfully updated with new content.');
    }

    return results;
  }

  /**
   * Checks a single frame's integrity against the provided fileLines.
   * block.startLineNumber is 1-based.
   * frame.oldLineNumber/newLineNumber are 1-based from patch.
   */
  private checkFrame(
    fileLines: string[],
    frame: Frame | null,
    position: 'top' | 'bottom',
    block: ModificationBlock,
    isEntireFilePatch: boolean,
  ): FrameCheckResult {
    if (!frame) {
      // A missing frame is now considered valid for any patch, not just full-file patches.
      // This handles cases where a patch applies to the very start or end of a file.
      return {
        intact: true,
        message: `Frame ${position} not present, which is valid for patches at file boundaries.`,
        expected: null,
        actual: null,
      };
    }

    // Determine the 0-based line index in `fileLines` where this frame's content is expected.
    let frameLineIndexInFile: number;

    if (position === 'top') {
      // topFrame is the line *before* the block's first change.
      // Its line number in the patch (frame.oldLineNumber or frame.newLineNumber)
      // should correspond to its position in the current fileLines.
      frameLineIndexInFile =
        (block.type === 'addition'
          ? frame.newLineNumber
          : frame.oldLineNumber) - 1;
    } else {
      // bottom frame
      // bottomFrame is the line *after* the block's last change.
      frameLineIndexInFile =
        (block.type === 'addition'
          ? frame.newLineNumber
          : frame.oldLineNumber) - 1;
    }

    if (frameLineIndexInFile < 0 || frameLineIndexInFile >= fileLines.length) {
      return {
        intact: false,
        message: `Frame ${position} expected line number ${frameLineIndexInFile + 1} (0-indexed: ${frameLineIndexInFile}) is outside file boundaries (0-${fileLines.length - 1}).`,
        expected: frame.content,
        actual: null,
        lineNumber: frameLineIndexInFile + 1,
      };
    }

    const actualContent = fileLines[frameLineIndexInFile];
    const intact = actualContent?.trim() === frame.content.trim(); // Trim whitespace for comparison robustness

    return {
      intact: intact,
      message: intact
        ? `Frame ${position} is intact at line ${frameLineIndexInFile + 1}.`
        : `Frame ${position} content mismatch at line ${frameLineIndexInFile + 1}.`,
      expected: frame.content,
      actual: actualContent,
      lineNumber: frameLineIndexInFile + 1,
    };
  }

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
          if (
            !blockCheck.topFrame.intact &&
            blockCheck.topFrame.expected !== null
          ) {
            report += `        Expected: "${blockCheck.topFrame.expected}"\n`;
            report += `        Actual:   "${blockCheck.topFrame.actual}"\n`;
          } else if (!blockCheck.topFrame.intact) {
            report += `        Message: ${blockCheck.topFrame.message}\n`;
          }

          report += `      Bottom Frame: ${blockCheck.bottomFrame.intact ? 'INTACT' : 'MODIFIED/MISSING'}`;
          if (blockCheck.bottomFrame.lineNumber) {
            report += ` (Expected at line ${blockCheck.bottomFrame.lineNumber})`;
          }
          report += '\n';
          if (
            !blockCheck.bottomFrame.intact &&
            blockCheck.bottomFrame.expected !== null
          ) {
            report += `        Expected: "${blockCheck.bottomFrame.expected}"\n`;
            report += `        Actual:   "${blockCheck.bottomFrame.actual}"\n`;
          } else if (!blockCheck.bottomFrame.intact) {
            report += `        Message: ${blockCheck.bottomFrame.message}\n`;
          }
        });
      }
      report += '\n' + '='.repeat(50) + '\n\n';
    }
    return report;
  }
}

// lib/git-patch-upgrader.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import { TAYLORED_DIR_NAME } from '../constants';
import { parsePatchHunks, Hunk } from '../utils'; // Assicurati che Hunk sia esportato da utils
import { createPatch } from 'diff';

/**
 * Funzione di upgrade riprogettata per supportare multi-hunk.
 * Aggiorna una patch se e solo se il contesto ("cornice") di tutte le modifiche è rimasto invariato.
 * @param patchFileName Il nome del file .taylored da aggiornare.
 * @param repoRoot La directory principale del repository.
 * @returns Un oggetto che indica il successo e un messaggio per l'utente.
 */
export async function upgradePatch(
    patchFileName: string,
    repoRoot: string,
): Promise<{ upgraded: boolean; message: string }> {

    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);

    if (!await fs.pathExists(absolutePatchFilePath)) {
        throw new Error(`File patch non trovato: ${absolutePatchFilePath}`);
    }

    const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
    const hunks = parsePatchHunks(originalPatchContent);

    if (hunks.length === 0) {
        return { upgraded: false, message: `La patch '${patchFileName}' non contiene modifiche e non può essere aggiornata.` };
    }

    const diffHeaderMatch = originalPatchContent.match(/diff --git a\/(.+?) b\/(.+?)\n/);
    if (!diffHeaderMatch) {
        throw new Error("Impossibile analizzare l'header del file dalla patch per determinare il file di destinazione.");
    }

    const targetFileName = diffHeaderMatch[1]; // Group 1 is the original file name
    const targetFilePath = path.join(repoRoot, targetFileName);

    if (!await fs.pathExists(targetFilePath)) {
        throw new Error(`File di destinazione non trovato: ${targetFilePath}`);
    }

    const currentFileContent = await fs.readFile(targetFilePath, 'utf-8');
    const currentFileLines = currentFileContent.split('\n');

    // --- Verifica della "Cornice" per TUTTI gli Hunk ---
    for (const hunk of hunks) {
        // We need to find the actual start line of the context in the current file.
        // hunk.oldStart is the start line in the *original* file the patch was made against.
        // The `originalHunkContent` contains lines starting with ' ', '-', '+'.
        // Context lines start with ' '.
        // Deleted lines start with '-'.
        // Added lines start with '+'.

        const hunkContentLines = hunk.originalHunkContent.split('\n');
        let currentFileSearchIndex = hunk.oldStart - 1; // Initial guess for where hunk applies in current file
        let hunkLineIndex = 0;

        let firstContextLineFoundInHunk = false;
        let contextMatchFailed = false;

        // Scan through the hunk lines to find the first context line and verify it
        for (hunkLineIndex = 0; hunkLineIndex < hunkContentLines.length; hunkLineIndex++) {
            const line = hunkContentLines[hunkLineIndex];
            if (line.startsWith(' ')) { // Context line
                firstContextLineFoundInHunk = true;
                const expectedLineContent = line.substring(1);
                // Adjust search index if we skipped '-' lines
                let effectiveCurrentFileIndex = currentFileSearchIndex;

                // Attempt to find this context block in the current file, starting near hunk.oldStart
                // This is a simplified approach; robustly finding the correct anchor point
                // if the file has shifted significantly can be complex.
                // The provided logic assumes `oldStart` is still a good anchor.

                let matchFound = false;
                // Search a small window around the expected location if direct match fails.
                // This is a heuristic. A more robust solution might involve fuzzy matching or aligning sequences.
                // For now, let's stick to the provided logic which is stricter.
                // The original spec's logic was:
                // const actualLineIndex = hunk.oldStart - 1 + contextLineOffset;
                // currentFileLines[actualLineIndex] !== expectedLineContent
                // This implies a fixed context. Let's refine based on that.

                // The core idea: the context lines from the patch must match exactly at the
                // location derived from hunk.oldStart in the current file.

                // Let's re-evaluate the loop for context verification based on the spec's intent.
                // The spec implies that the context lines specified in the patch (lines starting with ' ')
                // must still exist at the *exact same relative positions* in the current file
                // as they were in the original file that the patch was made against, adjusted by hunk.oldStart.

                break; // Found first context line, proceed to structured verification.
            } else if (line.startsWith('-')) {
                // This line was deleted, so it contributes to the offset in the old file.
                // It doesn't need to be present in the current file for frame verification.
                // currentFileSearchIndex++; // No, this is wrong. This line doesn't exist in the "new" file state of the patch.
            } else if (line.startsWith('+')) {
                // This line was added. It's not part of the "before" context.
            }
        }

        if (!firstContextLineFoundInHunk && !hunkContentLines.some(l => l.startsWith('-') || l.startsWith('+'))) {
            // Hunk with no changes, only context. This can happen.
            // We still need to verify this context.
        } else if (!firstContextLineFoundInHunk && hunkContentLines.some(l => l.startsWith('-') || l.startsWith('+'))) {
            // This implies a patch hunk that adds/removes at the very beginning or end of a file without surrounding context lines in the hunk itself.
            // The diff utility usually adds context. If not, this specific check might need refinement or the assumption is diff always provides context.
            // For now, if there are changes, we expect context lines from `diff`.
        }


        // Stricter context verification based on the spec's description:
        // "le righe di codice immediatamente prima e dopo il blocco devono essere ancora presenti e identiche nel file di destinazione attuale."
        // This implies checking the context lines from the hunk against currentFileLines using hunk.oldStart as the anchor.

        let contextLinesVerified = 0;
        let fileOffset = 0; // Offset into currentFileLines, anchored by hunk.oldStart

        for (const hunkLine of hunkContentLines) {
            if (hunkLine.startsWith(' ')) { // Context line
                const expectedContent = hunkLine.substring(1);
                const actualFileIndex = (hunk.oldStart - 1) + fileOffset;

                if (actualFileIndex < 0 || actualFileIndex >= currentFileLines.length || currentFileLines[actualFileIndex] !== expectedContent) {
                    return {
                        upgraded: false,
                        message: `Aggiornamento annullato: il contesto della patch è cambiato. Riga ${actualFileIndex + 1} (attorno al blocco che iniziava alla riga ${hunk.oldStart} del file originale). Previsto: "${expectedContent}", Trovato: "${currentFileLines[actualFileIndex]}"`
                    };
                }
                contextLinesVerified++;
                fileOffset++;
            } else if (hunkLine.startsWith('-')) {
                // This line was in the "old" file version of the patch. It counts towards fileOffset for subsequent context lines.
                fileOffset++;
            } else if (hunkLine.startsWith('+')) {
                // This line is an addition, doesn't affect old file's line count for context verification.
                // It *does* affect the new file's line count for patch application.
            }
        }
        // If a hunk contains *only* additions or *only* deletions without any ' ' context lines,
        // this loop might not run `contextLinesVerified++`. The spec implies "cornice" exists.
        // `diff` usually adds context. If a hunk is pure add/del at file start/end,
        // the "cornice" might be implicit (file start/end).
        // The current loop correctly verifies explicit context lines.
    }

    // --- Verifica Contenuto Diverso ---
    // The problem description: "L'aggiornamento avverrà solo se il contenuto del file
    // all'interno di almeno una di queste "cornici" è effettivamente cambiato"
    // This means we need to construct what the file would look like *with the original patch applied*
    // and compare that to the current file content within those framed sections.
    // However, the provided solution code *reconstructs the old file content* and then diffs it
    // with the current file content to make the new patch. If this new patch is different
    // from the original, it means the content changed. This implicitly covers the "contenuto diverso" check.

    // --- Generazione della Nuova Patch ---
    // 1. Ricostruisci come sarebbe stato il file *prima* delle modifiche della patch originale
    //    This means effectively "reverting" the original patch from the current file content,
    //    but only using the deletion parts of the original patch and keeping the context.
    //    The spec's provided code for this part is:
    let oldFileContentReconstructedLines = [...currentFileLines];
    for (const hunk of [...hunks].reverse()) { // Iterate hunks in reverse for splice
        const hunkLines = hunk.originalHunkContent.split('\n');
        const linesToAddFromPatch = hunkLines.filter(l => l.startsWith('-')).map(l => l.substring(1));
        const linesToRemoveBasedOnPatchAdditions = hunkLines.filter(l => l.startsWith('+')).length;

        // Determine the starting point in currentFileLines to apply these changes.
        // This needs to be the line *after* the context that precedes the changes in this hunk.
        // hunk.newStart refers to the start line in the *patched* version according to original patch.
        // hunk.oldStart refers to the start line in the *original unpatched* version.

        // We need to find where the hunk's changes *would have started* in the current file,
        // assuming the context is still valid.
        let spliceStartIndex = -1;
        let currentSearchOffset = 0; // relative to hunk.oldStart -1
        let linesInHunkBeforeChange = 0; // context lines before first +/-

        for(const line of hunkLines){
            if(line.startsWith(' ')){
                linesInHunkBeforeChange++;
            } else if (line.startsWith('-') || line.startsWith('+')){
                break;
            }
        }
        spliceStartIndex = (hunk.oldStart -1) + linesInHunkBeforeChange;

        // Now, `spliceStartIndex` is the index in `currentFileLines` where the original patch's
        // additions would have begun, or deletions would have been applied.
        // To reconstruct the "old file", we remove what the patch added, and add back what the patch deleted.
        oldFileContentReconstructedLines.splice(spliceStartIndex, linesToRemoveBasedOnPatchAdditions, ...linesToAddFromPatch);
    }
    const oldFileContentReconstructed = oldFileContentReconstructedLines.join('\n');

    // 2. Crea la nuova patch confrontando la versione "originale pre-patch" ricostruita con quella attuale
    // The `createPatch` function expects: fileName, oldString, newString, oldHeader, newHeader
    // The oldHeader and newHeader can be used for timestamps or other metadata in the patch.
    const newPatch = createPatch(targetFileName, oldFileContentReconstructed, currentFileContent, '', '', { context: 3 });

    // Controlla se la nuova patch è identica alla vecchia (ignorando l'header 'index' che può cambiare)
    // and also ignoring potential differences in line endings if not careful with .join('\n') vs original.
    const cleanOriginalPatch = originalPatchContent.replace(/^index .*\n?/m, '').replace(/\r\n/g, '\n').trim();
    const cleanNewPatch = newPatch.replace(/^index .*\n?/m, '').replace(/\r\n/g, '\n').trim();

    if (cleanOriginalPatch === cleanNewPatch) {
        return { upgraded: false, message: `La patch '${patchFileName}' è già aggiornata o le modifiche interne non giustificano un upgrade secondo la logica attuale. Nessuna modifica necessaria.` };
    }

    // If we reached here, all conditions are met. Write the new patch.
    await fs.writeFile(absolutePatchFilePath, newPatch);
    return { upgraded: true, message: `Patch '${patchFileName}' aggiornata con successo con le nuove modifiche.` };
}

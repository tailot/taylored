// lib/git-patch-upgrader.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import { exec } from 'child_process';
import * as util from 'util';
import { TAYLORED_DIR_NAME } from './constants';
import { parsePatchHunks, Hunk } from './utils';
import { createPatch } from 'diff';

const execAsync = util.promisify(exec);

// Helper per eseguire comandi git in modo sicuro
async function execGit(repoRoot: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    const command = `git ${args.join(' ')}`;
    try {
        const { stdout, stderr } = await execAsync(command, { cwd: repoRoot });
        return { stdout: stdout.trim(), stderr: stderr.trim() };
    } catch (error: any) {
        throw new Error(`Error executing git command: ${command}\n${error.stderr || error.message}`);
    }
}

export async function upgradePatch(
    patchFileName: string,
    repoRoot: string,
    branchName?: string
): Promise<{ upgraded: boolean; message: string }> {
    const absolutePatchFilePath = path.join(repoRoot, TAYLORED_DIR_NAME, patchFileName);
    if (!await fs.pathExists(absolutePatchFilePath)) {
        throw new Error(`File patch non trovato: ${absolutePatchFilePath}`);
    }

    const originalPatchContent = await fs.readFile(absolutePatchFilePath, 'utf-8');
    const hunks = parsePatchHunks(originalPatchContent);

    if (hunks.length === 0) {
        return { upgraded: false, message: `La patch '${patchFileName}' è vuota.` };
    }

    const diffHeaderMatch = originalPatchContent.match(/diff --git a\/(.+?) b\/(.+?)\n/);
    if (!diffHeaderMatch) {
        const oldFileMatch = originalPatchContent.match(/^--- a\/(.+?)\n/m);
        const newFileMatch = originalPatchContent.match(/^\+\+\+ b\/(.+?)\n/m);
        if (!(oldFileMatch && newFileMatch && oldFileMatch[1] === newFileMatch[1])) {
            throw new Error("Impossibile analizzare l'header della patch per determinare il nome del file di destinazione.");
        }
    }
    const targetFileName = diffHeaderMatch ? diffHeaderMatch[1] : (originalPatchContent.match(/^--- a\/(.+?)\n/m)![1]);

    let currentFileContent: string;

    if (branchName) {
        try {
            const gitTargetFileName = targetFileName.startsWith('/') ? targetFileName.substring(1) : targetFileName;
            const result = await execGit(repoRoot, ['show', `${branchName}:${gitTargetFileName}`]);
            currentFileContent = result.stdout;
        } catch (error) {
            throw new Error(`Impossibile trovare il file '${targetFileName}' nel branch '${branchName}'. Error: ${error}`);
        }
    } else {
        const targetFilePath = path.join(repoRoot, targetFileName);
        if (!await fs.pathExists(targetFilePath)) {
            throw new Error(`File di destinazione '${targetFileName}' non trovato nel workspace: ${targetFilePath}`);
        }
        currentFileContent = await fs.readFile(targetFilePath, 'utf-8');
    }

    const currentFileLines = currentFileContent.split('\n');
    let atLeastOneHunkIsObsolete = false;
    let finalPatchContent = '';

    const originalLines = originalPatchContent.split('\n');
    let fileHeader = '';
    let lastIndexProcessed = 0;

    // Estrai l'header del file diff (tutto fino al primo '@@')
    const firstHunkHeaderIndex = originalLines.findIndex(line => line.startsWith('@@'));
    if (firstHunkHeaderIndex !== -1) {
        fileHeader = originalLines.slice(0, firstHunkHeaderIndex).join('\n') + '\n';
        lastIndexProcessed = firstHunkHeaderIndex;
    } else {
        // Se non ci sono hunks, restituisci il contenuto originale
        return { upgraded: false, message: `La patch '${patchFileName}' non contiene blocchi di modifica validi.` };
    }

    finalPatchContent += fileHeader;

    for (const hunk of hunks) {
        // Ricostruisci il contenuto originale SOLO per questo hunk
        const oldHunkContentLines = hunk.lines
            .filter(line => line.startsWith(' ') || line.startsWith('-'))
            .map(line => line.substring(1));

        // Prendi il contenuto attuale del file nella posizione in cui l'hunk dovrebbe essere applicato
        // Nota: hunk.oldStart si riferisce alle linee del file *originale*, non di quello nuovo.
        // Dobbiamo trovare il punto di applicazione nel file *attuale*.
        // Un approccio più semplice è usare il contenuto modificato dall'hunk originale.
        const newHunkContentFromOriginalPatch = hunk.lines
            .filter(line => line.startsWith(' ') || line.startsWith('+'))
            .map(line => line.substring(1));

        // Ora confrontiamo il contenuto che la patch *voleva* creare
        // con il contenuto che esiste *ora* in quella sezione del file.
        // Questo è complesso. Semplifichiamo: ricalcoliamo il diff tra il vecchio stato (dalla patch) e il nuovo stato (dal file).
        const oldFileSection = oldHunkContentLines.join('\n');
        
        // Estrai la sezione corrispondente dal file attuale.
        // La posizione di partenza è hunk.oldStart - 1.
        // La lunghezza è hunk.oldLines.
        const currentFileSectionLines = currentFileLines.slice(hunk.oldStart - 1, hunk.oldStart - 1 + hunk.oldLines);
        const currentFileSection = currentFileSectionLines.join('\n');
        
        // Creiamo una nuova patch solo per questa sezione
        const newHunkPatch = createPatch(
            targetFileName,
            oldFileSection,
            currentFileSection,
            hunk.originalHeaderLine, // Manteniamo gli header per coerenza
            hunk.originalHeaderLine.replace(/-\d+(,\d+)?/, `+${hunk.newStart}`), // Tentativo di aggiornare il nuovo header
            { context: 3 } // Numero di righe di contesto
        );

        // Estraiamo solo il corpo dell'hunk dalla nuova patch generata
        const newHunkLines = newHunkPatch.split('\n');
        const newHunkBodyIndex = newHunkLines.findIndex(line => line.startsWith('@@'));
        
        if (newHunkBodyIndex !== -1) {
            const newHunkBody = newHunkLines.slice(newHunkBodyIndex).join('\n');
            if (hunk.lines.join('\n') !== newHunkBody) {
                atLeastOneHunkIsObsolete = true;
            }
            finalPatchContent += newHunkBody + '\n';
        }
    }
    
    // Rimuoviamo eventuali newline doppi alla fine
    finalPatchContent = finalPatchContent.trimEnd() + '\n';


    if (!atLeastOneHunkIsObsolete) {
        // In questo caso, potremmo comunque avere una formattazione diversa. Confrontiamo il contenuto normalizzato.
        const originalNormalized = originalPatchContent.replace(/\r\n/g, '\n').trim();
        const finalNormalized = finalPatchContent.replace(/\r\n/g, '\n').trim();
        if (originalNormalized === finalNormalized) {
            return { upgraded: false, message: `La patch '${patchFileName}' è già aggiornata.` };
        }
    }

    await fs.writeFile(absolutePatchFilePath, finalPatchContent);
    return { upgraded: true, message: `Patch '${patchFileName}' aggiornata con successo.` };
}
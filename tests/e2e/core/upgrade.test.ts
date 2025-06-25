import * as fs from 'fs-extra';
import * as path from 'path';
import {
    initializeTestEnvironment,
    cleanupTestEnvironment,
    resetToInitialState,
    TAYLORED_CMD_BASE,
    execOptions,
    TAYLORED_DIR_FULL_PATH
} from './setup';
import { execSync } from 'child_process';

describe('Core CLI Tests - --upgrade', () => {

    beforeAll(async () => {
        await initializeTestEnvironment();
    });

    afterAll(async () => {
        await cleanupTestEnvironment();
    });

    beforeEach(async () => {
        // Pulisce ma non ricrea la patch di default
        await resetToInitialState(true); 
    });

    /**
     * Helper function to create a test scenario.
     * 1. Creates a package.json with dependencies a, b, c.
     * 2. Creates and saves a patch that removes dependency 'b'.
     * @returns The name of the created patch file.
     */
    const createInitialDepsPatch = async () => {
        const pkgPath = path.join(execOptions.cwd!.toString(), 'package.json');
        const initialContent = { dependencies: { "a": "1", "b": "2", "c": "3" } };
        await fs.writeJson(pkgPath, initialContent, { spaces: 2 });
        execSync('git add . && git commit -m "initial deps"', execOptions);

        const modifiedContent = { dependencies: { "a": "1", "c": "3" } };
        execSync('git checkout -b temp-del-b', execOptions);
        await fs.writeJson(pkgPath, modifiedContent, { spaces: 2 });
        execSync('git add . && git commit -m "remove b"', execOptions);
        execSync('git checkout main', execOptions);

        execSync(`${TAYLORED_CMD_BASE} --save temp-del-b`, execOptions);
        execSync('git branch -D temp-del-b', execOptions);
        return 'temp-del-b.taylored';
    };

    test('should upgrade a pure deletion patch when content changes but structure is identical', async () => {
        const patchName = await createInitialDepsPatch();
        const patchPath = path.join(TAYLORED_DIR_FULL_PATH, patchName);
        const originalPatchContent = await fs.readFile(patchPath, 'utf-8');
        expect(originalPatchContent).toContain('-    "b": "2"');


        // Evolve the main branch, changing the line that the patch targets
        const pkgPath = path.join(execOptions.cwd!.toString(), 'package.json');
        const evolvedContent = { dependencies: { "a": "1", "b": "2-evolved", "c": "3" } };
        await fs.writeJson(pkgPath, evolvedContent, { spaces: 2 });
        execSync('git add . && git commit -m "evolve dep b"', execOptions);

        // Run upgrade
        const output = execSync(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`, execOptions).toString();
        expect(output).toContain("successfully upgraded");

        // Check the new content of the patch file
        const newPatchContent = await fs.readFile(patchPath, 'utf-8');
        expect(newPatchContent).not.toEqual(originalPatchContent);
        expect(newPatchContent).toContain('-    "b": "2-evolved"');
        expect(newPatchContent).not.toContain('-    "b": "2"');
    });

    test('should NOT upgrade a patch if it would result in a structural change (hunk count)', async () => {
        const patchName = await createInitialDepsPatch();
        const patchPath = path.join(TAYLORED_DIR_FULL_PATH, patchName);
        const originalPatchContent = await fs.readFile(patchPath, 'utf-8');

        // Evolve main branch by adding a line between the context lines, which splits the hunk
        const pkgPath = path.join(execOptions.cwd!.toString(), 'package.json');
        const pkgContent = await fs.readFile(pkgPath, 'utf-8');
        const newPkgContent = pkgContent.replace('"b": "2",', '"b": "2",\n    "b-extra": "new",');
        await fs.writeFile(pkgPath, newPkgContent);
        execSync('git add . && git commit -m "add another dep near b"', execOptions);
        
        const output = execSync(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`, execOptions).toString();
        expect(output).toContain("Patch not upgraded: Number of hunks changed");

        // Ensure the original patch was not modified
        const finalPatchContent = await fs.readFile(patchPath, 'utf-8');
        expect(finalPatchContent).toEqual(originalPatchContent);
    });
    
    test('should report that the patch is up-to-date if no changes are detected', async () => {
        const patchName = await createInitialDepsPatch();
        
        // Run upgrade without any changes to the codebase
        const output = execSync(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`, execOptions).toString();
        expect(output).toContain("is already up-to-date");
    });

    // Helper function to capture stdout and stderr for commands
    const runCommandAndCapture = (command: string): { stdout: string; stderr: string } => {
        let stdout = '';
        let stderr = '';
        try {
            stdout = execSync(command, execOptions).toString();
        } catch (error: any) {
            // If execSync throws, it's usually because of a non-zero exit code.
            // The error object often contains stdout and stderr.
            stdout = error.stdout?.toString() || stdout;
            stderr = error.stderr?.toString() || stderr;
            // We might not want to re-throw here if the test is expecting an error (e.g. checking stderr)
            // For now, let's assume tests will check stderr if they expect failure.
        }
        return { stdout, stderr };
    };

    // SCENARIO 3: SUCCESSO CON MULTI-HUNK
    test('should correctly upgrade a multi-hunk patch', async () => {
        if (!execOptions.cwd) throw new Error("CWD non definito");
        const CWD = execOptions.cwd.toString();
        const scriptPath = path.join(CWD, 'script.js');
        const patchName = 'multi-hunk-update.taylored';
        const patchPath = path.join(TAYLORED_DIR_FULL_PATH, patchName);

        // 1. Setup con un file che verrà modificato in due punti distinti
        const initialContent = [
            '// Header',
            'function partOne() {',
            '  console.log("Original Part 1");',
            '}',
            '// Middle section',
            'function partTwo() {',
            '  console.log("Original Part 2");',
            '}',
            '// Footer'
        ].join('\n');
        await fs.writeFile(scriptPath, initialContent);
        execSync('git add . && git commit -m "initial script for multi-hunk"', execOptions);

        execSync('git checkout -b temp-multi-hunk', execOptions);
        const patchTargetContent = [
            '// Header',
            'function partOne() {',
            '  console.log("Updated Part 1");', // Modifica 1
            '}',
            '// Middle section',
            'function partTwo() {',
            '  console.log("Updated Part 2");', // Modifica 2
            '}',
            '// Footer'
        ].join('\n');
        await fs.writeFile(scriptPath, patchTargetContent);
        execSync('git add . && git commit -m "update both parts for multi-hunk patch"', execOptions);

        execSync('git checkout main', execOptions); // Assuming 'main' is the default branch
        execSync(`${TAYLORED_CMD_BASE} --save temp-multi-hunk`, execOptions);
        // Ensure the saved patch is named correctly for the test
        const savedPatchOriginalName = 'temp-multi-hunk.taylored';
        await fs.rename(path.join(TAYLORED_DIR_FULL_PATH, savedPatchOriginalName), patchPath);
        execSync('git branch -D temp-multi-hunk', execOptions);

        // 2. Evoluzione del file sorgente, modificando solo il contenuto interno
        const evolvedContent = [
            '// Header',
            'function partOne() {',
            '  console.log("Final Part 1");', // Nuova modifica 1
            '}',
            '// Middle section',
            'function partTwo() {',
            '  console.log("Final Part 2");', // Nuova modifica 2
            '}',
            '// Footer'
        ].join('\n');
        await fs.writeFile(scriptPath, evolvedContent);
        execSync('git add . && git commit -m "evolve both parts of multi-hunk script"', execOptions);

        // 3. Esecuzione del comando --upgrade
        const { stdout, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`);

        // 4. Verifica dei risultati
        expect(stderr).toBe('');
        // The success message from the new upgrader is slightly different
        expect(stdout).toContain(`Patch '${patchName}' aggiornata con successo`);

        const upgradedPatchContent = await fs.readFile(patchPath, 'utf-8');
        // La nuova patch deve contenere entrambe le modifiche finali
        // It should show the change from the *original* "Original Part X" to "Final Part X"
        // because the upgrade logic reconstructs the file *before the original patch*
        // and diffs that against the current "Final Part X" state.

        // The original patch was "Original" -> "Updated"
        // The file evolved to "Final"
        // The new patch should be "Original" -> "Final"

        expect(upgradedPatchContent).toContain('-  console.log("Original Part 1");');
        expect(upgradedPatchContent).toContain('+  console.log("Final Part 1");');
        expect(upgradedPatchContent).toContain('-  console.log("Original Part 2");');
        expect(upgradedPatchContent).toContain('+  console.log("Final Part 2");');

        // It should NOT contain "Updated Part X" anymore if the upgrade is correct.
        expect(upgradedPatchContent).not.toContain("Updated Part 1");
        expect(upgradedPatchContent).not.toContain("Updated Part 2");
    });

    test('should NOT upgrade a patch if it is not pure', async () => {
        // Create a mixed patch (not pure)
        // This test might be invalid for the new logic, as "purity" is not a primary concern of the new upgrader.
        // The new upgrader cares about context frame and content change.
        // However, the new upgrader's code does not explicitly check for isPure anymore.
        // Let's keep the test for now, but if it fails, it might be because the concept of "pure" is no longer enforced by --upgrade.
        // The new code will likely throw an error or return `upgraded: false` for other reasons if a mixed patch doesn't fit the frame logic.
        const pkgPath = path.join(execOptions.cwd!.toString(), 'package.json');
        await fs.writeJson(pkgPath, { dependencies: { "a": "1" } }, { spaces: 2 });
        execSync('git add . && git commit -m "base for mixed in upgrade test"', execOptions);
        execSync('git checkout -b mixed-patch', execOptions);
        await fs.writeJson(pkgPath, { dependencies: { "a": "2", "b": "new" } }, { spaces: 2 }); // a changed, b added
        execSync('git add . && git commit -m "mixed changes"', execOptions);
        execSync('git checkout main', execOptions);
        execSync(`${TAYLORED_CMD_BASE} --save mixed-patch`, execOptions);
        execSync('git branch -D mixed-patch', execOptions);
        
        const output = execSync(`${TAYLORED_CMD_BASE} --upgrade mixed-patch`, execOptions).toString();
        expect(output).toContain("is not pure (contains mixed additions and deletions) and cannot be upgraded");
    });
});

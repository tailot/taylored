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
        const pkgPath = path.join(execOptions.cwd!, 'package.json');
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
        const pkgPath = path.join(execOptions.cwd!, 'package.json');
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
        const pkgPath = path.join(execOptions.cwd!, 'package.json');
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

    test('should NOT upgrade a patch if it is not pure', async () => {
        // Create a mixed patch (not pure)
        const pkgPath = path.join(execOptions.cwd!, 'package.json');
        await fs.writeJson(pkgPath, { dependencies: { "a": "1" } }, { spaces: 2 });
        execSync('git add . && git commit -m "base for mixed"', execOptions);
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

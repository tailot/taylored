// tests/e2e/core/upgrade.test.ts
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

/**
 * Helper function to run a command and capture its output, including errors.
 * This prevents the test from crashing on non-zero exit codes.
 * @param command The command to execute.
 * @returns An object with stdout and stderr.
 */
const runCommandAndCapture = (command: string) => {
    try {
        const stdout = execSync(command, execOptions).toString();
        return { stdout, stderr: '' };
    } catch (error: any) {
        return {
            stdout: error.stdout?.toString() || '',
            stderr: error.stderr?.toString() || '',
        };
    }
};


describe('Core CLI Tests - Upgrade', () => {

    beforeAll(async () => {
        await initializeTestEnvironment();
    });

    afterAll(async () => {
        await cleanupTestEnvironment();
    });

    beforeEach(async () => {
        await resetToInitialState(true); // Cleans up but does not recreate the default patch
    });

    // --- Test section for package.json (original, now corrected) ---
    describe('Upgrade on package.json', () => {
        const createInitialDepsPatch = async () => {
            if (!execOptions.cwd) {
                throw new Error("Test setup failed: execOptions.cwd is not defined.");
            }
            const cwd = execOptions.cwd.toString();
            const pkgPath = path.join(cwd, 'package.json');
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
        
        // CORRECTION: The test now verifies that the command fails correctly due to a merge conflict
        test('should fail gracefully when git apply --3way results in conflicts', async () => {
            const patchName = await createInitialDepsPatch();
            const patchPath = path.join(TAYLORED_DIR_FULL_PATH, patchName);
            const originalPatchContent = await fs.readFile(patchPath, 'utf-8');

            // Fai evolvere il branch `main`
            if (!execOptions.cwd) {
                throw new Error("Test setup failed: execOptions.cwd is not defined.");
            }
            const cwd = execOptions.cwd.toString();
            const pkgPath = path.join(cwd, 'package.json');
            const evolvedContent = { dependencies: { "a": "1", "b": "2-evolved", "c": "3" } };
            await fs.writeJson(pkgPath, evolvedContent, { spaces: 2 });
            execSync('git add . && git commit -m "evolve dep b"', execOptions);

            // Run the upgrade and capture the output
            const { stdout, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`);
            
            // Verify that the command fails with the specific conflict error
            expect(stderr).toContain("CRITICAL ERROR: Failed to process upgrade");
            expect(stderr).toContain("Applied patch to 'package.json' with conflicts");

            // Verify that the original patch has not been modified
            const newPatchContent = await fs.readFile(patchPath, 'utf-8');
            expect(newPatchContent).toEqual(originalPatchContent);
        });

        test('should fail gracefully on conflict before checking hunk structure', async () => {
            const patchName = await createInitialDepsPatch();

            // Fai evolvere `main` aggiungendo una riga che rompe l'hunk singolo
            if (!execOptions.cwd) {
                throw new Error("Test setup failed: execOptions.cwd is not defined.");
            }
            const cwd = execOptions.cwd.toString();
            const pkgPath = path.join(cwd, 'package.json');
            const evolvedContent = { dependencies: { "a": "1", "b": "2", "b-extra": "new", "c": "3" } };
            await fs.writeJson(pkgPath, evolvedContent, { spaces: 2 });
            execSync('git add . && git commit -m "add another dep near b"', execOptions);

            const { stdout, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`); 

            expect(stderr).toContain("CRITICAL ERROR: Failed to process upgrade");
            expect(stderr).toContain("Applied patch to 'package.json' with conflicts");
        });
    });

    // --- Test section for multi-line code file (now corrected) ---
    describe('Upgrade on multi-line source file', () => {
        const SRC_FILE_NAME = 'src/utils.js';
        const PATCH_BRANCH_NAME = 'add-helper-two';
        const PATCH_FILE_NAME = `${PATCH_BRANCH_NAME}.taylored`;

        const createSourceFileAndPatch = async () => {
            if (!execOptions.cwd) {
                throw new Error("Test setup failed: execOptions.cwd is not defined.");
            }
            const CWD = execOptions.cwd.toString();
            const srcDirPath = path.join(CWD, 'src');
            await fs.ensureDir(srcDirPath);
            const srcFilePath = path.join(srcDirPath, 'utils.js');

            const initialContent = [
                'function helperOne() {',
                '  console.log("Helper one");',
                '}',
                '',
                'function helperThree() {',
                '  console.log("Helper three");',
                '}',
            ].join('\n');
            await fs.writeFile(srcFilePath, initialContent);
            execSync('git add . && git commit -m "feat: add initial utils"', execOptions);
            const initialCommit = execSync('git rev-parse HEAD', execOptions).toString().trim();

            execSync(`git checkout -b ${PATCH_BRANCH_NAME} ${initialCommit}`, execOptions);
            const featureContent = [
                'function helperOne() {',
                '  console.log("Helper one");',
                '}',
                '',
                'function helperTwo() {',
                '  console.log("This is the new helper two");',
                '}',
                '',
                'function helperThree() {',
                '  console.log("Helper three");',
                '}',
            ].join('\n');
            await fs.writeFile(srcFilePath, featureContent);
            execSync(`git add . && git commit -m "feat: add helperTwo"`, execOptions);

            execSync(`git checkout main`, execOptions);
            execSync(`${TAYLORED_CMD_BASE} --save ${PATCH_BRANCH_NAME}`, execOptions);
            execSync(`git branch -D ${PATCH_BRANCH_NAME}`, execOptions);
        };

        test('should correctly upgrade a pure addition patch on a source file', async () => {
            await createSourceFileAndPatch();
            const patchPath = path.join(TAYLORED_DIR_FULL_PATH, PATCH_FILE_NAME);
            const originalPatchContent = await fs.readFile(patchPath, 'utf-8');

            if (!execOptions.cwd) {
                throw new Error("Test setup failed: execOptions.cwd is not defined.");
            }
            const CWD = execOptions.cwd.toString();
            const srcFilePath = path.join(CWD, SRC_FILE_NAME);
            const currentContent = await fs.readFile(srcFilePath, 'utf-8');
            const evolvedContent = [
                '// Preamble comment line 1',
                '// Preamble comment line 2',
                '',
                currentContent,
            ].join('\n');
            await fs.writeFile(srcFilePath, evolvedContent);
            execSync('git add . && git commit -m "refactor: add preamble to utils.js"', execOptions);

            // Run the --upgrade command
            const output = execSync(`${TAYLORED_CMD_BASE} --upgrade ${PATCH_FILE_NAME}`, execOptions).toString();
            expect(output).toContain("successfully upgraded");

            // Verify the new patch
            const newPatchContent = await fs.readFile(patchPath, 'utf-8');
            expect(newPatchContent).not.toEqual(originalPatchContent);
            
            expect(newPatchContent).toMatch(/@@ -5,.* \+5,.* @@/);

            // Verify that the updated patch applies correctly
            execSync(`${TAYLORED_CMD_BASE} --add ${PATCH_FILE_NAME}`, execOptions);
            const finalFileContent = await fs.readFile(srcFilePath, 'utf-8');
            expect(finalFileContent).toContain('// Preamble comment line 1');
            expect(finalFileContent).toContain('function helperTwo()');
        });
    });
});

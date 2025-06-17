import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
    initializeTestEnvironment,
    cleanupTestEnvironment,
    resetToInitialState,
    applyDeletionsPatch,
    normalizeLineEndings,
    TAYLORED_CMD_BASE,
    execOptions,
    PLUGIN_DELETIONS_NAME,
    PLUGIN_DELETIONS_NO_EXT,
    INITIAL_FILE1_CONTENT,
    TEST_DIR_FULL_PATH,
    TAYLORED_DIR_FULL_PATH,
    initialCommitHash, // Needed for additions branch setup
} from './setup';

describe('Core CLI Tests - Remove', () => {
    beforeAll(async () => {
        await initializeTestEnvironment();
    });

    afterAll(async () => {
        await cleanupTestEnvironment();
    });

    // beforeEach for general resets is handled in specific describe blocks if needed,
    // or relies on the main reset from initializeTestEnvironment for the first test.

    describe('taylored --remove (deletions patch)', () => {
        beforeEach(async () => {
            await resetToInitialState();
            applyDeletionsPatch(); // Apply the patch so we can test removing it
        });

        test('removes patch (with .taylored extension)', () => {
            execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NAME}`, execOptions);
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(
                normalizeLineEndings(INITIAL_FILE1_CONTENT)
            );
            expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
        });
        test('removes patch (without .taylored extension)', () => {
            execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NO_EXT}`, execOptions);
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(
                normalizeLineEndings(INITIAL_FILE1_CONTENT)
            );
            expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
        });
    });

    describe('Additions Patch Tests (--remove)', () => {
        const BRANCH_ADDITIONS_RM = 'additions-branch-rm'; // Use a different branch name to avoid conflicts if tests run in parallel or have setup issues
        const PLUGIN_ADDITIONS_RM_NAME = `${BRANCH_ADDITIONS_RM}.taylored`;
        const PLUGIN_ADDITIONS_RM_NO_EXT = BRANCH_ADDITIONS_RM;
        const PLUGIN_ADDITIONS_RM_FULL_PATH = path.join(TAYLORED_DIR_FULL_PATH, PLUGIN_ADDITIONS_RM_NAME);
        let NEW_FILE_CONTENT_RM: string;

        const createAdditionsPatchContentRm = () => `diff --git a/new_file_rm.txt b/new_file_rm.txt
new file mode 100644
index 0000000..abcdef0
--- /dev/null
+++ b/new_file_rm.txt
@@ -0,0 +1,1 @@
+A new line for the new_file_rm.txt
+`;
        // Note: Using new_file_rm.txt to avoid conflict with add.test.ts

        beforeAll(async () => {
            // This beforeAll is specific to this describe block.
            NEW_FILE_CONTENT_RM = 'A new line for the new_file_rm.txt\n';
            execSync(`git checkout -b ${BRANCH_ADDITIONS_RM} ${initialCommitHash}`, execOptions);
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'new_file_rm.txt'), NEW_FILE_CONTENT_RM);
            execSync('git add new_file_rm.txt', execOptions);
            execSync('git commit -m "Create new_file_rm.txt for additions branch rm tests"', execOptions);
            execSync('git checkout main', execOptions);
        });

        beforeEach(async () => {
            await resetToInitialState(); // Resets to main, clears files
            // Manually create the additions patch file for these tests
            if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
                fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
            }
            fs.writeFileSync(PLUGIN_ADDITIONS_RM_FULL_PATH, createAdditionsPatchContentRm());
            if (!fs.existsSync(PLUGIN_ADDITIONS_RM_FULL_PATH)) {
                throw new Error(
                    `Additions RM suite specific beforeEach failed to create ${PLUGIN_ADDITIONS_RM_FULL_PATH}`
                );
            }
            // Apply the patch so we can test removing it
            execSync(`${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_RM_NAME}`, execOptions);
            expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file_rm.txt'))).toBe(true); // Verify it was added
        });

        afterAll(() => {
            try {
                execSync(`git branch -D ${BRANCH_ADDITIONS_RM}`, execOptions);
            } catch (e) {
                console.warn(`Warning: Could not clean up ${BRANCH_ADDITIONS_RM}. ${(e as any).message}`);
            }
        });

        test('removes additions patch (with extension)', () => {
            execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_ADDITIONS_RM_NAME}`, execOptions);
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(
                normalizeLineEndings(INITIAL_FILE1_CONTENT)
            );
            expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file_rm.txt'))).toBe(false);
        });

        test('removes additions patch (without extension)', () => {
            execSync(`${TAYLORED_CMD_BASE} --remove ${PLUGIN_ADDITIONS_RM_NO_EXT}`, execOptions);
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(
                normalizeLineEndings(INITIAL_FILE1_CONTENT)
            );
            expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file_rm.txt'))).toBe(false);
        });
    });

    describe('Idempotent Remove Test', () => {
        beforeEach(async () => {
            await resetToInitialState(); // Ensure patch is NOT applied
        });

        test('taylored --remove when patch not applied (deletions patch)', () => {
            let commandOutput = '';
            try {
                // This command should fail because the patch is not applied, and git apply will error.
                commandOutput = execSync(
                    `${TAYLORED_CMD_BASE} --remove ${PLUGIN_DELETIONS_NAME}`,
                    execOptions
                ).toString();
            } catch (error) {
                // Capture stdout/stderr from the error object
                commandOutput = ((error as any).stdout?.toString() || '') + ((error as any).stderr?.toString() || '');
            }
            // Check that files are still in their initial state
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(
                normalizeLineEndings(INITIAL_FILE1_CONTENT)
            );
            expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt'))).toBe(true);
            // Check for the specific error message (or part of it)
            expect(commandOutput.toLowerCase()).toContain(
                "critical error: 'git apply' failed during --remove operation"
            );
        });
    });
});

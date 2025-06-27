import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
    initializeTestEnvironment,
    cleanupTestEnvironment,
    resetToInitialState,
    normalizeLineEndings,
    TAYLORED_CMD_BASE,
    execOptions,
    TEST_DIR_FULL_PATH,
    TAYLORED_DIR_FULL_PATH,
    initialCommitHash
} from './setup';
import { parsePatchHunks } from '../../../lib/git-patch-offset-updater';

describe('Offset Functionality Tests', () => {
    // This top-level beforeAll and afterAll will manage the overall test environment
    beforeAll(async () => {
        await initializeTestEnvironment();
    });

    afterAll(async () => {
        await cleanupTestEnvironment();
    });

    // Initial content for offset test files
    const OFFSET_INITIAL_CONTENT = [
        "Line 1: Initial context",
        "Line 2: Target for deletion/modification",
        "Line 3: More context",
        "Line 4: Even more context",
        "Line 5: Final context line"
    ].join('\n') + '\n'; // Assicura un newline finale

    const PREPEND_CONTENT = "Prepended Line 1\nPrepended Line 2\n";

    describe('Offset - Deletions Patch (Simulated Step 11 from original description)', () => {
        const OFFSET_DEL_FILE = "offset_del_file.txt";
        const OFFSET_DEL_BRANCH_S11 = "offset-del-branch-s11";
        const OFFSET_DEL_PLUGIN_NAME_S11 = `${OFFSET_DEL_BRANCH_S11}.taylored`;
        const OFFSET_DEL_PLUGIN_FULL_PATH_S11 = path.join(TAYLORED_DIR_FULL_PATH, OFFSET_DEL_PLUGIN_NAME_S11);
        let mainCommitForS11Patch: string;
        let storedOffsetDelPluginS11Content: string;
        let mainModifiedContentS11: string;

        beforeEach(async () => {
            // Reset to a clean state, skip re-saving the main deletions patch from global setup
            await resetToInitialState(true);

            // 1. Create initial file and commit (base for this test suite)
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), OFFSET_INITIAL_CONTENT);
            execSync(`git add ${OFFSET_DEL_FILE}`, execOptions);
            execSync('git commit -m "Initial commit for S11 offset test"', execOptions);
            mainCommitForS11Patch = execSync('git rev-parse HEAD', execOptions).toString().trim();

            // 2. Create branch, make deletion, save patch
            execSync(`git checkout -b ${OFFSET_DEL_BRANCH_S11} ${mainCommitForS11Patch}`, execOptions);
            const s11DeletedContent = OFFSET_INITIAL_CONTENT.replace("Line 2: Target for deletion/modification\n", "");
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), s11DeletedContent);
            execSync(`git add ${OFFSET_DEL_FILE}`, execOptions);
            execSync('git commit -m "Delete line for S11 patch"', execOptions);

            execSync(`git checkout main`, execOptions); // Back to main
            execSync(`git reset --hard ${mainCommitForS11Patch}`, execOptions); // Ensure main is at the base commit for this test

            execSync(`${TAYLORED_CMD_BASE} --save ${OFFSET_DEL_BRANCH_S11}`, execOptions);
            // Commit the newly saved patch file itself to avoid it being cleaned up by subsequent git commands within this beforeEach
            execSync(`git add ${TAYLORED_DIR_FULL_PATH}`, execOptions);
            execSync('git commit -m "chore: save S11 offset patch for testing"', execOptions);
            expect(fs.existsSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11)).toBe(true);
            storedOffsetDelPluginS11Content = fs.readFileSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11, 'utf8');

            // 3. Modify file on main to introduce offset
            mainModifiedContentS11 = PREPEND_CONTENT + OFFSET_INITIAL_CONTENT;
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), mainModifiedContentS11);
            execSync(`git add ${OFFSET_DEL_FILE}`, execOptions);
            execSync('git commit -m "Prepend lines on main to cause offset for S11"', execOptions);
        });

        afterEach(() => { // Changed from afterAll to afterEach for better isolation
            execSync('git checkout main', execOptions); // Ensure on main before branch deletion
            try {
                execSync(`git branch -D ${OFFSET_DEL_BRANCH_S11}`, execOptions);
            } catch (e) { /* ignore if branch not found */ }
        });

        test('taylored --offset for deletions patch fails as expected', () => {
            let stderr = "";
            let failed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_DEL_PLUGIN_NAME_S11}`, execOptions);
            } catch (error) {
                failed = true;
                stderr = (error as any).stderr?.toString() || "";
            }
            expect(failed).toBe(true); // Taylored currently does not support offset for deletions
            expect(stderr.toLowerCase()).toMatch(/obsolete|could not be processed|patch does not apply|offset failed|failed to apply/);
            // Ensure original patch file is unchanged
            expect(normalizeLineEndings(fs.readFileSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11, 'utf8'))).toBe(normalizeLineEndings(storedOffsetDelPluginS11Content));
            // Ensure file on disk is unchanged by the failed offset attempt
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), 'utf8'))).toBe(normalizeLineEndings(mainModifiedContentS11));
        });
    });

    describe('Offset - Additions Patch (Simulated Step 12 from original description)', () => {
        const OFFSET_ADD_FILE_S12 = "offset_add_file.txt";
        const OFFSET_ADD_BRANCH_S12 = "offset-add-branch-s12";
        const OFFSET_ADD_PLUGIN_NAME_S12 = `${OFFSET_ADD_BRANCH_S12}.taylored`;
        const OFFSET_ADD_PLUGIN_FULL_PATH_S12 = path.join(TAYLORED_DIR_FULL_PATH, OFFSET_ADD_PLUGIN_NAME_S12);
        let mainCommitForS12Patch: string;
        let storedOffsetAddPluginS12Content: string;
        let mainModifiedContentS12: string;

        beforeEach(async () => {
            await resetToInitialState(true);

            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), OFFSET_INITIAL_CONTENT);
            execSync(`git add ${OFFSET_ADD_FILE_S12}`, execOptions);
            execSync('git commit -m "Initial commit for S12 offset test"', execOptions);
            mainCommitForS12Patch = execSync('git rev-parse HEAD', execOptions).toString().trim();

            execSync(`git checkout -b ${OFFSET_ADD_BRANCH_S12} ${mainCommitForS12Patch}`, execOptions);
            const s12AddedContent = OFFSET_INITIAL_CONTENT.replace("Line 2: Target for deletion/modification", "Line 2: Target for deletion/modification\nLine 2.5: Newly added line for S12 patch");
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), s12AddedContent);
            execSync(`git add ${OFFSET_ADD_FILE_S12}`, execOptions);
            execSync('git commit -m "Add line for S12 patch"', execOptions);

            execSync(`git checkout main`, execOptions);
            execSync(`git reset --hard ${mainCommitForS12Patch}`, execOptions);

            execSync(`${TAYLORED_CMD_BASE} --save ${OFFSET_ADD_BRANCH_S12}`, execOptions);
            execSync(`git add ${TAYLORED_DIR_FULL_PATH}`, execOptions);
            execSync('git commit -m "chore: save S12 offset patch for testing"', execOptions);
            expect(fs.existsSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12)).toBe(true);
            storedOffsetAddPluginS12Content = fs.readFileSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12, 'utf8');

            mainModifiedContentS12 = PREPEND_CONTENT + OFFSET_INITIAL_CONTENT;
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), mainModifiedContentS12);
            execSync(`git add ${OFFSET_ADD_FILE_S12}`, execOptions);
            execSync('git commit -m "Prepend lines on main to cause offset for S12"', execOptions);
        });

        afterEach(() => {
            execSync('git checkout main', execOptions);
            try {
                execSync(`git branch -D ${OFFSET_ADD_BRANCH_S12}`, execOptions);
            } catch (e) { /* ignore */ }
        });

        test('taylored --offset for additions patch fails as expected', () => {
            let stderr = "";
            let failed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_ADD_PLUGIN_NAME_S12}`, execOptions);
            } catch (error) {
                failed = true;
                stderr = (error as any).stderr?.toString() || "";
            }
            expect(failed).toBe(true);
            expect(stderr.toLowerCase()).toMatch(/obsolete|could not be processed|patch does not apply|offset failed|failed to apply/);
            expect(normalizeLineEndings(fs.readFileSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12, 'utf8'))).toBe(normalizeLineEndings(storedOffsetAddPluginS12Content));
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), 'utf8'))).toBe(normalizeLineEndings(mainModifiedContentS12));
        });
    });

    describe('Offset - Successful Update', () => {
        const OFFSET_SUCCESS_FILE = "offset_success_file.txt";
        const TEMP_BRANCH = "temp-offset-branch";
        const PATCH_TO_OFFSET = "patch-to-offset";
        const PATCH_NAME = `${PATCH_TO_OFFSET}.taylored`;
        const PATCH_FULL_PATH = path.join(TAYLORED_DIR_FULL_PATH, PATCH_NAME);

        beforeEach(async () => {
            await resetToInitialState(true);

            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_SUCCESS_FILE), OFFSET_INITIAL_CONTENT);
            execSync(`git add ${OFFSET_SUCCESS_FILE}`, execOptions);
            execSync('git commit -m "Initial commit for offset success test"', execOptions);

            execSync(`git checkout -b ${TEMP_BRANCH}`, execOptions);
            const modifiedContent = OFFSET_INITIAL_CONTENT + "Line 6: A new purely added line.\n";
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_SUCCESS_FILE), modifiedContent);
            execSync(`git add ${OFFSET_SUCCESS_FILE}`, execOptions);
            execSync('git commit -m "Add a new line for the patch"', execOptions);
            
            execSync('git checkout main', execOptions);

            execSync(`${TAYLORED_CMD_BASE} --save ${TEMP_BRANCH}`, execOptions);
            fs.renameSync(path.join(TAYLORED_DIR_FULL_PATH, `${TEMP_BRANCH}.taylored`), PATCH_FULL_PATH);

            // CORREZIONE: Aggiungi e committa il file di patch per pulire la directory di lavoro
            execSync(`git add ${PATCH_FULL_PATH}`, execOptions);
            execSync('git commit -m "chore: add patch for offset test"', execOptions);

            const prependedContent = PREPEND_CONTENT + OFFSET_INITIAL_CONTENT;
            fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_SUCCESS_FILE), prependedContent);
            execSync(`git add ${OFFSET_SUCCESS_FILE}`, execOptions);
            execSync('git commit -m "Prepend lines on main to cause offset"', execOptions);
        });

        afterEach(() => {
            execSync('git checkout main', execOptions);
            try {
                execSync(`git branch -D ${TEMP_BRANCH}`, execOptions);
            } catch (e) { /* ignore */ }
        });

        test('should successfully update offsets after prepending lines', () => {
            const originalPatchContent = fs.readFileSync(PATCH_FULL_PATH, 'utf8');
            const originalHunks = parsePatchHunks(originalPatchContent);
            expect(originalHunks.length).toBeGreaterThan(0);

            execSync(`${TAYLORED_CMD_BASE} --offset ${PATCH_TO_OFFSET} main`, execOptions);

            const updatedPatchContent = fs.readFileSync(PATCH_FULL_PATH, 'utf8');
            const updatedHunks = parsePatchHunks(updatedPatchContent);

            expect(updatedPatchContent).not.toEqual(originalPatchContent);
            expect(updatedHunks.length).toBeGreaterThan(0);
            expect(updatedHunks[0].originalHeaderLine).not.toEqual(originalHunks[0].originalHeaderLine);

            let applyFailed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --add ${PATCH_TO_OFFSET}`, execOptions);
            } catch (e) {
                applyFailed = true;
            }
            expect(applyFailed).toBe(false);

            const finalContent = fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_SUCCESS_FILE), 'utf8');
            const expectedContentAfterApply = PREPEND_CONTENT + OFFSET_INITIAL_CONTENT + "Line 6: A new purely added line.\n";
            expect(normalizeLineEndings(finalContent)).toBe(normalizeLineEndings(expectedContentAfterApply));
        });
    });
});
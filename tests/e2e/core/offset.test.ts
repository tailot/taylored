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
    initialCommitHash,
} from './setup';

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
        'Line 1: Initial context',
        'Line 2: Target for deletion/modification',
        'Line 3: More context',
        'Line 4: Even more context',
        'Line 5: Final context line',
    ].join('\n');

    const PREPEND_CONTENT = 'Prepended Line 1\nPrepended Line 2\n';

    describe('Offset - Deletions Patch (Simulated Step 11 from original description)', () => {
        const OFFSET_DEL_FILE = 'offset_del_file.txt';
        const OFFSET_DEL_BRANCH_S11 = 'offset-del-branch-s11';
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
            const s11DeletedContent = OFFSET_INITIAL_CONTENT.replace('Line 2: Target for deletion/modification\n', '');
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

        afterEach(() => {
            // Changed from afterAll to afterEach for better isolation
            execSync('git checkout main', execOptions); // Ensure on main before branch deletion
            try {
                execSync(`git branch -D ${OFFSET_DEL_BRANCH_S11}`, execOptions);
            } catch (e) {
                /* ignore if branch not found */
            }

            // Patch file is in .taylored, which should be cleaned by resetToInitialState or cleanupTestEnvironment
            // but explicit removal if it was created in this test's scope can be good.
            if (fs.existsSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11)) {
                // fs.unlinkSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11); // Avoid unlinking if it's part of a commit. Let reset handle.
            }
        });

        test('taylored --offset for deletions patch fails as expected', () => {
            let stderr = '';
            let failed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_DEL_PLUGIN_NAME_S11}`, execOptions);
            } catch (error) {
                failed = true;
                stderr = (error as any).stderr?.toString() || '';
            }
            expect(failed).toBe(true); // Taylored currently does not support offset for deletions
            expect(stderr.toLowerCase()).toMatch(
                /obsolete|could not be processed|patch does not apply|offset failed|failed to apply/
            );
            // Ensure original patch file is unchanged
            expect(normalizeLineEndings(fs.readFileSync(OFFSET_DEL_PLUGIN_FULL_PATH_S11, 'utf8'))).toBe(
                normalizeLineEndings(storedOffsetDelPluginS11Content)
            );
            // Ensure file on disk is unchanged by the failed offset attempt
            expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_DEL_FILE), 'utf8'))).toBe(
                normalizeLineEndings(mainModifiedContentS11)
            );
        });
    });

    describe('Offset - Additions Patch (Simulated Step 12 from original description)', () => {
        const OFFSET_ADD_FILE_S12 = 'offset_add_file.txt'; // Use a different file name
        const OFFSET_ADD_BRANCH_S12 = 'offset-add-branch-s12';
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
            const s12AddedContent = OFFSET_INITIAL_CONTENT.replace(
                'Line 2: Target for deletion/modification',
                'Line 2: Target for deletion/modification\nLine 2.5: Newly added line for S12 patch'
            );
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
            // Changed from afterAll to afterEach
            execSync('git checkout main', execOptions);
            try {
                execSync(`git branch -D ${OFFSET_ADD_BRANCH_S12}`, execOptions);
            } catch (e) {
                /* ignore */
            }
            // if (fs.existsSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12)) {
            //     fs.unlinkSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12);
            // }
        });

        test('taylored --offset for additions patch fails as expected', () => {
            let stderr = '';
            let failed = false;
            try {
                execSync(`${TAYLORED_CMD_BASE} --offset ${OFFSET_ADD_PLUGIN_NAME_S12}`, execOptions);
            } catch (error) {
                failed = true;
                stderr = (error as any).stderr?.toString() || '';
            }
            expect(failed).toBe(true); // Taylored currently does not support offset for additions either
            expect(stderr.toLowerCase()).toMatch(
                /obsolete|could not be processed|patch does not apply|offset failed|failed to apply/
            );
            expect(normalizeLineEndings(fs.readFileSync(OFFSET_ADD_PLUGIN_FULL_PATH_S12, 'utf8'))).toBe(
                normalizeLineEndings(storedOffsetAddPluginS12Content)
            );
            expect(
                normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, OFFSET_ADD_FILE_S12), 'utf8'))
            ).toBe(normalizeLineEndings(mainModifiedContentS12));
        });
    });
});

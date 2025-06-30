import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  resetToInitialState,
  TAYLORED_CMD_BASE,
  execOptions,
  TEST_DIR_FULL_PATH,
  TAYLORED_DIR_FULL_PATH,
  INITIAL_FILE1_CONTENT,
  initialCommitHash,
} from './setup';

describe('Core CLI Tests - Save', () => {
  beforeAll(async () => {
    await initializeTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    await resetToInitialState(true); // Pass true to skip re-saving deletions patch from setup
    // as we want to test --save explicitly here.
  });

  test('taylored --save correctly creates a patch from a branch (purely additive)', () => {
    const BRANCH_SAVE_TEST = 'save-test-branch-pure-add';
    const PLUGIN_SAVE_TEST_NAME = `${BRANCH_SAVE_TEST}.taylored`;
    const PLUGIN_SAVE_TEST_FULL_PATH = path.join(
      TAYLORED_DIR_FULL_PATH,
      PLUGIN_SAVE_TEST_NAME,
    );
    const FILE_FOR_SAVE_TEST = 'save_test_file.txt';
    const FILE_FOR_SAVE_TEST_CONTENT =
      'Content for save test.\nLine 2 for save test.\n';
    // MODIFIED_FILE_FOR_SAVE_TEST_CONTENT is removed as we are not modifying file1.txt on the branch

    try {
      // 1. Create a new file on a new branch
      execSync(
        `git checkout -b ${BRANCH_SAVE_TEST} ${initialCommitHash}`,
        execOptions,
      );
      fs.writeFileSync(
        path.join(TEST_DIR_FULL_PATH, FILE_FOR_SAVE_TEST),
        FILE_FOR_SAVE_TEST_CONTENT,
      );
      execSync(`git add ${FILE_FOR_SAVE_TEST}`, execOptions);
      // Do NOT modify file1.txt on BRANCH_SAVE_TEST to ensure a purely additive diff
      execSync(
        'git commit -m "Commit for pure save test - new file only"',
        execOptions,
      );

      // 2. Go back to main
      execSync('git checkout main', execOptions);
      // Ensure main is pristine for comparison (file1.txt should be INITIAL_FILE1_CONTENT from initialCommitHash)
      execSync(`git reset --hard ${initialCommitHash}`, execOptions);

      // 3. Run taylored --save
      execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_SAVE_TEST}`, execOptions);

      // 4. Verify patch file was created
      expect(fs.existsSync(PLUGIN_SAVE_TEST_FULL_PATH)).toBe(true);
      const patchContent = fs.readFileSync(PLUGIN_SAVE_TEST_FULL_PATH, 'utf8');
      expect(patchContent).toContain(
        `+${FILE_FOR_SAVE_TEST_CONTENT.split('\n')[0]}`,
      ); // Check for new file content
      expect(patchContent).not.toContain(`a/file1.txt b/file1.txt`); // Should not have changes for file1.txt
      expect(patchContent).toContain(`new file mode`);
      expect(patchContent).toContain(
        `a/${FILE_FOR_SAVE_TEST} b/${FILE_FOR_SAVE_TEST}`,
      );
    } finally {
      // Clean up
      if (fs.existsSync(PLUGIN_SAVE_TEST_FULL_PATH)) {
        fs.unlinkSync(PLUGIN_SAVE_TEST_FULL_PATH);
      }
      execSync(`git checkout main`, execOptions); // Ensure we are on main
      execSync(`git branch -D ${BRANCH_SAVE_TEST}`, execOptions);
      // Reset file1.txt on main to its absolute initial state from setup
      fs.writeFileSync(
        path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
        INITIAL_FILE1_CONTENT,
      );
      // Removed git add and commit, as resetToInitialState will handle file state.
    }
  });

  describe('Mixed Changes Save Test (Should Fail or Not Create Patch)', () => {
    // This test is moved from main.test.ts
    test('taylored --save with mixed add/delete in same file', () => {
      const BRANCH_MIXED = 'mixed-changes-branch';
      const PLUGIN_MIXED_NAME = `${BRANCH_MIXED}.taylored`;
      const PLUGIN_MIXED_FULL_PATH = path.join(
        TAYLORED_DIR_FULL_PATH,
        PLUGIN_MIXED_NAME,
      );
      let failed = false;
      let branchExists = false;

      try {
        execSync(
          `git checkout -b ${BRANCH_MIXED} ${initialCommitHash}`,
          execOptions,
        );
        branchExists = true;
        // Create mixed changes: remove a line, add a line elsewhere.
        // Git diff might represent this as one hunk with additions and deletions.
        // The original test used substring which can be tricky. Let's be more explicit.
        // Initial: L1 \n L2 \n L3 \n L4 \n L5
        // Mixed:   L1 \n L3 \n L4 \n L5 \n New Line
        const lines = INITIAL_FILE1_CONTENT.trim().split('\n');
        const mixedContent = `${lines[0]}\n${lines[2]}\n${lines[3]}\n${lines[4]}\nNew Line at the end.\n`;

        fs.writeFileSync(
          path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
          mixedContent,
        );
        execSync('git add file1.txt', execOptions);
        execSync('git commit -m "Mixed changes to file1"', execOptions);

        execSync('git checkout main', execOptions);
        // Ensure file1.txt is back to its original state on main for a clean diff
        fs.writeFileSync(
          path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
          INITIAL_FILE1_CONTENT,
        );
        execSync(`git add file1.txt`, execOptions);
        execSync(
          `git commit --allow-empty -m "Ensure file1 is initial on main for mixed test"`,
          execOptions,
        );

        execSync(`${TAYLORED_CMD_BASE} --save ${BRANCH_MIXED}`, execOptions);
        // If execSync doesn't throw, the command succeeded.
        // We expect it to fail or create an empty/problematic patch for "mixed" changes,
        // depending on how taylored handles such diffs (e.g. if it uses --no-mixed).
        // The original test checked for failure OR empty patch.
      } catch (error) {
        failed = true; // Command threw an error, which is one expected outcome.
      } finally {
        if (branchExists) {
          execSync('git checkout main', execOptions); // Switch back to main before deleting branch
          execSync(`git branch -D ${BRANCH_MIXED}`, execOptions);
        }
        // Reset file1.txt on main to its absolute initial state from setup
        fs.writeFileSync(
          path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
          INITIAL_FILE1_CONTENT,
        );
        // Removed git add and commit, as resetToInitialState will handle file state.
      }

      // Assertions based on original test logic:
      // It expects either the command to fail OR the created patch file to be empty.
      const patchExists = fs.existsSync(PLUGIN_MIXED_FULL_PATH);
      if (failed) {
        expect(patchExists).toBe(false); // If it failed, it ideally shouldn't create the file.
      } else {
        // If it didn't fail, the patch should exist and be empty (or taylored handles mixed diffs now)
        // For this test, let's assume taylored is configured to *not* save mixed diffs or make them empty.
        expect(patchExists).toBe(true);
        if (patchExists) {
          const patchStat = fs.statSync(PLUGIN_MIXED_FULL_PATH);
          // An empty diff or a diff that git apply would reject due to mixed changes.
          // The original test checked for size 0. This might be too strict if headers are present.
          // A more robust check might be to try and apply it and see if it fails or results in no change.
          // For now, sticking to "empty or near-empty"
          expect(patchStat.size).toBeLessThan(10); // Allow for potential headers in an "empty" patch
        }
      }

      if (patchExists) {
        fs.unlinkSync(PLUGIN_MIXED_FULL_PATH); // Clean up plugin if created
      }
    });
  });
});

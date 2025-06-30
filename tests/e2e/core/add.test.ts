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
  PLUGIN_DELETIONS_NAME,
  PLUGIN_DELETIONS_NO_EXT,
  MODIFIED_FILE1_DELETIONS_CONTENT,
  INITIAL_FILE1_CONTENT,
  TEST_DIR_FULL_PATH,
  TAYLORED_DIR_FULL_PATH,
  initialCommitHash, // Needed for additions branch setup
} from './setup';

describe('Core CLI Tests - Add', () => {
  beforeAll(async () => {
    await initializeTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    await resetToInitialState();
  });

  describe('taylored --add (deletions patch)', () => {
    test('adds patch (with .taylored extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`,
        execOptions,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
      expect(
        fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
      ).toBe(false);
    });
    test('adds patch (without .taylored extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NO_EXT}`,
        execOptions,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
      expect(
        fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
      ).toBe(false);
    });
  });

  describe('Additions Patch Tests (--add)', () => {
    const BRANCH_ADDITIONS = 'additions-branch';
    const PLUGIN_ADDITIONS_NAME = `${BRANCH_ADDITIONS}.taylored`;
    const PLUGIN_ADDITIONS_NO_EXT = BRANCH_ADDITIONS;
    const PLUGIN_ADDITIONS_FULL_PATH = path.join(
      TAYLORED_DIR_FULL_PATH,
      PLUGIN_ADDITIONS_NAME,
    );
    let NEW_FILE_CONTENT: string;

    const createAdditionsPatchContent =
      () => `diff --git a/new_file.txt b/new_file.txt
new file mode 100644
index 0000000..b902982
--- /dev/null
+++ b/new_file.txt
@@ -0,0 +1 @@
+A new line for the new file.
+`;
    // Note: Adjusted patch content slightly for common diff formats. The original might have been specific to a git version.

    beforeAll(async () => {
      // This beforeAll is specific to this describe block.
      // It runs *after* the top-level beforeAll(initializeTestEnvironment).
      // initialCommitHash should be set by then.
      NEW_FILE_CONTENT = 'A new line for the new file.\n';
      execSync(
        `git checkout -b ${BRANCH_ADDITIONS} ${initialCommitHash}`,
        execOptions,
      );
      fs.writeFileSync(
        path.join(TEST_DIR_FULL_PATH, 'new_file.txt'),
        NEW_FILE_CONTENT,
      );
      execSync('git add new_file.txt', execOptions);
      execSync(
        'git commit -m "Create new_file.txt for additions branch"',
        execOptions,
      );
      execSync('git checkout main', execOptions);
    });

    beforeEach(async () => {
      // This runs *after* the top-level beforeEach(resetToInitialState).
      // Ensure the .taylored directory exists (resetToInitialState might clean it if empty)
      if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
        fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
      }
      // Manually create the additions patch file for these tests
      fs.writeFileSync(
        PLUGIN_ADDITIONS_FULL_PATH,
        createAdditionsPatchContent(),
      );
      if (!fs.existsSync(PLUGIN_ADDITIONS_FULL_PATH)) {
        throw new Error(
          `Additions suite specific beforeEach failed to create ${PLUGIN_ADDITIONS_FULL_PATH}`,
        );
      }
    });

    afterAll(() => {
      try {
        execSync(`git branch -D ${BRANCH_ADDITIONS}`, execOptions);
      } catch (e) {
        console.warn(
          `Warning: Could not clean up ${BRANCH_ADDITIONS}. ${(e as any).message}`,
        );
      }
      // The manually created patch file will be cleaned by resetToInitialState or cleanupTestEnvironment
    });

    test('taylored --add (additions patch, with extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NAME}`,
        execOptions,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(
        true,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(
            path.join(TEST_DIR_FULL_PATH, 'new_file.txt'),
            'utf8',
          ),
        ),
      ).toBe(normalizeLineEndings(NEW_FILE_CONTENT));
    });

    test('taylored --add (additions patch, without extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --add ${PLUGIN_ADDITIONS_NO_EXT}`,
        execOptions,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
      expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'new_file.txt'))).toBe(
        true,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(
            path.join(TEST_DIR_FULL_PATH, 'new_file.txt'),
            'utf8',
          ),
        ),
      ).toBe(normalizeLineEndings(NEW_FILE_CONTENT));
    });
  });

  describe('Fuzzy Patching Test (--add)', () => {
    test('taylored --add on slightly modified file (deletions patch)', () => {
      // Modify file1.txt slightly from its initial state
      fs.writeFileSync(
        path.join(TEST_DIR_FULL_PATH, 'file1.txt'),
        INITIAL_FILE1_CONTENT + '\nSlight modification.',
      );

      let success = false;
      let rejFilePath = path.join(TEST_DIR_FULL_PATH, 'file1.txt.rej');

      try {
        execSync(
          `${TAYLORED_CMD_BASE} --add ${PLUGIN_DELETIONS_NAME}`,
          execOptions,
        );
        success = true; // Command succeeded
      } catch (e) {
        // Command failed, check for .rej file
        expect(fs.existsSync(rejFilePath)).toBe(true);
      } finally {
        if (fs.existsSync(rejFilePath)) {
          fs.unlinkSync(rejFilePath); // Clean up .rej file
        }
      }

      if (success) {
        // If successful, verify content
        expect(
          normalizeLineEndings(
            fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
          ),
        ).toBe(
          normalizeLineEndings(
            MODIFIED_FILE1_DELETIONS_CONTENT + '\nSlight modification.',
          ),
        );
        expect(
          fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
        ).toBe(false);
      }
      // If not successful, the expect(fs.existsSync(rejFilePath)).toBe(true) served as the check.
    });
  });
});

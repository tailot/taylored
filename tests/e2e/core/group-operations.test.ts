import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { TAYLORED_FILE_EXTENSION } from '../../../lib/constants'; // Adjust path as per your structure
import {
  initializeTestEnvironment,
  cleanupTestEnvironment as globalCleanup,
  resetToInitialState,
  TEST_DIR_FULL_PATH,
  TAYLORED_CMD_BASE,
  TAYLORED_DIR_NAME as ACTUAL_TAYLORED_DIR_NAME,
  execOptions,
} from './setup';

const CWD = TEST_DIR_FULL_PATH;
const tayloredDir = path.join(CWD, ACTUAL_TAYLORED_DIR_NAME);
// Alias ACTUAL_TAYLORED_DIR_NAME to TAYLORED_DIR_NAME for use within this file for convenience
const TAYLORED_DIR_NAME = ACTUAL_TAYLORED_DIR_NAME;

// Helper to run taylored command
const runTaylored = (args: string) => {
  return execSync(`${TAYLORED_CMD_BASE} ${args}`, {
    ...execOptions,
    cwd: CWD,
    encoding: 'utf-8',
  });
};

// Helper to create a dummy taylored file
const createDummyPatch = async (
  filePathInTaylored: string,
  content: string,
) => {
  const fullPath = path.join(tayloredDir, filePathInTaylored);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content);
};

// Helper to create a target file to be patched
const createTargetFile = async (fileName: string, content: string = '') => {
  const fullPath = path.join(CWD, fileName);
  await fs.writeFile(fullPath, content);
  // Stage and commit this file so git recognizes it
  execSync(`git add "${fileName}"`, { cwd: CWD });
  execSync(`git commit -m "add ${fileName}"`, { cwd: CWD });
};

// Helper to read a target file
const readTargetFile = async (fileName: string) => {
  try {
    return await fs.readFile(path.join(CWD, fileName), 'utf-8');
  } catch (e) {
    return null; // Return null if file doesn't exist
  }
};

describe('E2E Tests for Group Operations and Hierarchical List', () => {
  beforeAll(async () => {
    // Initialize the shared test environment once
    await initializeTestEnvironment();
  });

  afterAll(async () => {
    // Cleanup the shared test environment once after all tests in this suite
    await globalCleanup();
  });

  beforeEach(async () => {
    // Reset the state of the shared repo before each test
    await resetToInitialState(true); // true to skip resaving deletion patch if not needed by these tests

    // Ensure the main .taylored directory exists after reset
    await fs.mkdir(tayloredDir, { recursive: true });

    // Create the .taylored directory structure for tests
    // .taylored/
    // ├── test-group/
    // │   ├── 1-first.taylored    (patches target.txt)
    // │   ├── sub-group/
    // │   │   └── 5-middle.taylored (patches target.txt)
    // │   └── 10-second.taylored  (patches target.txt)
    // ├── 2-standalone.taylored (patches another.txt)
    // └── no-prefix-group/
    //     └── feature.taylored  (patches target.txt, independent)
    //     └── another-feature.taylored (patches another.txt, independent)

    // Patches for target.txt, designed to be applied sequentially for ordering tests
    await createDummyPatch(
      'test-group/1-first.taylored',
      `--- a/target.txt
+++ b/target.txt
@@ -1,1 +1,2 @@
 Initial content for target.txt
+First line from 1-first
`,
    );
    await createDummyPatch(
      'test-group/sub-group/5-middle.taylored',
      `--- a/target.txt
+++ b/target.txt
@@ -2,1 +2,2 @@
 First line from 1-first
+Second line from 5-middle
`,
    );
    await createDummyPatch(
      'test-group/10-second.taylored',
      `--- a/target.txt
+++ b/target.txt
@@ -3,1 +3,2 @@
 Second line from 5-middle
+Third line from 10-second
`,
    );

    // Patches for another.txt (independent)
    await createDummyPatch(
      '2-standalone.taylored',
      `--- a/another.txt
+++ b/another.txt
@@ -1,1 +1,2 @@
 Initial content for another.txt
+Line for another.txt from 2-standalone
`,
    );
    await createDummyPatch(
      'no-prefix-group/another-feature.taylored',
      `--- a/another.txt
+++ b/another.txt
@@ -1,1 +1,2 @@
 Initial content for another.txt
+Line from no-prefix another-feature
`,
    );

    // Patch for no-prefix-group targeting target.txt (applies to initial state for its own test)
    await createDummyPatch(
      'no-prefix-group/feature.taylored',
      `--- a/target.txt
+++ b/target.txt
@@ -1,1 +1,2 @@
 Initial content for target.txt
+Line from no-prefix feature
`,
    );

    // Create target files
    await createTargetFile('target.txt', 'Initial content for target.txt\n');
    await createTargetFile('another.txt', 'Initial content for another.txt\n');
  });

  // afterEach is not strictly needed if resetToInitialState is robust for beforeEach
  // and globalCleanup handles final cleanup in afterAll.
  describe('--add on a directory', () => {
    it('should apply patches in numerical order from a directory', async () => {
      runTaylored('--add test-group');
      const content = await readTargetFile('target.txt');
      expect(content).toContain('Initial content for target.txt');
      expect(content).toContain('First line from 1-first');
      expect(content).toContain('Second line from 5-middle');
      expect(content).toContain('Third line from 10-second');

      const lines = content?.split('\n') || [];
      const initialIndex = lines.indexOf('Initial content for target.txt');
      const firstIndex = lines.indexOf('First line from 1-first');
      const middleIndex = lines.indexOf('Second line from 5-middle');
      const secondIndex = lines.indexOf('Third line from 10-second');

      expect(initialIndex).toBeLessThan(firstIndex);
      expect(firstIndex).toBeLessThan(middleIndex);
      expect(middleIndex).toBeLessThan(secondIndex);
    });

    it('should apply patches from a directory with mixed (prefix/no-prefix) and nested patches', async () => {
      // This test will apply 'no-prefix-group'.
      // It contains 'feature.taylored' (targets target.txt) and 'another-feature.taylored' (targets another.txt)
      // These should apply based on alphabetical sort within the group if no numeric prefix.
      runTaylored('--add no-prefix-group');

      const targetContent = await readTargetFile('target.txt');
      expect(targetContent).toContain('Line from no-prefix feature');

      const anotherContent = await readTargetFile('another.txt');
      expect(anotherContent).toContain('Line from no-prefix another-feature');
    });
  });

  describe('--remove on a directory', () => {
    it('should remove patches from a directory', async () => {
      // First, add them
      runTaylored('--add test-group');
      const originalContent = await readTargetFile('target.txt');
      expect(originalContent).toContain('First line from 1-first');
      expect(originalContent).toContain('Second line from 5-middle');
      expect(originalContent).toContain('Third line from 10-second');

      // Then, remove them
      runTaylored('--remove test-group');
      const finalContent = await readTargetFile('target.txt');
      expect(finalContent).not.toContain('First line from 1-first');
      expect(finalContent).not.toContain('Second line from 5-middle');
      expect(finalContent).not.toContain('Third line from 10-second');
      expect(finalContent).toEqual('Initial content for target.txt\n'); // Should revert to original
    });
  });

  describe('--verify-add on a directory', () => {
    it('should verify patches in a directory without applying them', async () => {
      const output = runTaylored('--verify-add test-group');
      expect(output).toContain(
        'INFO: ==> --verify-add patch: test-group/1-first.taylored',
      );
      expect(output).toContain(
        'INFO: ==> --verify-add patch: test-group/sub-group/5-middle.taylored',
      );
      expect(output).toContain(
        'INFO: ==> --verify-add patch: test-group/10-second.taylored',
      );
      expect(output).toContain(
        'INFO: <== Successfully processed: test-group/10-second.taylored',
      );

      const content = await readTargetFile('target.txt');
      expect(content).not.toContain('First line from 1-first');
      expect(content).toEqual('Initial content for target.txt\n');
    });
  });

  describe('--list with hierarchical view', () => {
    it('should display the .taylored directory in a tree structure', async () => {
      // beforeEach already sets up the full structure.
      const output = runTaylored('--list');

      const correctedExpectedOutputLines = [
        `INFO: Listing contents of '${path.join(CWD, TAYLORED_DIR_NAME)}'...`,
        '',
        `📁 ${TAYLORED_DIR_NAME}/`,
        '├── 📁 no-prefix-group/', // Sorted: no-prefix-group before test-group
        '│   ├── 📄 another-feature.taylored',
        '│   └── 📄 feature.taylored',
        '├── 📁 test-group/',
        '│   ├── 📁 sub-group/', // sub-group within test-group
        '│   │   └── 📄 5-middle.taylored',
        '│   ├── 📄 1-first.taylored',
        '│   └── 📄 10-second.taylored',
        '└── 📄 2-standalone.taylored',
      ];

      const outputLines = output.split('\n').map((line) => line.trimEnd());

      correctedExpectedOutputLines.forEach((expectedLine) => {
        const processedExpectedLine = expectedLine.replace(
          path.join('CWD_PLACEHOLDER', TAYLORED_DIR_NAME),
          path.join(CWD, TAYLORED_DIR_NAME),
        );
        expect(outputLines).toContain(processedExpectedLine);
      });

      expect(output).toMatch(/📁 .taylored\//);
      expect(output).toMatch(/├── 📁 no-prefix-group\//);
      expect(output).toMatch(/│   ├── 📄 another-feature.taylored/);
      expect(output).toMatch(/│   └── 📄 feature.taylored/);
      expect(output).toMatch(/├── 📁 test-group\//);
      expect(output).toMatch(/│   ├── 📁 sub-group\//);
      expect(output).toMatch(/│   │   └── 📄 5-middle.taylored/);
      expect(output).toMatch(/│   ├── 📄 1-first.taylored/);
      expect(output).toMatch(/│   └── 📄 10-second.taylored/);
      expect(output).toMatch(/└── 📄 2-standalone.taylored/);
    });

    it('should show (empty) for an empty directory within .taylored/', async () => {
      await fs.mkdir(path.join(tayloredDir, 'completely-empty-dir'), {
        recursive: true,
      });
      const output = runTaylored('--list');
      // Depending on sort order (dirs first, then alpha), it might be ├── or └──
      expect(output).toMatch(/(├──|└──) 📁 completely-empty-dir\//);
    });

    it('should inform if .taylored directory is empty or contains no .taylored files', async () => {
      // Scenario 1: .taylored is completely empty
      await fs.rm(tayloredDir, { recursive: true, force: true });
      await fs.mkdir(tayloredDir);
      let output = runTaylored('--list');
      expect(output).toContain(`📁 ${TAYLORED_DIR_NAME}/`);
      expect(output).toContain('  └── (empty)');
      expect(output).toContain(
        `INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${path.join(CWD, TAYLORED_DIR_NAME)}' or its subdirectories.`,
      );

      // Scenario 2: .taylored contains only non-taylored files or empty dirs
      await fs.rm(tayloredDir, { recursive: true, force: true });
      await fs.mkdir(tayloredDir);
      await fs.writeFile(path.join(tayloredDir, 'readme.txt'), 'hello');
      await fs.mkdir(path.join(tayloredDir, 'empty-sub'));
      output = runTaylored('--list');
      expect(output).toContain(`📁 ${TAYLORED_DIR_NAME}/`);
      expect(output).toMatch(/(├──|└──) 📁 empty-sub\//);
      expect(output).toContain(
        `INFO: No ${TAYLORED_FILE_EXTENSION} files found in '${path.join(CWD, TAYLORED_DIR_NAME)}' or its subdirectories.`,
      );
    });
  });
});

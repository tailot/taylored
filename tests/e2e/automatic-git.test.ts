// tests/e2e/automatic-git.test.ts
import * as fs from 'fs';
import * as path from 'path';
import {
  execSync,
  ExecSyncOptionsWithStringEncoding,
  ExecSyncOptionsWithBufferEncoding,
} from 'child_process'; // Import both
import {
  TAYLORED_DIR_NAME,
  TAYLORED_FILE_EXTENSION,
} from '../../lib/constants'; // Adjust path if necessary

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../..');
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
const TEMP_TEST_DIR_BASE = path.join(
  PROJECT_ROOT_PATH,
  'temp_e2e_automatic_git',
);

// Helper to normalize line endings for consistent comparisons
const normalizeLineEndings = (str: string): string =>
  str.replace(/\r\n/g, '\n');

// Helper to run taylored command
const runTayloredCommand = (
  repoPath: string,
  args: string,
): { stdout: string; stderr: string; status: number | null } => {
  try {
    const stdout = execSync(`${TAYLORED_CMD_BASE} ${args}`, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '',
      status: error.status,
    };
  }
};

// Helper to set up a new Git repo for a test
const setupTestRepo = (testName: string): string => {
  const repoPath = path.join(TEMP_TEST_DIR_BASE, testName);
  if (fs.existsSync(repoPath)) {
    fs.rmSync(repoPath, { recursive: true, force: true });
  }
  fs.mkdirSync(repoPath, { recursive: true }); // Ensure the repo directory is created

  const execOpts: ExecSyncOptionsWithStringEncoding = {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: 'pipe',
  };

  execSync('git init -b main', execOpts); // Initialize the git repository with main as default branch
  execSync('git config user.name "Test User"', execOpts); // Required for commits
  execSync('git config user.email "test@example.com"', execOpts); // Required for commits
  execSync('git config commit.gpgsign false', execOpts);

  // Create and commit an initial file to ensure the repo is not empty and has a base commit.
  // Ensure content ends with a newline for consistency, similar to createFileAndCommit.
  const initialFileContent = 'Initial commit\n';
  fs.writeFileSync(path.join(repoPath, 'initial.txt'), initialFileContent);
  execSync('git add initial.txt', execOpts);
  execSync('git commit -m "Initial commit"', execOpts);
  return repoPath;
};

// Helper to create a file and commit it
const createFileAndCommit = (
  repoPath: string,
  relativeFilePath: string,
  content: string,
  commitMessage: string,
): void => {
  const fullFilePath = path.join(repoPath, relativeFilePath);
  const dirName = path.dirname(fullFilePath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  // Ensure content ends with a newline
  const contentWithNewline = content.endsWith('\n') ? content : content + '\n';
  fs.writeFileSync(fullFilePath, contentWithNewline);
  const execOpts: ExecSyncOptionsWithStringEncoding = {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: 'pipe',
  };
  execSync(`git add "${relativeFilePath}"`, execOpts);
  execSync(`git commit -m "${commitMessage}"`, execOpts);
};

describe('Automatic Command (Git Workflow)', () => {
  beforeAll(() => {
    if (fs.existsSync(TEMP_TEST_DIR_BASE)) {
      fs.rmSync(TEMP_TEST_DIR_BASE, { recursive: true, force: true });
    }
    fs.mkdirSync(TEMP_TEST_DIR_BASE, { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(TEMP_TEST_DIR_BASE)) {
      fs.rmSync(TEMP_TEST_DIR_BASE, { recursive: true, force: true });
    }
  });

  describe('Prerequisite Checks', () => {
    let testRepoPath: string;
    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('Clean Git State: Fails if uncommitted changes exist', () => {
      testRepoPath = setupTestRepo('clean_state_uncommitted');
      createFileAndCommit(
        testRepoPath,
        'committed_file.txt',
        'initial content',
        'Initial commit of a file',
      );
      fs.writeFileSync(
        path.join(testRepoPath, 'committed_file.txt'),
        'changed content',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'CRITICAL ERROR: Uncommitted changes or untracked files in the repository.',
      );
    });

    test('Clean Git State: Fails if untracked files exist', () => {
      testRepoPath = setupTestRepo('clean_state_untracked');
      fs.writeFileSync(
        path.join(testRepoPath, 'untracked_file.txt'),
        'untracked content',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(
        'CRITICAL ERROR: Uncommitted changes or untracked files in the repository.',
      );
    });

    test('Intermediate .taylored/main.taylored Must Not Exist: Fails if it exists', () => {
      testRepoPath = setupTestRepo('main_taylored_exists');
      createFileAndCommit(
        testRepoPath,
        'src/app.ts',
        '// File content\n// <taylored number="1">\n// block\n// </taylored>',
        'Add app.ts',
      );

      const tayloredDirPath = path.join(testRepoPath, TAYLORED_DIR_NAME);
      fs.mkdirSync(tayloredDirPath, { recursive: true });
      // Create AND commit the conflicting file to pass the "dirty repo" check
      createFileAndCommit(
        testRepoPath,
        path.join(TAYLORED_DIR_NAME, `main${TAYLORED_FILE_EXTENSION}`),
        'dummy content',
        'add main.taylored',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      if (result.status === 0) {
        console.log(
          "Test 'Intermediate .taylored/main.taylored Must Not Exist' unexpectedly got status 0.",
        );
        console.log('STDOUT:', result.stdout);
        console.log('STDERR:', result.stderr);
      }
      // Application should exit with non-zero status on this critical error.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(
        /CRITICAL ERROR: Intermediate file .*main\.taylored \(derived from branch name 'main'\) already exists/,
      );
    });

    test('Target .taylored/NUMERO.taylored Must Not Exist: Fails if it exists', () => {
      testRepoPath = setupTestRepo('numero_taylored_exists');
      createFileAndCommit(
        testRepoPath,
        'src/app.ts',
        '// File content\n// <taylored number="1">\n// block\n// </taylored>',
        'Add app.ts',
      );

      const tayloredDirPath = path.join(testRepoPath, TAYLORED_DIR_NAME);
      fs.mkdirSync(tayloredDirPath, { recursive: true });
      // Create AND commit the conflicting file
      createFileAndCommit(
        testRepoPath,
        path.join(TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`),
        'dummy content',
        'add 1.taylored',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      if (result.status === 0) {
        console.log(
          "Test 'Target .taylored/NUMERO.taylored Must Not Exist' unexpectedly got status 0.",
        );
        console.log('STDOUT:', result.stdout);
        console.log('STDERR:', result.stderr);
      }
      // Application should exit with non-zero status on this critical error.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(
        /CRITICAL ERROR: Target file \S*1\.taylored already exists/,
      );
    });
  });

  describe('Successful Extraction', () => {
    let testRepoPath: string;
    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('Single Block: Correctly extracts and creates .taylored file', () => {
      testRepoPath = setupTestRepo('successful_single_block');
      const appTsContent = `// Line 1
// <taylored number="42">
// This is block 42
// It has two lines
// </taylored>
// Line 6\n`; // Added trailing newline
      createFileAndCommit(
        testRepoPath,
        'src/app.ts',
        appTsContent,
        'Add app.ts with block 42',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);
      const expectedSuccessMessagePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `42${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessagePath}`,
      );

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `42${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(true);

      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath, 'utf8'),
      );
      expect(tayloredContent).toMatch(/--- a\/src\/app.ts/);
      expect(tayloredContent).toMatch(/\+\+\+ b\/src\/app.ts/);
      expect(tayloredContent).toContain(`-// <taylored number="42">`);
      expect(tayloredContent).toContain(`-// This is block 42`);
      expect(tayloredContent).toContain(`-// It has two lines`);
      expect(tayloredContent).toContain(`-// </taylored>`);
      expect(tayloredContent).toContain(` // Line 1`);
      expect(tayloredContent).toContain(` // Line 6`);
      expect(tayloredContent).toContain('@@ -1,6 +1,2 @@'); // Changed from toMatch to toContain for robustness
      const originalFileContent = normalizeLineEndings(
        fs.readFileSync(path.join(testRepoPath, 'src/app.ts'), 'utf8'),
      );
      expect(originalFileContent).toBe(normalizeLineEndings(appTsContent));

      const branches = execSync('git branch', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).not.toContain('temp-taylored-');

      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf8',
      }).trim();
      expect(currentBranch).toBe('main');
    });

    test('Multiple Blocks: Correctly extracts all blocks', () => {
      testRepoPath = setupTestRepo('successful_multiple_blocks');
      const serviceJsContent = `// Service Start\n// <taylored number="1">const service = "alpha";\n// </taylored>\n// Service End`;
      createFileAndCommit(
        testRepoPath,
        'src/service.js',
        serviceJsContent,
        'Add service.js',
      );

      const utilsJsContent = `// Utils Start\n// <taylored number="2">const utilOne = 1;\n// </taylored>\n// Middle Code\n// <taylored number="3">const utilTwo = 2;\n// </taylored>\n// Utils End`;
      createFileAndCommit(
        testRepoPath,
        'src/utils.js',
        utilsJsContent,
        'Add utils.js',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      expect(
        fs.existsSync(
          path.join(
            testRepoPath,
            TAYLORED_DIR_NAME,
            `1${TAYLORED_FILE_EXTENSION}`,
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            testRepoPath,
            TAYLORED_DIR_NAME,
            `2${TAYLORED_FILE_EXTENSION}`,
          ),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(
            testRepoPath,
            TAYLORED_DIR_NAME,
            `3${TAYLORED_FILE_EXTENSION}`,
          ),
        ),
      ).toBe(true);

      const content1 = fs.readFileSync(
        path.join(
          testRepoPath,
          TAYLORED_DIR_NAME,
          `1${TAYLORED_FILE_EXTENSION}`,
        ),
        'utf8',
      );
      expect(content1).toContain(
        '-// <taylored number="1">const service = "alpha";',
      );
      expect(content1).toContain('-// </taylored>');

      const content2 = fs.readFileSync(
        path.join(
          testRepoPath,
          TAYLORED_DIR_NAME,
          `2${TAYLORED_FILE_EXTENSION}`,
        ),
        'utf8',
      );
      expect(content2).toContain('-// <taylored number="2">const utilOne = 1;');
      expect(content2).toContain('-// </taylored>');

      const content3 = fs.readFileSync(
        path.join(
          testRepoPath,
          TAYLORED_DIR_NAME,
          `3${TAYLORED_FILE_EXTENSION}`,
        ),
        'utf8',
      );
      expect(content3).toContain('-// <taylored number="3">const utilTwo = 2;');
      expect(content3).toContain('-// </taylored>');
    });

    test('Multiple Extensions: Correctly extracts blocks from files with different specified extensions', () => {
      testRepoPath = setupTestRepo('successful_multiple_extensions');
      const tsContent = `// TS file
// <taylored number="101">
const tsVar: string = "typescript";
// </taylored>
console.log(tsVar);\n`; // Added trailing newline
      createFileAndCommit(
        testRepoPath,
        'src/app.ts',
        tsContent,
        'Add app.ts with block 101',
      );

      const jsContent = `// JS file
// <taylored number="102">
var jsVar = "javascript";
// </taylored>
console.log(jsVar);\n`; // Added trailing newline
      createFileAndCommit(
        testRepoPath,
        'src/component.js',
        jsContent,
        'Add component.js with block 102',
      );

      // Run taylored for both .ts and .js extensions
      const result = runTayloredCommand(testRepoPath, '--automatic ts,js main');

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);

      const expectedSuccessMessage101 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `101${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage101}`,
      );
      const expectedSuccessMessage102 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `102${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage102}`,
      );

      const tayloredFilePath101 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `101${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath101)).toBe(true);
      const tayloredContent101 = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath101, 'utf8'),
      );
      expect(tayloredContent101).toMatch(/--- a\/src\/app.ts/);
      expect(tayloredContent101).toMatch(/\+\+\+ b\/src\/app.ts/);
      expect(tayloredContent101).toContain(`-// <taylored number="101">`);
      expect(tayloredContent101).toContain(
        `-const tsVar: string = "typescript";`,
      );
      expect(tayloredContent101).toContain(`-// </taylored>`);
      expect(tayloredContent101).toContain(` console.log(tsVar);`);

      const tayloredFilePath102 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `102${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath102)).toBe(true);
      const tayloredContent102 = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath102, 'utf8'),
      );
      expect(tayloredContent102).toMatch(/--- a\/src\/component.js/);
      expect(tayloredContent102).toMatch(/\+\+\+ b\/src\/component.js/);
      expect(tayloredContent102).toContain(`-// <taylored number="102">`);
      expect(tayloredContent102).toContain(`-var jsVar = "javascript";`);
      expect(tayloredContent102).toContain(`-// </taylored>`);
      expect(tayloredContent102).toContain(` console.log(jsVar);`);

      // Verify original files are untouched
      const originalTsFileContent = normalizeLineEndings(
        fs.readFileSync(path.join(testRepoPath, 'src/app.ts'), 'utf8'),
      );
      expect(originalTsFileContent).toBe(normalizeLineEndings(tsContent));
      const originalJsFileContent = normalizeLineEndings(
        fs.readFileSync(path.join(testRepoPath, 'src/component.js'), 'utf8'),
      );
      expect(originalJsFileContent).toBe(normalizeLineEndings(jsContent));

      // Verify no temporary branches are left
      const branches = execSync('git branch', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).not.toContain('temp-taylored-');

      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf8',
      }).trim();
      expect(currentBranch).toBe('main');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    let testRepoPath: string;
    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('No Markers Found: Reports correctly', () => {
      testRepoPath = setupTestRepo('no_markers_found');
      createFileAndCommit(
        testRepoPath,
        'src/app.ts',
        '// No markers here',
        'Add app.ts without markers',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(
        'No taylored blocks found matching the criteria',
      );

      const tayloredDirContents = fs.readdirSync(
        path.join(testRepoPath, TAYLORED_DIR_NAME),
      );
      expect(tayloredDirContents.length).toBe(0);
    });

    test('Non-compute block with non-existent target branch: Succeeds as target branch is not used for its patch', () => {
      testRepoPath = setupTestRepo('error_save_non_existent_branch');
      createFileAndCommit(
        testRepoPath,
        'src/app.ts',
        '// File content\n// <taylored number="1">\n// block\n// </taylored>',
        'Add app.ts',
      );

      // Ensure main branch exists and is not the one we are making non-existent
      const initialBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf8',
      }).trim();
      if (initialBranch !== 'main') {
        execSync('git checkout main', { cwd: testRepoPath }); // Ensure we are on main if it exists
      } else {
        // If already on main, good.
      }

      const result = runTayloredCommand(
        testRepoPath,
        '--automatic ts non_existent_branch',
      );
      // For non-compute blocks, the target branch ('non_existent_branch') is not used for diff generation.
      // The diff is against 'originalBranchName' (main).
      // With the newline fix in createFileAndCommit, the diff purity check should pass.
      expect(result.status).toBe(0);
      expect(result.stderr).toBe(''); // No critical errors expected
      const expectedTayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `1${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedTayloredFilePath}`,
      );
      expect(fs.existsSync(expectedTayloredFilePath)).toBe(true);
      const branches = execSync('git branch', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).not.toContain('temp-taylored-');
      // Ensure we are back on the original branch (main in this setup)
      const currentBranchAfter = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf8',
      }).trim();
      expect(currentBranchAfter).toBe('main');
    });
  });

  describe('Exclude Functionality', () => {
    let testRepoPath: string;
    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('Correctly excludes specified directories and their subdirectories', () => {
      testRepoPath = setupTestRepo('automatic_exclude_dirs');

      // Create files with taylored blocks, ensuring all end with a newline
      createFileAndCommit(
        testRepoPath,
        'file1.js',
        '// Root file\n// <taylored number="1">\n// Block 1 content\n// </taylored>\n',
        'Add file1.js',
      );

      createFileAndCommit(
        testRepoPath,
        path.join('excluded_dir1', 'file2.js'),
        '// Excluded dir1 file\n// <taylored number="2">\n// Block 2 content\n// </taylored>\n',
        'Add file2.js in excluded_dir1',
      );
      createFileAndCommit(
        testRepoPath,
        path.join('excluded_dir1', 'sub_excluded_dir', 'file_in_sub.js'),
        '// Sub Excluded dir1 file\n// <taylored number="5">\n// Block 5 content\n// </taylored>\n',
        'Add file_in_sub.js in excluded_dir1/sub_excluded_dir',
      );

      createFileAndCommit(
        testRepoPath,
        path.join('not_excluded_dir', 'file3.js'),
        '// Not excluded dir file\n// <taylored number="3">\n// Block 3 content\n// </taylored>\n',
        'Add file3.js in not_excluded_dir',
      );

      createFileAndCommit(
        testRepoPath,
        path.join('excluded_dir2', 'file4.js'),
        '// Excluded dir2 file\n// <taylored number="4">\n// Block 4 content\n// </taylored>\n',
        'Add file4.js in excluded_dir2',
      );

      // Run the taylored command with --exclude
      // Assuming 'main' is the default branch after setupTestRepo
      const result = runTayloredCommand(
        testRepoPath,
        '--automatic js main --exclude excluded_dir1,excluded_dir2',
      );

      expect(result.status).toBe(0);
      // Check stderr for any unexpected errors, though stdout will have processing messages
      // Allow for "Successfully created" messages but not errors.
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith('Processing block') &&
            !line.startsWith('Successfully created'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');

      const tayloredBaseDir = path.join(testRepoPath, TAYLORED_DIR_NAME);

      // Assertions for created files
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `1${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(true);
      const content1 = fs.readFileSync(
        path.join(tayloredBaseDir, `1${TAYLORED_FILE_EXTENSION}`),
        'utf8',
      );
      expect(content1).toContain('-// <taylored number="1">');

      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `3${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(true);
      const content3 = fs.readFileSync(
        path.join(tayloredBaseDir, `3${TAYLORED_FILE_EXTENSION}`),
        'utf8',
      );
      expect(content3).toContain('-// <taylored number="3">');

      // Assertions for NOT created files
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `2${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(false); // From excluded_dir1
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `5${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(false); // From excluded_dir1/sub_excluded_dir
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `4${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(false); // From excluded_dir2

      // Verify stdout contains messages for processed blocks (1 and 3)
      const expectedSuccessMessage1 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `1${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage1}`,
      );
      const expectedSuccessMessage3 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `3${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage3}`,
      );

      // Verify stdout does NOT contain messages for excluded blocks (2, 4, 5)
      const unexpectedSuccessMessage2 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `2${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).not.toContain(
        `Successfully created ${unexpectedSuccessMessage2}`,
      );
      const unexpectedSuccessMessage4 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `4${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).not.toContain(
        `Successfully created ${unexpectedSuccessMessage4}`,
      );
      const unexpectedSuccessMessage5 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `5${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).not.toContain(
        `Successfully created ${unexpectedSuccessMessage5}`,
      );

      // Verify original files are untouched
      expect(
        fs.readFileSync(path.join(testRepoPath, 'file1.js'), 'utf8'),
      ).toContain('// <taylored number="1">');
      expect(
        fs.readFileSync(
          path.join(testRepoPath, 'excluded_dir1', 'file2.js'),
          'utf8',
        ),
      ).toContain('// <taylored number="2">');
      expect(
        fs.readFileSync(
          path.join(
            testRepoPath,
            'excluded_dir1',
            'sub_excluded_dir',
            'file_in_sub.js',
          ),
          'utf8',
        ),
      ).toContain('// <taylored number="5">');
      expect(
        fs.readFileSync(
          path.join(testRepoPath, 'not_excluded_dir', 'file3.js'),
          'utf8',
        ),
      ).toContain('// <taylored number="3">');
      expect(
        fs.readFileSync(
          path.join(testRepoPath, 'excluded_dir2', 'file4.js'),
          'utf8',
        ),
      ).toContain('// <taylored number="4">');

      // Verify no temporary branches are left
      const branches = execSync('git branch', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).not.toContain('temp-taylored-');
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf8',
      }).trim();
      expect(currentBranch).toBe('main');
    });

    test('Exclude with non-existent directory: should not error and process other files', () => {
      testRepoPath = setupTestRepo('automatic_exclude_non_existent');
      createFileAndCommit(
        testRepoPath,
        'real_file.js',
        '// <taylored number="77">\n// Block 77\n// </taylored>',
        'Add real_file.js',
      );

      const result = runTayloredCommand(
        testRepoPath,
        '--automatic js main --exclude non_existent_dir,another_fake',
      );

      expect(result.status).toBe(0);
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith('Processing block') &&
            !line.startsWith('Successfully created'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');

      const tayloredBaseDir = path.join(testRepoPath, TAYLORED_DIR_NAME);
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `77${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(true);
      const expectedSuccessMessage77 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `77${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage77}`,
      );
    });

    test('Exclude with empty string: should process all files (no exclusion)', () => {
      testRepoPath = setupTestRepo('automatic_exclude_empty_string');
      createFileAndCommit(
        testRepoPath,
        'fileA.js',
        '// <taylored number="88">\n// Block 88\n// </taylored>',
        'Add fileA.js',
      );
      createFileAndCommit(
        testRepoPath,
        path.join('dir_b', 'fileB.js'),
        '// <taylored number="99">\n// Block 99\n// </taylored>',
        'Add fileB.js',
      );

      const result = runTayloredCommand(
        testRepoPath,
        '--automatic js main --exclude ""',
      );

      expect(result.status).toBe(0);
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            !line.startsWith('Processing block') &&
            !line.startsWith('Successfully created'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');

      const tayloredBaseDir = path.join(testRepoPath, TAYLORED_DIR_NAME);
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `88${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(true);
      expect(
        fs.existsSync(
          path.join(tayloredBaseDir, `99${TAYLORED_FILE_EXTENSION}`),
        ),
      ).toBe(true);

      const expectedSuccessMessage88 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `88${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage88}`,
      );
      const expectedSuccessMessage99 = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `99${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedSuccessMessage99}`,
      );
    });
  });

  describe('New number Attribute and Old Format Handling', () => {
    let testRepoPath: string;
    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('Successfully parses new `number` attribute', () => {
      testRepoPath = setupTestRepo('new_number_attribute');
      const fileContent = `// File with new number attribute
// <taylored number="789">
// Simple content for block 789
// </taylored>
// After block`;
      createFileAndCommit(
        testRepoPath,
        'src/app.js',
        fileContent,
        'Add app.js with number="789"',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `789${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(true);
      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath, 'utf8'),
      );
      expect(tayloredContent).toContain('-// <taylored number="789">');
      expect(tayloredContent).toContain('-// Simple content for block 789');
      expect(result.stdout).toContain(
        `Successfully created ${tayloredFilePath}`,
      );
    });

    test('Successfully parses `number` attribute with `compute`', () => {
      testRepoPath = setupTestRepo('new_number_with_compute');
      const scriptContentForCompute = `#!/bin/bash
echo "Computed output for 790"`;
      const fileContent = `// File with new number attribute and compute
// <taylored number="790" compute="/*,*/">
/*
${scriptContentForCompute}
*/
// </taylored>
// After compute block`;
      createFileAndCommit(
        testRepoPath,
        'src/app.js',
        fileContent,
        'Add app.js with number="790" and compute',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `790${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(true);
      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath, 'utf8'),
      );
      expect(tayloredContent).toContain('+Computed output for 790');
      expect(tayloredContent).toContain(
        '-// <taylored number="790" compute="/*,*/">',
      ); // Check it's removed
      expect(tayloredContent).not.toContain(
        '+// <taylored number="790" compute="/*,*/">',
      ); // Check it's not added back
      expect(result.stdout).toContain(
        `Successfully created ${tayloredFilePath}`,
      );
    });

    test('Successfully parses `number` attribute with `compute` and `async="true"`', () => {
      testRepoPath = setupTestRepo('new_number_compute_async_true');
      const scriptContentForCompute = `#!/bin/bash
# Simulate some work
sleep 0.1
echo "Async computed output for 791"`;
      const fileContent = `// File with new number, compute, and async="true"
// <taylored number="791" compute="/*,*/" async="true">
/*
${scriptContentForCompute}
*/
// </taylored>
// After async compute block\n`; // Added trailing newline
      createFileAndCommit(
        testRepoPath,
        'src/app_async.js',
        fileContent,
        'Add app_async.js with number="791", compute, async="true"',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `791${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(true);
      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath, 'utf8'),
      );
      expect(tayloredContent).toContain('+Async computed output for 791');
      expect(tayloredContent).toContain(
        '-// <taylored number="791" compute="/*,*/" async="true">',
      );
      expect(tayloredContent).not.toContain(
        '+// <taylored number="791" compute="/*,*/" async="true">',
      );

      // Check for async specific log messages
      expect(result.stdout).toContain(
        `Asynchronously processing computed block 791 from ${path.join(testRepoPath, 'src', 'app_async.js')}`,
      );
      expect(result.stdout).toContain(
        'Executing 1 asynchronous compute block(s) in parallel...',
      );
      expect(result.stdout).toContain(
        `Successfully created ${tayloredFilePath}`,
      ); // This log comes from within processComputeBlock
      expect(result.stdout).toContain(
        'All asynchronous tasks have completed. Succeeded: 1, Failed: 0.',
      );
      expect(result.stdout).toMatch(
        /Finished processing. Initiated \d+ taylored block\(s\). See async summary for completion details./,
      );

      const originalFileContent = normalizeLineEndings(
        fs.readFileSync(path.join(testRepoPath, 'src/app_async.js'), 'utf8'),
      );
      expect(originalFileContent).toBe(normalizeLineEndings(fileContent));

      const branches = execSync('git branch', {
        cwd: testRepoPath,
        encoding: 'utf8',
      });
      expect(branches).not.toContain('temp-taylored-compute-');
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: testRepoPath,
        encoding: 'utf8',
      }).trim();
      expect(currentBranch).toBe('main');
    });

    test('Ignores block with old positional number format', () => {
      testRepoPath = setupTestRepo('old_format_ignored');
      const fileContent = `// File with old format
// <taylored 111>
// Old format content
// </taylored>
// After old block`;
      createFileAndCommit(
        testRepoPath,
        'src/app.js',
        fileContent,
        'Add app.js with old format 111',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `111${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(false); // File should NOT be created
      expect(result.stdout).toContain(
        'No taylored blocks found matching the criteria',
      );
    });

    test('Ignores block with missing `number` attribute but with `compute`', () => {
      testRepoPath = setupTestRepo('missing_number_with_compute');
      const fileContent = `// File with compute but no number
// <taylored compute="/*,*/">
/*
#!/usr/bin/env node
console.log("This should not be processed");
*/
// </taylored>
// After block`;
      createFileAndCommit(
        testRepoPath,
        'src/app.js',
        fileContent,
        'Add app.js with compute, no number',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      // No taylored files should be created as the regex won't match
      const tayloredDirContents = fs.readdirSync(
        path.join(testRepoPath, TAYLORED_DIR_NAME),
      );
      expect(tayloredDirContents.length).toBe(0);
      expect(result.stdout).toContain(
        'No taylored blocks found matching the criteria',
      );
    });

    test('Ignores block with empty `number` attribute', () => {
      testRepoPath = setupTestRepo('empty_number_attribute');
      const fileContent = `// File with empty number attribute
// <taylored number="">
// Content for empty number
// </taylored>
// After block`;
      createFileAndCommit(
        testRepoPath,
        'src/app.js',
        fileContent,
        'Add app.js with number=""',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const tayloredDirContents = fs.readdirSync(
        path.join(testRepoPath, TAYLORED_DIR_NAME),
      );
      expect(tayloredDirContents.length).toBe(0);
      expect(result.stdout).toContain(
        'No taylored blocks found matching the criteria',
      );
    });

    test('Ignores block with non-numeric `number` attribute', () => {
      testRepoPath = setupTestRepo('non_numeric_number_attribute');
      const fileContent = `// File with non-numeric number attribute
// <taylored number="abc">
// Content for non-numeric number
// </taylored>
// After block`;
      createFileAndCommit(
        testRepoPath,
        'src/app.js',
        fileContent,
        'Add app.js with number="abc"',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
      const tayloredDirContents = fs.readdirSync(
        path.join(testRepoPath, TAYLORED_DIR_NAME),
      );
      expect(tayloredDirContents.length).toBe(0);
      expect(result.stdout).toContain(
        'No taylored blocks found matching the criteria',
      );
    });

    test('Mixed content - processes new format, ignores old format in same file', () => {
      testRepoPath = setupTestRepo('mixed_formats_in_file');
      const scriptContentForCompute = `#!/bin/bash
echo "Computed content for 203"`;
      const fileContent = `// Start of file
// <taylored number="201">
// New format valid content for 201
// </taylored>
// Middle line 1
// <taylored 202>
// Old format invalid content for 202
// </taylored>
// Middle line 2
// <taylored number="203" compute="/*,*/">
/*
${scriptContentForCompute}
*/
// </taylored>
// End of file`;
      createFileAndCommit(
        testRepoPath,
        'src/mixed.js',
        fileContent,
        'Add mixed.js with various formats',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');

      const tayloredDir = path.join(testRepoPath, TAYLORED_DIR_NAME);

      // Check for 201.taylored (new format, no compute)
      const filePath201 = path.join(
        tayloredDir,
        `201${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(filePath201)).toBe(true);
      const content201 = normalizeLineEndings(
        fs.readFileSync(filePath201, 'utf8'),
      );
      expect(content201).toContain('-// <taylored number="201">');
      expect(content201).toContain('-// New format valid content for 201');
      expect(result.stdout).toContain(`Successfully created ${filePath201}`);

      // Check for 203.taylored (new format, with compute)
      const filePath203 = path.join(
        tayloredDir,
        `203${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(filePath203)).toBe(true);
      const content203 = normalizeLineEndings(
        fs.readFileSync(filePath203, 'utf8'),
      );
      expect(content203).toContain('+Computed content for 203');
      expect(content203).toContain(
        '-// <taylored number="203" compute="/*,*/">',
      ); // Check it's removed
      expect(content203).not.toContain(
        '+// <taylored number="203" compute="/*,*/">',
      ); // Check it's not added back
      expect(result.stdout).toContain(`Successfully created ${filePath203}`);

      // Check that 202.taylored was NOT created (old format)
      const filePath202 = path.join(
        tayloredDir,
        `202${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(filePath202)).toBe(false);
      expect(result.stdout).not.toContain(`202${TAYLORED_FILE_EXTENSION}`);

      expect(result.stdout).toMatch(
        /Successfully created \d+ taylored file\(s\)\./,
      );
    });
  });

  describe('Disabled Attribute Functionality', () => {
    let testRepoPath: string;

    beforeEach(() => {
      // Create a unique subdirectory for each test to ensure isolation
      const currentTestNameFromState = expect.getState().currentTestName;
      // Sanitize the test name: replace spaces with underscores and remove/replace problematic characters like quotes.
      const sanitizedTestName = (
        currentTestNameFromState || 'unknown_test_name'
      )
        .replace(/\s+/g, '_')
        .replace(/"/g, '') // Remove double quotes
        .replace(/'/g, ''); // Remove single quotes
      testRepoPath = setupTestRepo(`disabled_attr_${sanitizedTestName}`);
    });

    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    test('Scenario 1: disabled="true" with compute script - skips block and prevents side effects', () => {
      const disabledContent = `// disabled.ts
// <taylored number="101" disabled="true" compute="/*,*/">
/*
#!/usr/bin/env node
console.log("This should NOT be executed or appear in any patch.");
require('fs').writeFileSync('DO_NOT_CREATE.txt', 'created by disabled block');
*/
// </taylored>`;
      createFileAndCommit(
        testRepoPath,
        'disabled.ts',
        disabledContent,
        'Add disabled.ts',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).toBe(0); // Command should complete successfully

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `101${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(false); // .taylored file should NOT be created

      const sideEffectFilePath = path.join(testRepoPath, 'DO_NOT_CREATE.txt'); // Changed this line, it was duplicated below.
      expect(fs.existsSync(sideEffectFilePath)).toBe(false); // Side effect file should NOT be created

      expect(result.stdout).toContain('Skipping disabled block 101 from'); // Also check actual stdout
      expect(result.status).toBe(0); // Expect command to complete successfully
    });

    test('Scenario 2: disabled="false" - processes block normally', () => {
      const notDisabledContent = `// not-disabled.ts
// <taylored number="102" disabled="false">
// This block should be processed.
export const processed = true;
// </taylored>`;
      createFileAndCommit(
        testRepoPath,
        'not-disabled.ts',
        notDisabledContent,
        'Add not-disabled.ts',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).toBe(0);

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `102${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(true); // .taylored file SHOULD be created

      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath, 'utf8'),
      );
      expect(tayloredContent).toMatch(/--- a\/not-disabled.ts/);
      expect(tayloredContent).toContain(
        '-// <taylored number="102" disabled="false">',
      );
      expect(tayloredContent).toContain('-// This block should be processed.');
      expect(tayloredContent).toContain('-export const processed = true;');
      expect(tayloredContent).toContain('-// </taylored>');
      expect(result.stdout).not.toContain('Skipping disabled block 102');
      expect(result.stderr).toBe(''); // No critical errors expected
    });

    test('Scenario 3: disabled attribute absent - processes block normally', () => {
      const defaultDisabledContent = `// default-disabled.ts
// <taylored number="103">
// This block should also be processed by default.
export const defaultProcessed = true;
// </taylored>`;
      createFileAndCommit(
        testRepoPath,
        'default-disabled.ts',
        defaultDisabledContent,
        'Add default-disabled.ts',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).toBe(0);

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `103${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(true); // .taylored file SHOULD be created

      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(tayloredFilePath, 'utf8'),
      );
      expect(tayloredContent).toMatch(/--- a\/default-disabled.ts/);
      expect(tayloredContent).toContain('-// <taylored number="103">');
      expect(tayloredContent).toContain(
        '-// This block should also be processed by default.',
      );
      expect(tayloredContent).toContain(
        '-export const defaultProcessed = true;',
      );
      expect(tayloredContent).toContain('-// </taylored>');
      expect(result.stdout).not.toContain('Skipping disabled block 103');
      expect(result.stderr).toBe(''); // No critical errors expected
    });

    test('Scenario 4: disabled="true" for static block - skips block', () => {
      const disabledStaticContent = `// disabled-static.ts
// <taylored number="104" disabled="true">
// This static block should be skipped.
export const staticSkipped = true;
// </taylored>`;
      createFileAndCommit(
        testRepoPath,
        'disabled-static.ts',
        disabledStaticContent,
        'Add disabled-static.ts',
      );

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).toBe(0);

      const tayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `104${TAYLORED_FILE_EXTENSION}`,
      );
      expect(fs.existsSync(tayloredFilePath)).toBe(false); // .taylored file should NOT be created

      expect(result.stdout).toContain('Skipping disabled block 104 from');
      expect(result.status).toBe(0); // Expect command to complete successfully
    });
  });
});

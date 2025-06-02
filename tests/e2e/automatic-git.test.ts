import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithBufferEncoding } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../../lib/constants'; // Adjust path if necessary

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../..');
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
const TEMP_TEST_DIR_BASE = path.join(PROJECT_ROOT_PATH, 'temp_e2e_automatic_git');

// Helper to normalize line endings for consistent comparisons
const normalizeLineEndings = (str: string): string => str.replace(/\r\n/g, '\n');

// Helper to run taylored command
const runTayloredCommand = (repoPath: string, args: string): { stdout: string; stderr: string; status: number | null } => {
  try {
    const stdout = execSync(`${TAYLORED_CMD_BASE} ${args}`, { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' });
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
  fs.mkdirSync(repoPath, { recursive: true });

  const execOpts: ExecSyncOptionsWithBufferEncoding = { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' };
  execSync('git init -b main', execOpts);
  execSync('git config user.name "Test User"', execOpts);
  execSync('git config user.email "test@example.com"', execOpts);
  execSync('git config commit.gpgsign false', execOpts); 

  fs.writeFileSync(path.join(repoPath, 'initial.txt'), 'Initial commit');
  execSync('git add initial.txt', execOpts);
  execSync('git commit -m "Initial commit"', execOpts);
  return repoPath;
};

// Helper to create a file and commit it
const createFileAndCommit = (repoPath: string, relativeFilePath: string, content: string, commitMessage: string): void => {
  const fullFilePath = path.join(repoPath, relativeFilePath);
  const dirName = path.dirname(fullFilePath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  fs.writeFileSync(fullFilePath, content);
  const execOpts: ExecSyncOptionsWithBufferEncoding = { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' };
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
    // beforeEach and afterEach for individual test cleanup within this describe block
    afterEach(() => {
        if (testRepoPath && fs.existsSync(testRepoPath)) {
            fs.rmSync(testRepoPath, { recursive: true, force: true });
        }
    });

    test('Clean Git State: Fails if uncommitted changes exist', () => {
      testRepoPath = setupTestRepo('clean_state_uncommitted');
      // Create an initial file and commit it, so 'main' branch is not empty
      createFileAndCommit(testRepoPath, 'committed_file.txt', 'initial content', 'Initial commit of a file');
      // Now make an uncommitted change
      fs.writeFileSync(path.join(testRepoPath, 'committed_file.txt'), 'changed content'); 
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("CRITICAL ERROR: Uncommitted changes or untracked files in the repository.");
    });

    test('Clean Git State: Fails if untracked files exist', () => {
      testRepoPath = setupTestRepo('clean_state_untracked');
      fs.writeFileSync(path.join(testRepoPath, 'untracked_file.txt'), 'untracked content'); 
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("CRITICAL ERROR: Uncommitted changes or untracked files in the repository.");
    });
    
    test('Intermediate .taylored/main.taylored Must Not Exist: Fails if it exists', () => {
      testRepoPath = setupTestRepo('main_taylored_exists');
      const tayloredDirPath = path.join(testRepoPath, TAYLORED_DIR_NAME);
      fs.mkdirSync(tayloredDirPath, { recursive: true });
      fs.writeFileSync(path.join(tayloredDirPath, `main${TAYLORED_FILE_EXTENSION}`), 'dummy content');
      
      createFileAndCommit(testRepoPath, 'src/app.ts', '// <taylored 1>block</taylored>', 'Add app.ts');
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`CRITICAL ERROR: Intermediate file ${path.join(TAYLORED_DIR_NAME, `main${TAYLORED_FILE_EXTENSION}`)} already exists`);
    });

    test('Target .taylored/NUMERO.taylored Must Not Exist: Fails if it exists', () => {
      testRepoPath = setupTestRepo('numero_taylored_exists');
      const tayloredDirPath = path.join(testRepoPath, TAYLORED_DIR_NAME);
      fs.mkdirSync(tayloredDirPath, { recursive: true });
      fs.writeFileSync(path.join(tayloredDirPath, `1${TAYLORED_FILE_EXTENSION}`), 'dummy content');
      
      createFileAndCommit(testRepoPath, 'src/app.ts', '// <taylored 1>block</taylored>', 'Add app.ts');
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(`CRITICAL ERROR: Target file ${path.join(TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`)} already exists`);
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
// <taylored 42>
// This is block 42
// It has two lines
// <taylored>
// Line 6`;
      createFileAndCommit(testRepoPath, 'src/app.ts', appTsContent, 'Add app.ts with block 42');

      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      
      expect(result.stderr).toBe(''); // No errors
      expect(result.status).toBe(0);
      expect(result.stdout).toContain(`Successfully created ${path.join(TAYLORED_DIR_NAME, `42${TAYLORED_FILE_EXTENSION}`)}`);

      const tayloredFilePath = path.join(testRepoPath, TAYLORED_DIR_NAME, `42${TAYLORED_FILE_EXTENSION}`);
      expect(fs.existsSync(tayloredFilePath)).toBe(true);

      const tayloredContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));
      // Diff is from temp-branch (block removed) to main (block present)
      // So it should show the block being added.
      const expectedDiff = `diff --git a/src/app.ts b/src/app.ts
index f511a77..dd325b8 100644
--- a/src/app.ts
+++ b/src/app.ts
@@ -1,2 +1,6 @@
 // Line 1
+// <taylored 42>
+// This is block 42
+// It has two lines
+// <taylored>
 // Line 6
`;
      // We need to be careful about the index hashes (f511a77..dd325b8), they will change.
      // Let's check for the essential parts: file names and added lines.
      expect(tayloredContent).toMatch(/--- a\/src\/app.ts/);
      expect(tayloredContent).toMatch(/\+\+\+ b\/src\/app.ts/);
      expect(tayloredContent).toContain(`+// <taylored 42>`);
      expect(tayloredContent).toContain(`+// This is block 42`);
      expect(tayloredContent).toContain(`+// It has two lines`);
      expect(tayloredContent).toContain(`+// <taylored>`);
      expect(tayloredContent).toContain(` // Line 1`); // Context line
      expect(tayloredContent).toContain(` // Line 6`); // Context line

      // Assert original file is unchanged on main branch
      const originalFileContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, 'src/app.ts'), 'utf8'));
      expect(originalFileContent).toBe(normalizeLineEndings(appTsContent));

      // Assert no temporary branches remain
      const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
      expect(branches).not.toContain('temp-taylored-');

      // Assert current branch is main
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
      expect(currentBranch).toBe('main');
    });

    test('Multiple Blocks: Correctly extracts all blocks', () => {
        testRepoPath = setupTestRepo('successful_multiple_blocks');
        const serviceJsContent = `// Service Start\n// <taylored 1>const service = "alpha";\n// <taylored>\n// Service End`;
        createFileAndCommit(testRepoPath, 'src/service.js', serviceJsContent, 'Add service.js');
        
        const utilsJsContent = `// Utils Start\n// <taylored 2>const utilOne = 1;\n// <taylored>\n// Middle Code\n// <taylored 3>const utilTwo = 2;\n// <taylored>\n// Utils End`;
        createFileAndCommit(testRepoPath, 'src/utils.js', utilsJsContent, 'Add utils.js');

        const result = runTayloredCommand(testRepoPath, '--automatic js');
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');

        expect(fs.existsSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`))).toBe(true);
        expect(fs.existsSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `2${TAYLORED_FILE_EXTENSION}`))).toBe(true);
        expect(fs.existsSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `3${TAYLORED_FILE_EXTENSION}`))).toBe(true);
        
        const content1 = fs.readFileSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`), 'utf8');
        expect(content1).toContain('+// <taylored 1>');
        expect(content1).toContain('+// const service = "alpha";');
        expect(content1).toContain('+// <taylored>');

        const content2 = fs.readFileSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `2${TAYLORED_FILE_EXTENSION}`), 'utf8');
        expect(content2).toContain('+// <taylored 2>');
        expect(content2).toContain('+// const utilOne = 1;');
        expect(content2).toContain('+// <taylored>');
        
        const content3 = fs.readFileSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `3${TAYLORED_FILE_EXTENSION}`), 'utf8');
        expect(content3).toContain('+// <taylored 3>');
        expect(content3).toContain('+// const utilTwo = 2;');
        expect(content3).toContain('+// <taylored>');
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
      createFileAndCommit(testRepoPath, 'src/app.ts', '// No markers here', 'Add app.ts without markers');
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      expect(result.status).toBe(0); // Command succeeds but finds nothing
      expect(result.stdout).toContain("No taylored blocks found matching the criteria");
      
      const tayloredDirContents = fs.readdirSync(path.join(testRepoPath, TAYLORED_DIR_NAME));
      expect(tayloredDirContents.length).toBe(0); // .taylored should be empty
    });

    test('Error during handleSaveOperation (e.g., main branch missing)', () => {
      testRepoPath = setupTestRepo('error_save_operation');
      // Setup: Create repo, add a file with a block, but then delete 'main' branch (or rename)
      createFileAndCommit(testRepoPath, 'src/app.ts', '// <taylored 1>block</taylored>', 'Add app.ts');
      execSync('git branch -m main feature-branch', { cwd: testRepoPath }); // Rename main so handleSaveOperation fails

      const result = runTayloredCommand(testRepoPath, '--automatic ts');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Failed to process block 1"); // General error from automatic_handler
      // More specific error from save-handler about diffing against 'main'
      expect(result.stderr).toMatch(/fatal: ambiguous argument 'main'|unknown revision or path not in the working tree/i);

      // Check for cleanup
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
      expect(currentBranch).toBe('feature-branch'); // Should have switched back
      const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
      expect(branches).not.toContain('temp-taylored-'); 
    });
  });
});

import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding, ExecSyncOptionsWithBufferEncoding } from 'child_process'; // Import both
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

  const execOpts: ExecSyncOptionsWithStringEncoding = { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' }; 
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
  const execOpts: ExecSyncOptionsWithStringEncoding = { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' }; 
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
      createFileAndCommit(testRepoPath, 'committed_file.txt', 'initial content', 'Initial commit of a file');
      fs.writeFileSync(path.join(testRepoPath, 'committed_file.txt'), 'changed content'); 
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("CRITICAL ERROR: Uncommitted changes or untracked files in the repository.");
    });

    test('Clean Git State: Fails if untracked files exist', () => {
      testRepoPath = setupTestRepo('clean_state_untracked');
      fs.writeFileSync(path.join(testRepoPath, 'untracked_file.txt'), 'untracked content'); 
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("CRITICAL ERROR: Uncommitted changes or untracked files in the repository.");
    });
    
    test('Intermediate .taylored/main.taylored Must Not Exist: Fails if it exists', () => {
      testRepoPath = setupTestRepo('main_taylored_exists');
      createFileAndCommit(testRepoPath, 'src/app.ts', '// File content\n// <taylored 1>\n// block\n// </taylored>', 'Add app.ts');
      
      const tayloredDirPath = path.join(testRepoPath, TAYLORED_DIR_NAME);
      fs.mkdirSync(tayloredDirPath, { recursive: true });
      // Create AND commit the conflicting file to pass the "dirty repo" check
      createFileAndCommit(testRepoPath, path.join(TAYLORED_DIR_NAME, `main${TAYLORED_FILE_EXTENSION}`), 'dummy content', 'add main.taylored');
            
      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      if (result.status === 0) {
        console.log("Test 'Intermediate .taylored/main.taylored Must Not Exist' unexpectedly got status 0.");
        console.log("STDOUT:", result.stdout);
        console.log("STDERR:", result.stderr);
      }
      // Application should exit with non-zero status on this critical error.
      expect(result.status).not.toBe(0); 
      expect(result.stderr).toMatch(/CRITICAL ERROR: Intermediate file .*main\.taylored already exists/);
    });

    test('Target .taylored/NUMERO.taylored Must Not Exist: Fails if it exists', () => {
      testRepoPath = setupTestRepo('numero_taylored_exists');
      createFileAndCommit(testRepoPath, 'src/app.ts', '// File content\n// <taylored 1>\n// block\n// </taylored>', 'Add app.ts');

      const tayloredDirPath = path.join(testRepoPath, TAYLORED_DIR_NAME);
      fs.mkdirSync(tayloredDirPath, { recursive: true });
      // Create AND commit the conflicting file
      createFileAndCommit(testRepoPath, path.join(TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`), 'dummy content', 'add 1.taylored');
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      if (result.status === 0) {
        console.log("Test 'Target .taylored/NUMERO.taylored Must Not Exist' unexpectedly got status 0.");
        console.log("STDOUT:", result.stdout);
        console.log("STDERR:", result.stderr);
      }
      // Application should exit with non-zero status on this critical error.
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/CRITICAL ERROR: Target file \S*1\.taylored already exists/);
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
// </taylored>
// Line 6`;
      createFileAndCommit(testRepoPath, 'src/app.ts', appTsContent, 'Add app.ts with block 42');

      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      
      expect(result.stderr).toBe(''); 
      expect(result.status).toBe(0);
      const expectedSuccessMessagePath = path.join(testRepoPath, TAYLORED_DIR_NAME, `42${TAYLORED_FILE_EXTENSION}`);
      expect(result.stdout).toContain(`Successfully created ${expectedSuccessMessagePath}`);

      const tayloredFilePath = path.join(testRepoPath, TAYLORED_DIR_NAME, `42${TAYLORED_FILE_EXTENSION}`);
      expect(fs.existsSync(tayloredFilePath)).toBe(true);

      const tayloredContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));
      expect(tayloredContent).toMatch(/--- a\/src\/app.ts/);
      expect(tayloredContent).toMatch(/\+\+\+ b\/src\/app.ts/);
      expect(tayloredContent).toContain(`+// <taylored 42>`);
      expect(tayloredContent).toContain(`+// This is block 42`);
      expect(tayloredContent).toContain(`+// It has two lines`);
      expect(tayloredContent).toContain(`+// </taylored>`);
      expect(tayloredContent).toContain(` // Line 1`); 
      expect(tayloredContent).toContain(` // Line 6`); 

      const originalFileContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, 'src/app.ts'), 'utf8'));
      expect(originalFileContent).toBe(normalizeLineEndings(appTsContent));

      const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
      expect(branches).not.toContain('temp-taylored-');

      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
      expect(currentBranch).toBe('main');
    });

    test('Multiple Blocks: Correctly extracts all blocks', () => {
        testRepoPath = setupTestRepo('successful_multiple_blocks');
        const serviceJsContent = `// Service Start\n// <taylored 1>const service = "alpha";\n// </taylored>\n// Service End`;
        createFileAndCommit(testRepoPath, 'src/service.js', serviceJsContent, 'Add service.js');
        
        const utilsJsContent = `// Utils Start\n// <taylored 2>const utilOne = 1;\n// </taylored>\n// Middle Code\n// <taylored 3>const utilTwo = 2;\n// </taylored>\n// Utils End`;
        createFileAndCommit(testRepoPath, 'src/utils.js', utilsJsContent, 'Add utils.js');

        const result = runTayloredCommand(testRepoPath, '--automatic js main');
        expect(result.status).toBe(0);
        expect(result.stderr).toBe('');

        expect(fs.existsSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`))).toBe(true);
        expect(fs.existsSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `2${TAYLORED_FILE_EXTENSION}`))).toBe(true);
        expect(fs.existsSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `3${TAYLORED_FILE_EXTENSION}`))).toBe(true);
        
        const content1 = fs.readFileSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`), 'utf8');
        expect(content1).toContain('+// <taylored 1>const service = "alpha";'); // Corrected assertion
        
        const content2 = fs.readFileSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `2${TAYLORED_FILE_EXTENSION}`), 'utf8');
        expect(content2).toContain('+// <taylored 2>const utilOne = 1;'); // Corrected assertion
        
        const content3 = fs.readFileSync(path.join(testRepoPath, TAYLORED_DIR_NAME, `3${TAYLORED_FILE_EXTENSION}`), 'utf8');
        expect(content3).toContain('+// <taylored 3>const utilTwo = 2;'); // Corrected assertion
    });

    test('Multiple Extensions: Correctly extracts blocks from files with different specified extensions', () => {
      testRepoPath = setupTestRepo('successful_multiple_extensions');
      const tsContent = `// TS file
// <taylored 101>
const tsVar: string = "typescript";
// </taylored>
console.log(tsVar);`;
      createFileAndCommit(testRepoPath, 'src/app.ts', tsContent, 'Add app.ts with block 101');

      const jsContent = `// JS file
// <taylored 102>
var jsVar = "javascript";
// </taylored>
console.log(jsVar);`;
      createFileAndCommit(testRepoPath, 'src/component.js', jsContent, 'Add component.js with block 102');

      // Run taylored for both .ts and .js extensions
      const result = runTayloredCommand(testRepoPath, '--automatic ts,js main');

      expect(result.stderr).toBe('');
      expect(result.status).toBe(0);

      const expectedSuccessMessage101 = path.join(testRepoPath, TAYLORED_DIR_NAME, `101${TAYLORED_FILE_EXTENSION}`);
      expect(result.stdout).toContain(`Successfully created ${expectedSuccessMessage101}`);
      const expectedSuccessMessage102 = path.join(testRepoPath, TAYLORED_DIR_NAME, `102${TAYLORED_FILE_EXTENSION}`);
      expect(result.stdout).toContain(`Successfully created ${expectedSuccessMessage102}`);

      const tayloredFilePath101 = path.join(testRepoPath, TAYLORED_DIR_NAME, `101${TAYLORED_FILE_EXTENSION}`);
      expect(fs.existsSync(tayloredFilePath101)).toBe(true);
      const tayloredContent101 = normalizeLineEndings(fs.readFileSync(tayloredFilePath101, 'utf8'));
      expect(tayloredContent101).toMatch(/--- a\/src\/app.ts/);
      expect(tayloredContent101).toMatch(/\+\+\+ b\/src\/app.ts/);
      expect(tayloredContent101).toContain(`+// <taylored 101>`);
      expect(tayloredContent101).toContain(`+const tsVar: string = "typescript";`);
      expect(tayloredContent101).toContain(`+// </taylored>`);
      expect(tayloredContent101).toContain(` console.log(tsVar);`);

      const tayloredFilePath102 = path.join(testRepoPath, TAYLORED_DIR_NAME, `102${TAYLORED_FILE_EXTENSION}`);
      expect(fs.existsSync(tayloredFilePath102)).toBe(true);
      const tayloredContent102 = normalizeLineEndings(fs.readFileSync(tayloredFilePath102, 'utf8'));
      expect(tayloredContent102).toMatch(/--- a\/src\/component.js/);
      expect(tayloredContent102).toMatch(/\+\+\+ b\/src\/component.js/);
      expect(tayloredContent102).toContain(`+// <taylored 102>`);
      expect(tayloredContent102).toContain(`+var jsVar = "javascript";`);
      expect(tayloredContent102).toContain(`+// </taylored>`);
      expect(tayloredContent102).toContain(` console.log(jsVar);`);

      // Verify original files are untouched
      const originalTsFileContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, 'src/app.ts'), 'utf8'));
      expect(originalTsFileContent).toBe(normalizeLineEndings(tsContent));
      const originalJsFileContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, 'src/component.js'), 'utf8'));
      expect(originalJsFileContent).toBe(normalizeLineEndings(jsContent));

      // Verify no temporary branches are left
      const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
      expect(branches).not.toContain('temp-taylored-');
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
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
      createFileAndCommit(testRepoPath, 'src/app.ts', '// No markers here', 'Add app.ts without markers');
      
      const result = runTayloredCommand(testRepoPath, '--automatic ts main');
      expect(result.status).toBe(0); 
      expect(result.stdout).toContain("No taylored blocks found matching the criteria");
      
      const tayloredDirContents = fs.readdirSync(path.join(testRepoPath, TAYLORED_DIR_NAME));
      expect(tayloredDirContents.length).toBe(0); 
    });

    test('Error during handleSaveOperation (e.g., specified branch missing)', () => {
      testRepoPath = setupTestRepo('error_save_non_existent_branch');
      createFileAndCommit(testRepoPath, 'src/app.ts', '// File content\n// <taylored 1>\n// block\n// </taylored>', 'Add app.ts');

      // Ensure main branch exists and is not the one we are making non-existent
      const initialBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
      if (initialBranch !== 'main') {
        execSync('git checkout main', { cwd: testRepoPath }); // Ensure we are on main if it exists
      } else {
        // If already on main, good.
      }

      const result = runTayloredCommand(testRepoPath, '--automatic ts non_existent_branch');
      if (result.status === 0) {
        console.log("Test 'Error during handleSaveOperation (e.g., specified branch missing)' unexpectedly got status 0.");
        console.log("STDOUT:", result.stdout);
        console.log("STDERR:", result.stderr);
      }
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain("Failed to process block 1"); 
      // Check for an error message indicating the non_existent_branch is the issue
      expect(result.stderr).toMatch(/fatal: ambiguous argument 'non_existent_branch'|unknown revision or path not in the working tree|'non_existent_branch' is not a valid branch name/i);

      const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
      expect(branches).not.toContain('temp-taylored-');
      // Ensure we are back on the original branch (main in this setup)
      const currentBranchAfter = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
      expect(currentBranchAfter).toBe('main');
    });
  });
});

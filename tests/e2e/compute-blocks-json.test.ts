import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import {
  TAYLORED_DIR_NAME,
  TAYLORED_FILE_EXTENSION,
} from '../../lib/constants';

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../..');
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
const TEMP_TEST_DIR_BASE = path.join(
  PROJECT_ROOT_PATH,
  'temp_e2e_compute_blocks',
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
    // Run the command and capture stdout. Stderr is piped to stdout for compute blocks.
    const stdout = execSync(`${TAYLORED_CMD_BASE} ${args}`, {
      cwd: repoPath,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    return { stdout, stderr: '', status: 0 };
  } catch (error: any) {
    return {
      stdout: error.stdout?.toString() || '',
      stderr: error.stderr?.toString() || '', // Stderr might still be useful for CLI errors
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

  const execOpts: ExecSyncOptionsWithStringEncoding = {
    cwd: repoPath,
    encoding: 'utf8',
    stdio: 'pipe',
  };

  execSync('git init -b main', execOpts);
  execSync('git config user.name "Test User"', execOpts);
  execSync('git config user.email "test@example.com"', execOpts);
  execSync('git config commit.gpgsign false', execOpts);

  // Create and commit an initial file
  const initialFileContent =
    '// Initial commit content for compute block testing\n';
  fs.writeFileSync(path.join(repoPath, 'initial.js'), initialFileContent);
  execSync('git add initial.js', execOpts);
  execSync('git commit -m "Initial commit"', execOpts);
  return repoPath;
};

// Helper to create a file (without committing, useful for compute test files)
const createTestFile = (
  repoPath: string,
  relativeFilePath: string,
  content: string,
): string => {
  const fullFilePath = path.join(repoPath, relativeFilePath);
  const dirName = path.dirname(fullFilePath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  fs.writeFileSync(fullFilePath, content);
  return fullFilePath;
};

describe('Compute Block Tests (JSON)', () => {
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

  describe('Synchronous JSON Compute Block', () => {
    let testRepoPath: string;
    const tayloredBlockNumber = 803;
    // const computeBlockId = "sync-json-id-001"; // Not used by simplified echo

    beforeEach(() => {
      testRepoPath = setupTestRepo('sync_json_test');
      // Single line variable assignment, simple echo for content
      const syncJsonFileContent = `const jsonSyncExample = {"taylored": ${tayloredBlockNumber}, "compute_id": "sync-json-id-001", "compute": "", "async": false, "content": "#!/bin/bash\\necho \\"SYNC_JSON_OUTPUT\\""}; // After block`;
      createTestFile(testRepoPath, 'compute_sync.js', syncJsonFileContent);
      // Commit the file
      execSync('git add compute_sync.js', { cwd: testRepoPath });
      execSync('git commit -m "Add compute_sync.js"', { cwd: testRepoPath });
    });

    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    it('should process a synchronous JSON compute block and replace it with its output in the .taylored file', () => {
      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('failed'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');

      const expectedTayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `${tayloredBlockNumber}${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedTayloredFilePath}`,
      );
      expect(fs.existsSync(expectedTayloredFilePath)).toBe(true);

      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(expectedTayloredFilePath, 'utf8'),
      );
      // Check for removal of the original block (simplified to check for the start of the variable assignment)
      expect(tayloredContent).toContain(
        `-const jsonSyncExample = {"taylored": ${tayloredBlockNumber}, "compute_id": "sync-json-id-001", "compute": "", "async": false, "content": "#!/bin/bash\\necho \\"SYNC_JSON_OUTPUT\\""}; // After block`,
      );

      // Check for the addition of the script's output
      expect(tayloredContent).toMatch(
        /\+SYNC_JSON_OUTPUT\n\+ \/\/ After block/,
      );

      // The "// After block" comment is part of the removed line, so it won't be separately asserted unless the regex changes
    });
  });

  describe('Asynchronous JSON Compute Block', () => {
    let testRepoPath: string;
    const tayloredBlockNumber = 804;
    const asyncDelay = 50; // ms

    beforeEach(() => {
      testRepoPath = setupTestRepo('async_json_test');
      // Single line variable assignment, simple echo for content with sleep
      const asyncJsonFileContent = `const jsonAsyncExample = {"taylored": ${tayloredBlockNumber}, "compute_id": "async-json-id-001", "compute": "", "async": true, "content": "#!/bin/bash\\nsleep ${asyncDelay / 1000}\\necho \\"ASYNC_JSON_OUTPUT\\""}; // After async block`;
      createTestFile(testRepoPath, 'compute_async.js', asyncJsonFileContent);
      // Commit the file
      execSync('git add compute_async.js', { cwd: testRepoPath });
      execSync('git commit -m "Add compute_async.js"', { cwd: testRepoPath });
    });

    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    it('should process an asynchronous JSON compute block and wait for it to complete', () => {
      const startTime = Date.now();
      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.status).toBe(0);
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('failed'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');
      expect(duration).toBeGreaterThanOrEqual(asyncDelay);

      const expectedTayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `${tayloredBlockNumber}${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedTayloredFilePath}`,
      );
      expect(result.stdout).toContain(
        `Asynchronously processing computed block ${tayloredBlockNumber}`,
      );
      expect(result.stdout).toContain('All asynchronous tasks have completed.');

      expect(fs.existsSync(expectedTayloredFilePath)).toBe(true);
      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(expectedTayloredFilePath, 'utf8'),
      );
      // Check for removal
      expect(tayloredContent).toContain(
        `-const jsonAsyncExample = {"taylored": ${tayloredBlockNumber}, "compute_id": "async-json-id-001", "compute": "", "async": true, "content": "#!/bin/bash\\nsleep ${asyncDelay / 1000}\\necho \\"ASYNC_JSON_OUTPUT\\""}; // After async block`,
      );
      // Check for addition
      expect(tayloredContent).toMatch(
        /\+ASYNC_JSON_OUTPUT\n\+ \/\/ After async block/,
      );
    });
  });

  describe('Mixed JSON (Async) and XML (Sync) Compute Blocks', () => {
    let testRepoPath: string;
    const jsonBlockNumber = 805;
    const xmlBlockNumber = 901;
    const mixedAsyncDelay = 500; // Increased delay

    beforeEach(() => {
      testRepoPath = setupTestRepo('mixed_compute_test');

      const asyncJsonFileContent = `const jsonAsyncExampleInMixed = {"taylored": ${jsonBlockNumber}, "compute_id": "async-json-mixed-id-001", "compute": "", "async": true, "content": "#!/bin/bash\\nsleep ${mixedAsyncDelay / 1000}\\necho \\"ASYNC_JSON_MIXED_OUTPUT\\""};`;
      createTestFile(
        testRepoPath,
        'compute_async_mixed.js',
        asyncJsonFileContent,
      );

      const syncXmlFileContent = `// --- XML Compute Block Example (Synchronous) ---
// <taylored number="${xmlBlockNumber}" compute="/*,*/" async="false">
/*
#!/bin/bash
# This is a synchronous shell script for the mixed test.
echo "console.log('This content was generated by a SYNC XML block in the mixed test.');"
*/
// </taylored>`;
      createTestFile(testRepoPath, 'compute_sync_mixed.js', syncXmlFileContent);

      execSync('git add compute_async_mixed.js compute_sync_mixed.js', {
        cwd: testRepoPath,
      });
      execSync(
        'git commit -m "Add separate compute block files for mixed test"',
        { cwd: testRepoPath },
      );
    });

    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    it('should process both JSON (async) and XML (sync) blocks from different files correctly', async () => {
      const startTime = Date.now();
      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      const endTime = Date.now();
      const duration = endTime - startTime;

      expect(result.status).toBe(0);
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('failed'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');
      expect(duration).toBeGreaterThanOrEqual(mixedAsyncDelay);

      const expectedJsonTayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `${jsonBlockNumber}${TAYLORED_FILE_EXTENSION}`,
      );

      // Wait for all async tasks to complete before checking the output
      // This await might not be strictly necessary if the main command already waits,
      // but added for safety in case of race conditions in file system checks.
      await new Promise((resolve) =>
        setTimeout(resolve, mixedAsyncDelay + 200),
      );

      // Check if the JSON taylored file was created and has content
      expect(fs.existsSync(expectedJsonTayloredFilePath)).toBe(true);
      const jsonPatchContent = fs.readFileSync(
        expectedJsonTayloredFilePath,
        'utf-8',
      );
      expect(jsonPatchContent.trim()).not.toBe('');

      expect(result.stdout).toContain(
        `Asynchronously processing computed block ${jsonBlockNumber}`,
      );
      // fs.existsSync and readFileSync were already checked above
      const jsonTayloredContent = normalizeLineEndings(jsonPatchContent); // Use already read content
      expect(jsonTayloredContent).toContain(
        `-const jsonAsyncExampleInMixed = {"taylored": ${jsonBlockNumber}, "compute_id": "async-json-mixed-id-001", "compute": "", "async": true, "content": "#!/bin/bash\\nsleep ${mixedAsyncDelay / 1000}\\necho \\"ASYNC_JSON_MIXED_OUTPUT\\""};`,
      );
      expect(jsonTayloredContent).toMatch(/\+ASYNC_JSON_MIXED_OUTPUT/);

      const expectedXmlTayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `${xmlBlockNumber}${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        // Check stdout for the success message of XML block
        `Successfully created ${expectedXmlTayloredFilePath}`,
      );
      expect(fs.existsSync(expectedXmlTayloredFilePath)).toBe(true);
      const xmlTayloredContent = normalizeLineEndings(
        fs.readFileSync(expectedXmlTayloredFilePath, 'utf8'),
      );
      expect(xmlTayloredContent).toContain(
        `-// <taylored number="${xmlBlockNumber}" compute="/*,*/" async="false">`,
      );
      expect(xmlTayloredContent).toContain(
        `+console.log('This content was generated by a SYNC XML block in the mixed test.');`,
      );

      expect(result.stdout).toContain('All asynchronous tasks have completed.');
    });
  });

  describe('Nested JSON Compute Block', () => {
    let testRepoPath: string;
    const tayloredBlockNumber = 9010;

    beforeEach(() => {
      testRepoPath = setupTestRepo('nested_json_test');
      const nestedJsonFileContent = `
// File with a nested JSON compute block
const config = {
  someKey: "someValue",
  tayloredConfig: {
    "taylored": ${tayloredBlockNumber},
    "compute": "",
    "async": false,
    "content": "#!/bin/sh\\necho \\"NESTED_JSON_OUTPUT\\""
  },
  anotherKey: "anotherValue"
};
`;
      createTestFile(testRepoPath, 'nested_compute.js', nestedJsonFileContent);
      execSync('git add nested_compute.js', { cwd: testRepoPath });
      execSync('git commit -m "Add nested_compute.js"', { cwd: testRepoPath });
    });

    afterEach(() => {
      if (testRepoPath && fs.existsSync(testRepoPath)) {
        fs.rmSync(testRepoPath, { recursive: true, force: true });
      }
    });

    it('should process a nested JSON compute block and replace it with its output in the .taylored file', () => {
      // This test assumes the handler has been updated with a regex that can find nested blocks.
      const result = runTayloredCommand(testRepoPath, '--automatic js main');
      expect(result.status).toBe(0);
      const relevantStderr = result.stderr
        .split('\n')
        .filter(
          (line) =>
            line.toLowerCase().includes('error') ||
            line.toLowerCase().includes('failed'),
        )
        .join('\n');
      expect(relevantStderr).toBe('');

      const expectedTayloredFilePath = path.join(
        testRepoPath,
        TAYLORED_DIR_NAME,
        `${tayloredBlockNumber}${TAYLORED_FILE_EXTENSION}`,
      );
      expect(result.stdout).toContain(
        `Successfully created ${expectedTayloredFilePath}`,
      );
      expect(fs.existsSync(expectedTayloredFilePath)).toBe(true);

      const tayloredContent = normalizeLineEndings(
        fs.readFileSync(expectedTayloredFilePath, 'utf8'),
      );

      // The diff should show the replacement of the entire `tayloredConfig` property.
      // What gets replaced is the full match from the regex.
      // The script output is `NESTED_JSON_OUTPUT\n`.
      // The replacement in the file would make it `... someKey: "value", tayloredConfig: NESTED_JSON_OUTPUT, anotherKey: "value" ...`

      // Check for removal of the original nested block
      expect(tayloredContent).toContain(`-  tayloredConfig: {`);
      expect(tayloredContent).toContain(
        `-    "taylored": ${tayloredBlockNumber},`,
      );

      // ** FIX: The regex should match the actual output from git diff **
      const addedLineRegex = /\+  tayloredConfig: NESTED_JSON_OUTPUT\n\+,/;
      expect(tayloredContent).toMatch(addedLineRegex);

      // Verify that surrounding lines are intact as context in the diff
      expect(tayloredContent).toContain(` const config = {`);
      expect(tayloredContent).toContain(`   someKey: "someValue",`);
      expect(tayloredContent).toContain(`   anotherKey: "anotherValue"`);
      expect(tayloredContent).toContain(` };`);
    });
  });
});

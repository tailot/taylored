// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs'; // Changed from fs/promises for synchronous operations in setup/teardown
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../../lib/constants';

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../..');
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
const TEMP_TEST_DIR_BASE = path.join(PROJECT_ROOT_PATH, 'temp_e2e_automatic_json');

const execOpts: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

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
  fs.mkdirSync(repoPath, { recursive: true }); // Ensure the repo directory is created

  const gitExecOpts: ExecSyncOptionsWithStringEncoding = { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' };

  execSync('git init -b main', gitExecOpts);
  execSync('git config user.name "Test User"', gitExecOpts);
  execSync('git config user.email "test@example.com"', gitExecOpts);
  execSync('git config commit.gpgsign false', gitExecOpts);

  const initialFileContent = 'Initial commit\n';
  fs.writeFileSync(path.join(repoPath, 'initial.txt'), initialFileContent);
  execSync('git add initial.txt', gitExecOpts);
  execSync('git commit -m "Initial commit"', gitExecOpts);
  return repoPath;
};

// Helper to create a file and commit it
const createFileAndCommit = (repoPath: string, relativeFilePath: string, content: string, commitMessage: string): void => {
  const fullFilePath = path.join(repoPath, relativeFilePath);
  const dirName = path.dirname(fullFilePath);
  if (!fs.existsSync(dirName)) {
    fs.mkdirSync(dirName, { recursive: true });
  }
  const contentWithNewline = content.endsWith('\n') ? content : content + '\n';
  fs.writeFileSync(fullFilePath, contentWithNewline);
  const gitExecOpts: ExecSyncOptionsWithStringEncoding = { cwd: repoPath, encoding: 'utf8', stdio: 'pipe' };
  execSync(`git add "${relativeFilePath}"`, gitExecOpts);
  execSync(`git commit -m "${commitMessage}"`, gitExecOpts);
};

// Helper function to get the path to a .taylored file
const getTayloredFilePath = (blockNumber: number | string, CWD: string): string => {
    return path.join(CWD, TAYLORED_DIR_NAME, `${blockNumber}${TAYLORED_FILE_EXTENSION}`);
};

describe('taylored --automatic (JSON Blocks)', () => {
    let testRepoPath: string; // To be set by beforeEach

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

    beforeEach(() => {
        const currentTestNameFromState = expect.getState().currentTestName;
        const sanitizedTestName = (currentTestNameFromState || 'default_json_test')
          .replace(/\s+/g, '_')
          .replace(/[^a-zA-Z0-9_]/g, '');
        testRepoPath = setupTestRepo(sanitizedTestName);
    });

    afterEach(() => {
        if (testRepoPath && fs.existsSync(testRepoPath)) {
             fs.rmSync(testRepoPath, { recursive: true, force: true });
        }
    });

    test('Basic Static JSON Block: Correctly extracts and creates .taylored file', async () => {
        const sourceFileName = 'app.js';
        const jsonBlockNumber = 42;
        const staticContent = "console.log('Hello from static JSON block!');";
        // Ensure the JSON is valid and properly escaped within the JS string
        const appJsContent = `
// Line 1
const myJsonBlock = {
  "taylored": ${jsonBlockNumber},
  "content": "${staticContent.replace(/"/g, '\\"')}"
};
// Line 3
`;
        createFileAndCommit(testRepoPath, sourceFileName, appJsContent, `Add ${sourceFileName} with JSON block ${jsonBlockNumber}`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        // Check stderr for unexpected errors first
        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const tayloredFilePath = getTayloredFilePath(jsonBlockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFilePath)).toBe(true);

        // Use the fully qualified path in the success message check
        expect(result.stdout).toContain(`Successfully created ${tayloredFilePath} for block ${jsonBlockNumber} from ${path.join(testRepoPath, sourceFileName)}`);

        const tayloredContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));

        // Verify the diff content
        expect(tayloredContent).toMatch(/--- a\/app\.js/);
        expect(tayloredContent).toMatch(/\+\+\+ b\/app\.js/);
        // Check for the removal of the JSON block lines
        expect(tayloredContent).toContain('-const myJsonBlock = {');
        expect(tayloredContent).toContain(`-  "taylored": ${jsonBlockNumber},`);
        expect(tayloredContent).toContain(`-  "content": "${staticContent.replace(/"/g, '\\"')}"`);
        expect(tayloredContent).toContain('-};');
        // Check that surrounding lines are part of the context
        expect(tayloredContent).toContain(' // Line 1');
        expect(tayloredContent).toContain(' // Line 3');

        // Verify original file is untouched on the current branch
        const originalFileContentAfter = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFileName), 'utf8'));
        expect(originalFileContentAfter).toBe(normalizeLineEndings(appJsContent));

        // Verify no temporary branches are left
        const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
        expect(branches).not.toContain('temp-taylored-');

        // Verify we are back on the original branch
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
        expect(currentBranch).toBe('main');
    });

    test('Multiple JSON Blocks: Extracts static and compute blocks from same and different files', async () => {
        const sourceFile1Name = 'app.js';
        const sourceFile2Name = 'utils.js';

        // Block 1: Static in app.js
        const block1Number = 10;
        const block1StaticContent = "console.log('Block 1: Static in app.js');";
        const appJsContentBlock1 = `
const block1 = {
  "taylored": ${block1Number},
  "content": "${block1StaticContent.replace(/"/g, '\\"')}"
};`;

        // Block 2: Compute in app.js
        const block2Number = 11;
        const block2ComputedOutput = "Computed output for block 11 in app.js";
        // Ensure the script content is properly escaped for insertion into the JSON string
        const block2ScriptRaw = `#!/usr/bin/env node
console.log("${block2ComputedOutput.replace(/"/g, '\\"')}");`;
        // For the "content" of the JSON, newlines in the script should be literal \n
        const block2ScriptForJsonContent = block2ScriptRaw.replace(/\n/g, '\\n');

        const appJsContentBlock2 = `
const block2 = {
  "taylored": ${block2Number},
  "compute": "/*,*/",
  "content": "/*\\n${block2ScriptForJsonContent}\\n*/"
};`;

        // Combined content for app.js
        const appJsContent = `// Start of app.js
${appJsContentBlock1}
// Middle of app.js
${appJsContentBlock2}
// End of app.js
`;
        createFileAndCommit(testRepoPath, sourceFile1Name, appJsContent, `Add ${sourceFile1Name} with multiple JSON blocks`);

        // Block 3: Static in utils.js
        const block3Number = 20;
        const block3StaticContent = "export const util = 'Utility from JSON block 20';";
        const utilsJsContent = `
// Start of utils.js
const block3 = {
  "taylored": ${block3Number},
  "content": "${block3StaticContent.replace(/"/g, '\\"')}"
};
// End of utils.js
`;
        createFileAndCommit(testRepoPath, sourceFile2Name, utilsJsContent, `Add ${sourceFile2Name} with JSON block ${block3Number}`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        expect(result.stdout).toContain(`Processing block ${block1Number} from ${path.join(testRepoPath, sourceFile1Name)}...`);
        expect(result.stdout).toContain(`Processing block ${block2Number} from ${path.join(testRepoPath, sourceFile1Name)}...`);
        expect(result.stdout).toContain(`Processing block ${block3Number} from ${path.join(testRepoPath, sourceFile2Name)}...`);


        // --- Assertions for Block 1 (Static in app.js) ---
        const tayloredFile1Path = getTayloredFilePath(block1Number, testRepoPath);
        expect(fs.existsSync(tayloredFile1Path)).toBe(true);
        expect(result.stdout).toContain(`Successfully created ${tayloredFile1Path} for block ${block1Number} from ${path.join(testRepoPath, sourceFile1Name)}`);
        const tayloredFile1Content = normalizeLineEndings(fs.readFileSync(tayloredFile1Path, 'utf8'));
        expect(tayloredFile1Content).toMatch(new RegExp(`--- a/${sourceFile1Name.replace(/\\/g, '\\\\')}`));
        expect(tayloredFile1Content).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFile1Name.replace(/\\/g, '\\\\')}`));
        expect(tayloredFile1Content).toContain('-const block1 = {');
        expect(tayloredFile1Content).toContain(`-  "taylored": ${block1Number},`);
        expect(tayloredFile1Content).toContain(`-  "content": "${block1StaticContent.replace(/"/g, '\\"')}"`);
        expect(tayloredFile1Content).toContain('-};');

        // --- Assertions for Block 2 (Compute in app.js) ---
        const tayloredFile2Path = getTayloredFilePath(block2Number, testRepoPath);
        expect(fs.existsSync(tayloredFile2Path)).toBe(true);
        expect(result.stdout).toContain(`Successfully created ${tayloredFile2Path} for computed block ${block2Number} from ${path.join(testRepoPath, sourceFile1Name)}`);
        const tayloredFile2Content = normalizeLineEndings(fs.readFileSync(tayloredFile2Path, 'utf8'));
        expect(tayloredFile2Content).toMatch(new RegExp(`--- a/${sourceFile1Name.replace(/\\/g, '\\\\')}`));
        expect(tayloredFile2Content).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFile1Name.replace(/\\/g, '\\\\')}`));
        // Check for removal of the original JSON block for compute
        expect(tayloredFile2Content).toContain('-const block2 = {');
        expect(tayloredFile2Content).toContain(`-  "taylored": ${block2Number},`);
        expect(tayloredFile2Content).toContain(`-  "compute": "/*,*/",`);
        expect(tayloredFile2Content).toContain(`-  "content": "/*\\n${block2ScriptForJsonContent}\\n*/"`);
        expect(tayloredFile2Content).toContain('-};');
        // Check for addition of the computed output
        expect(tayloredFile2Content).toContain(`+${block2ComputedOutput}`);

        // --- Assertions for Block 3 (Static in utils.js) ---
        const tayloredFile3Path = getTayloredFilePath(block3Number, testRepoPath);
        expect(fs.existsSync(tayloredFile3Path)).toBe(true);
        expect(result.stdout).toContain(`Successfully created ${tayloredFile3Path} for block ${block3Number} from ${path.join(testRepoPath, sourceFile2Name)}`);
        const tayloredFile3Content = normalizeLineEndings(fs.readFileSync(tayloredFile3Path, 'utf8'));
        expect(tayloredFile3Content).toMatch(new RegExp(`--- a/${sourceFile2Name.replace(/\\/g, '\\\\')}`));
        expect(tayloredFile3Content).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFile2Name.replace(/\\/g, '\\\\')}`));
        expect(tayloredFile3Content).toContain('-const block3 = {');
        expect(tayloredFile3Content).toContain(`-  "taylored": ${block3Number},`);
        expect(tayloredFile3Content).toContain(`-  "content": "${block3StaticContent.replace(/"/g, '\\"')}"`);
        expect(tayloredFile3Content).toContain('-};');

        // Verify original files are untouched
        const originalAppJsContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFile1Name), 'utf8'));
        expect(originalAppJsContent).toBe(normalizeLineEndings(appJsContent));
        const originalUtilsJsContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFile2Name), 'utf8'));
        expect(originalUtilsJsContent).toBe(normalizeLineEndings(utilsJsContent));

        // Verify no temporary branches are left
        const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
        expect(branches).not.toContain('temp-taylored-'); // For static blocks
        expect(branches).not.toContain('temp-taylored-compute-'); // For compute blocks

        // Verify we are back on the original branch
        const finalCurrentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
        expect(finalCurrentBranch).toBe('main');
    });

    test('JSON Compute Block (Node.js script): Executes and output replaces block', async () => {
        const sourceFileName = 'compute_app.js';
        const blockNumber = 30;
        const computedOutput = "Dynamic content from Node.js compute block!";
        // Script content: ensure proper escaping for inclusion in JSON string
        const scriptRaw = `#!/usr/bin/env node
console.log("${computedOutput.replace(/"/g, '\\"')}");`;
        const scriptForJsonContent = scriptRaw.replace(/\n/g, '\\n');

        const appContent = `
// compute_app.js
const myComputeBlock = {
  "taylored": ${blockNumber},
  "compute": "/*,*/", // Assuming this means remove the wrapping comments
  "content": "/*\\n${scriptForJsonContent}\\n*/"
};
// after block
`;
        createFileAndCommit(testRepoPath, sourceFileName, appContent, `Add ${sourceFileName} with JSON compute block ${blockNumber}`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const tayloredFilePath = getTayloredFilePath(blockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFilePath)).toBe(true);
        expect(result.stdout).toContain(`Processing block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}...`);
        expect(result.stdout).toContain(`Successfully created ${tayloredFilePath} for computed block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}`);

        const tayloredFileContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));
        expect(tayloredFileContent).toMatch(new RegExp(`--- a/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileContent).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileContent).toContain('-const myComputeBlock = {');
        expect(tayloredFileContent).toContain(`-  "taylored": ${blockNumber},`);
        expect(tayloredFileContent).toContain(`-  "compute": "/*,*/",`);
        // Check for removal of the line containing the start of the script content
        expect(tayloredFileContent).toContain(`-  "content": "/*\\n${scriptForJsonContent}\\n*/"`);
        expect(tayloredFileContent).toContain(`+${computedOutput}`);

        const originalAppContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFileName), 'utf8'));
        expect(originalAppContent).toBe(normalizeLineEndings(appContent));

        const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
        expect(branches).not.toContain('temp-taylored-compute-');
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
        expect(currentBranch).toBe('main');
    });

    test('JSON Compute Block (async: true): Executes asynchronously and output is captured', async () => {
        const sourceFileName = 'async_compute_app.js';
        const blockNumber = 31;
        const computedOutput = "Async content from Node.js!";
        const scriptRaw = `#!/usr/bin/env node
setTimeout(() => { console.log("${computedOutput.replace(/"/g, '\\"')}"); }, 100);`;
        const scriptForJsonContent = scriptRaw.replace(/\n/g, '\\n');

        const appContent = `
// async_compute_app.js
const myAsyncComputeBlock = {
  "taylored": ${blockNumber},
  "compute": "/*,*/",
  "async": true,
  "content": "/*\\n${scriptForJsonContent}\\n*/"
};
// after async block
`;
        createFileAndCommit(testRepoPath, sourceFileName, appContent, `Add ${sourceFileName} with async JSON compute block ${blockNumber}`);

        // jest.setTimeout(10000); // Potentially increase timeout if script delay is longer

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const tayloredFilePath = getTayloredFilePath(blockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFilePath)).toBe(true);

        expect(result.stdout).toContain(`Asynchronously processing computed block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}...`);
        expect(result.stdout).toContain('Executing 1 asynchronous compute block(s) in parallel...');
        // Note: The "Successfully created" log for async blocks might appear *before* "All asynchronous tasks have completed"
        // if the file writing is quick but other async tasks (if any) take longer.
        // The key is that it *is* present.
        expect(result.stdout).toContain(`Successfully created ${tayloredFilePath} for computed block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}`);
        expect(result.stdout).toContain('All asynchronous tasks have completed. Succeeded: 1, Failed: 0.');
        expect(result.stdout).toMatch(/Finished processing. Initiated \d+ taylored block\(s\). See async summary for completion details./);

        const tayloredFileContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));
        expect(tayloredFileContent).toMatch(new RegExp(`--- a/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileContent).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileContent).toContain('-const myAsyncComputeBlock = {');
        expect(tayloredFileContent).toContain(`-  "taylored": ${blockNumber},`);
        expect(tayloredFileContent).toContain(`-  "compute": "/*,*/",`);
        expect(tayloredFileContent).toContain(`-  "async": true,`);
        expect(tayloredFileContent).toContain(`-  "content": "/*\\n${scriptForJsonContent}\\n*/"`);
        expect(tayloredFileContent).toContain(`+${computedOutput}`);

        const originalAppContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFileName), 'utf8'));
        expect(originalAppContent).toBe(normalizeLineEndings(appContent));

        const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
        expect(branches).not.toContain('temp-taylored-compute-');
        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
        expect(currentBranch).toBe('main');
    });

    test('JSON Block with disabled: true: Is ignored and no .taylored file is generated', async () => {
        const sourceFileName = 'disabled_app.js';
        const blockNumber = 40;
        const sideEffectFileName = 'DO_NOT_CREATE_JSON.txt'; // File that should not be created by compute

        // Script with a side effect for the compute block
        const scriptRaw = `#!/usr/bin/env node
console.log('This output should not appear.');
require('fs').writeFileSync('${sideEffectFileName}', 'content');`;
        const scriptForJsonContent = scriptRaw.replace(/\n/g, '\\n');

        const appContent = `
// disabled_app.js
const myDisabledBlock = {
  "taylored": ${blockNumber},
  "disabled": true,
  "compute": "/*,*/", // To ensure compute logic is also skipped
  "content": "/*\\n${scriptForJsonContent}\\n*/"
};

const anotherBlock = { // A normal, non-disabled block to ensure processing continues
  "taylored": 41,
  "content": "console.log('This is block 41');"
};
// after blocks
`;
        createFileAndCommit(testRepoPath, sourceFileName, appContent, `Add ${sourceFileName} with disabled JSON block ${blockNumber}`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0); // Command should still succeed overall

        // Assertions for disabled block (40)
        const tayloredFilePathDisabled = getTayloredFilePath(blockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFilePathDisabled)).toBe(false); // .taylored file should NOT exist

        const expectedSkippedBlockMessage = `Skipping disabled block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}.`;
        // The message in the application uses (type: json) at the end.
        expect(result.stdout).toContain(`Skipping disabled block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)} (type: json).`);


        // Check that the side effect file from the compute script was NOT created
        const sideEffectFilePath = path.join(testRepoPath, sideEffectFileName);
        expect(fs.existsSync(sideEffectFilePath)).toBe(false);

        // Assertions for the non-disabled block (41) to ensure it was processed
        const tayloredFilePathEnabled = getTayloredFilePath(41, testRepoPath);
        expect(fs.existsSync(tayloredFilePathEnabled)).toBe(true);
        expect(result.stdout).toContain(`Successfully created ${tayloredFilePathEnabled} for block 41 from ${path.join(testRepoPath, sourceFileName)}`);

        // Verify original file is untouched
        const originalAppContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFileName), 'utf8'));
        expect(originalAppContent).toBe(normalizeLineEndings(appContent));

        const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
        expect(branches).not.toContain('temp-taylored-');
        expect(branches).not.toContain('temp-taylored-compute-');

        const finalCurrentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
        expect(finalCurrentBranch).toBe('main');
    });

    test('JSON Block with disabled: false: Is processed normally', async () => {
        const sourceFileName = 'not_disabled_app.js';
        const blockNumber = 45;
        const staticContent = "console.log('Block 45 is NOT disabled.');";

        const appContent = `
// not_disabled_app.js
const myBlock = {
  "taylored": ${blockNumber},
  "disabled": false,
  "content": "${staticContent.replace(/"/g, '\\"')}"
};
// after block
`;
        createFileAndCommit(testRepoPath, sourceFileName, appContent, `Add ${sourceFileName} with 'disabled: false' JSON block ${blockNumber}`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const tayloredFilePath = getTayloredFilePath(blockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFilePath)).toBe(true); // .taylored file SHOULD exist
        expect(result.stdout).toContain(`Successfully created ${tayloredFilePath} for block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}`);
        expect(result.stdout).not.toContain(`Skipping disabled block ${blockNumber}`);

        const tayloredContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));
        expect(tayloredContent).toMatch(new RegExp(`--- a/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredContent).toContain('-const myBlock = {');
        expect(tayloredContent).toContain(`-  "taylored": ${blockNumber},`);
        expect(tayloredContent).toContain(`-  "disabled": false,`);
        expect(tayloredContent).toContain(`-  "content": "${staticContent.replace(/"/g, '\\"')}"`);
        expect(tayloredContent).toContain('-};');
    });

    test('JSON Block with disabled property absent: Is processed normally', async () => {
        const sourceFileName = 'default_disabled_app.js';
        const blockNumber = 46;
        const staticContent = "console.log('Block 46 has no disabled property.');";

        const appContent = `
// default_disabled_app.js
const myBlock = {
  "taylored": ${blockNumber},
  "content": "${staticContent.replace(/"/g, '\\"')}"
  // "disabled" property is absent
};
// after block
`;
        createFileAndCommit(testRepoPath, sourceFileName, appContent, `Add ${sourceFileName} with absent 'disabled' JSON block ${blockNumber}`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        const tayloredFilePath = getTayloredFilePath(blockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFilePath)).toBe(true); // .taylored file SHOULD exist
        expect(result.stdout).toContain(`Successfully created ${tayloredFilePath} for block ${blockNumber} from ${path.join(testRepoPath, sourceFileName)}`);
        expect(result.stdout).not.toContain(`Skipping disabled block ${blockNumber}`);

        const tayloredContent = normalizeLineEndings(fs.readFileSync(tayloredFilePath, 'utf8'));
        expect(tayloredContent).toMatch(new RegExp(`--- a/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredContent).toContain('-const myBlock = {');
        expect(tayloredContent).toContain(`-  "taylored": ${blockNumber},`);
        expect(tayloredContent).toContain(`-  "content": "${staticContent.replace(/"/g, '\\"')}"`);
        expect(tayloredContent).toContain('-  // "disabled" property is absent');
        expect(tayloredContent).toContain('-};');
    });

    test('Coexistence of XML and JSON Blocks: Processes both types from the same file correctly', async () => {
        const sourceFileName = 'mixed_blocks.js';

        // XML Block
        const xmlBlockNumber = 50;
        const xmlBlockContent = "// Content of XML block 50";
        // Ensure XML block is correctly formatted as a string within the JS template literal
        const xmlBlock = `<taylored number="${xmlBlockNumber}">\n${xmlBlockContent}\n</taylored>`;

        // JSON Block
        const jsonBlockNumber = 51;
        const jsonBlockContent = "console.log('Content of JSON block 51');";
        const jsonBlock = `
const jsonBlock51 = {
  "taylored": ${jsonBlockNumber},
  "content": "${jsonBlockContent.replace(/"/g, '\\"')}"
};`;

        // Order: XML block first, then JSON block
        // The XML block is embedded as a multi-line comment in the JS file.
        const appContent = `
// Start of file
console.log('Some initial code');

/* \n${xmlBlock}\n */

console.log('Code between blocks');

${jsonBlock}

console.log('End of file');
`;
        createFileAndCommit(testRepoPath, sourceFileName, appContent, `Add ${sourceFileName} with mixed XML and JSON blocks`);

        const result = runTayloredCommand(testRepoPath, '--automatic js main');

        expect(result.stderr).toBe('');
        expect(result.status).toBe(0);

        // --- Assertions for XML Block (50) ---
        const tayloredFileXmlPath = getTayloredFilePath(xmlBlockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFileXmlPath)).toBe(true);
        // Check for the specific processing log for XML block
        expect(result.stdout).toContain(`Processing block ${xmlBlockNumber} from ${path.join(testRepoPath, sourceFileName)}...`);
        expect(result.stdout).toContain(`Successfully created ${tayloredFileXmlPath} for block ${xmlBlockNumber} from ${path.join(testRepoPath, sourceFileName)}`);

        const tayloredFileXmlContent = normalizeLineEndings(fs.readFileSync(tayloredFileXmlPath, 'utf8'));
        expect(tayloredFileXmlContent).toMatch(new RegExp(`--- a/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileXmlContent).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFileName.replace(/\\/g, '\\\\')}`));
        // XML block content check needs to be for the removal of the comment block containing the XML
        expect(tayloredFileXmlContent).toContain(`-/* \n-<taylored number="${xmlBlockNumber}">`);
        expect(tayloredFileXmlContent).toContain(`-${xmlBlockContent}`);
        expect(tayloredFileXmlContent).toContain(`-</taylored>\n- */`);

        // --- Assertions for JSON Block (51) ---
        const tayloredFileJsonPath = getTayloredFilePath(jsonBlockNumber, testRepoPath);
        expect(fs.existsSync(tayloredFileJsonPath)).toBe(true);
        expect(result.stdout).toContain(`Processing block ${jsonBlockNumber} from ${path.join(testRepoPath, sourceFileName)}...`);
        expect(result.stdout).toContain(`Successfully created ${tayloredFileJsonPath} for block ${jsonBlockNumber} from ${path.join(testRepoPath, sourceFileName)}`);

        const tayloredFileJsonContent = normalizeLineEndings(fs.readFileSync(tayloredFileJsonPath, 'utf8'));
        expect(tayloredFileJsonContent).toMatch(new RegExp(`--- a/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileJsonContent).toMatch(new RegExp(`\\+\\+\\+ b/${sourceFileName.replace(/\\/g, '\\\\')}`));
        expect(tayloredFileJsonContent).toContain('-const jsonBlock51 = {');
        expect(tayloredFileJsonContent).toContain(`-  "taylored": ${jsonBlockNumber},`);
        expect(tayloredFileJsonContent).toContain(`-  "content": "${jsonBlockContent.replace(/"/g, '\\"')}"`);
        expect(tayloredFileJsonContent).toContain('-};');

        // Check that the stdout messages for processing occur in the correct order
        const processingXmlLogIndex = result.stdout.indexOf(`Processing block ${xmlBlockNumber} from`);
        const processingJsonLogIndex = result.stdout.indexOf(`Processing block ${jsonBlockNumber} from`);
        expect(processingXmlLogIndex).toBeGreaterThan(-1);
        expect(processingJsonLogIndex).toBeGreaterThan(-1);
        // Based on the file content, XML block (index of "/* \n<taylored...")
        // should appear before JSON block (index of "const jsonBlock51 = {")
        expect(processingXmlLogIndex).toBeLessThan(processingJsonLogIndex);

        // Verify original file is untouched
        const originalAppContent = normalizeLineEndings(fs.readFileSync(path.join(testRepoPath, sourceFileName), 'utf8'));
        expect(originalAppContent).toBe(normalizeLineEndings(appContent));

        const branches = execSync('git branch', { cwd: testRepoPath, encoding: 'utf8' });
        expect(branches).not.toContain('temp-taylored-');

        const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: testRepoPath, encoding: 'utf8' }).trim();
        expect(currentBranch).toBe('main');
    });
});

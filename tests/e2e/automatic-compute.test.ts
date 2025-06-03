import * as fs from 'fs';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

const PROJECT_ROOT_PATH = path.resolve(__dirname, '../../');
const TEST_SUBDIR_NAME = "taylored_auto_compute_test_repo";
const TEST_DIR_FULL_PATH = path.join(PROJECT_ROOT_PATH, TEST_SUBDIR_NAME);
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;
const TAYLORED_DIR_NAME = ".taylored";
const TAYLORED_DIR_FULL_PATH = path.join(TEST_DIR_FULL_PATH, TAYLORED_DIR_NAME);

let initialCommitHash: string;

const execOptions: ExecSyncOptionsWithStringEncoding = {
  cwd: TEST_DIR_FULL_PATH,
  stdio: 'pipe',
  encoding: 'utf-8',
};

const normalizeLineEndings = (str: string): string => str.replace(/\r\n/g, '\n');

const resetToInitialState = () => {
  console.log("Resetting state...");
  const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', execOptions).toString().trim();
  if (currentBranch !== 'main') {
    execSync('git checkout main', execOptions);
  }
  execSync('git clean -fdx', execOptions);
  execSync(`git reset --hard ${initialCommitHash}`, execOptions);
  if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
    fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
  }
  console.log("State reset.");
};

beforeAll(() => {
  console.log("Setting up test Git repository for automatic-compute...");
  if (fs.existsSync(TEST_DIR_FULL_PATH)) {
    fs.rmSync(TEST_DIR_FULL_PATH, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_DIR_FULL_PATH, { recursive: true });
  execSync('git init -b main', execOptions);
  execSync('git config user.email "test@example.com"', execOptions);
  execSync('git config user.name "Test User"', execOptions);
  execSync('git config commit.gpgsign false', execOptions);
  fs.writeFileSync(path.join(TEST_DIR_FULL_PATH, 'initial_file.txt'), 'Initial content for auto-compute tests.');
  execSync('git add initial_file.txt', execOptions);
  execSync('git commit -m "Initial commit for auto-compute"', execOptions);
  initialCommitHash = execSync('git rev-parse HEAD', execOptions).toString().trim();
  if (!fs.existsSync(TAYLORED_DIR_FULL_PATH)) {
    fs.mkdirSync(TAYLORED_DIR_FULL_PATH, { recursive: true });
  }
  console.log(`Test Git repository for automatic-compute setup complete. Initial commit: ${initialCommitHash}`);
});

afterAll(() => {
  console.log("Cleaning up automatic-compute test repository...");
  process.chdir(PROJECT_ROOT_PATH); // Important to avoid EBUSY errors
  if (fs.existsSync(TEST_DIR_FULL_PATH)) {
    fs.rmSync(TEST_DIR_FULL_PATH, { recursive: true, force: true });
  }
  console.log("Automatic-compute cleanup complete.");
});

beforeEach(() => {
  resetToInitialState();
});

describe('Taylored Automatic Compute E2E Tests', () => {
  test('initial setup is correct and files exist', () => {
    expect(fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'initial_file.txt'))).toBe(true);
    expect(fs.existsSync(TAYLORED_DIR_FULL_PATH)).toBe(true);
  });

  test('should execute a bash snippet and create an output file', () => {
    // 1. Define the Node.js script that will execute the bash snippet.
    // This script will be embedded in a taylored compute block.
    const nodeScriptToExecuteBash = `#!/usr/bin/env node
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Get the current working directory (expected to be .taylored/)
const currentCwd = process.cwd();
let scriptOutput = 'Script starting.\\n';
scriptOutput += 'CWD: ' + process.cwd() + '\\n'; // Log CWD directly

// Simplified bash snippet, creates files in its CWD
const bashSnippet =
  'echo "Test content direct" > test_direct_output.txt\\n' +
  'touch test_direct_flag.txt';

try {
  scriptOutput += 'Executing simplified bash snippet...\\n';
  scriptOutput += 'Snippet: ' + bashSnippet + '\\n';
  execSync(bashSnippet);
  scriptOutput += 'Simplified bash snippet executed successfully.\\n';
} catch (err) {
  scriptOutput += 'Error executing bash snippet: ' + (err instanceof Error ? err.message : String(err)) + '\\n';
  // Also print to stderr of the node script, which might be captured by taylored logs
  console.error('Bash snippet execution error:', err);
}

// This will be the content of the generated .taylored file
process.stdout.write(scriptOutput);
`;

    // 2. Create a dummy source file with the taylored compute block.
    const dummySourceFileName = 'dummy_source_for_bash_test.js';
    const dummySourceFilePath = path.join(TEST_DIR_FULL_PATH, dummySourceFileName);
    // Ensure CHARS_TO_STRIP matches the start of the script if needed, or is empty.
    // Here, the script starts directly with 'const', so no stripping needed, or use a common prefix like '//'
    const tayloredBlockContent = `<taylored 1 compute="">${nodeScriptToExecuteBash}</taylored>`;
    fs.writeFileSync(dummySourceFilePath, `// Some source code\n${tayloredBlockContent}\n// More source code`);

    // Add this new file to git staging so taylored can diff it
    execSync(`git add ${dummySourceFileName}`, execOptions);
    // Commit the new file to ensure the working directory is clean
    execSync(`git commit -m "Add dummy source for bash test"`, execOptions);

    // 3. Construct the taylored command to process .js files against the 'main' branch.
    const tayloredCommand = `${TAYLORED_CMD_BASE} --automatic js main`;

    // 4. Execute the taylored command
    try {
      console.log(`Executing: ${tayloredCommand}`);
      const commandOutput = execSync(tayloredCommand, execOptions);
      console.log("Taylored command output:", commandOutput);
    } catch (e) {
      const error = e as any;
      console.error("Error executing taylored --automatic for bash:", error.message);
      if (error.stdout) console.error("STDOUT:", error.stdout.toString());
      if (error.stderr) console.error("STDERR:", error.stderr.toString());
      throw error;
    }

    // 5. Verify the output files created by the simplified bash snippet
    // Based on diagnostics, these files are created in TEST_DIR_FULL_PATH (the repo root for the test).
    const expectedOutputFile = path.join(TEST_DIR_FULL_PATH, 'test_direct_output.txt');
    const expectedFlagFile = path.join(TEST_DIR_FULL_PATH, 'test_direct_flag.txt');

    // Attempt to read the diagnostic file first (1.taylored)
    const diagnosticFilePath = path.join(TAYLORED_DIR_FULL_PATH, '1.taylored');
    if (fs.existsSync(diagnosticFilePath)) {
      console.log("Diagnostics from 1.taylored:", fs.readFileSync(diagnosticFilePath, 'utf8'));
    } else {
      console.log("Diagnostic file 1.taylored not found.");
    }

    expect(fs.existsSync(expectedOutputFile)).toBe(true);
    expect(normalizeLineEndings(fs.readFileSync(expectedOutputFile, 'utf8'))).toBe("Test content direct\n");
    expect(fs.existsSync(expectedFlagFile)).toBe(true);

    // 6. Clean up the dummy source file (optional, as beforeAll/afterAll handle full cleanup)
    // fs.unlinkSync(dummySourceFilePath); // Not strictly necessary due to afterAll cleanup
  });

  test('should execute a Node.js snippet via compute block and create output files in repo root', () => {
    const hostFileName = 'dummy_node_host_for_node_snippet.js';
    const hostFilePath = path.join(TEST_DIR_FULL_PATH, hostFileName);

    // This is the Node.js code that will be placed inside the compute block
    // It will be executed by taylored, and its stdout will become the patch content.
    // For this test, we are interested in side effects (file creation).
    const nodeSnippetToExecute = `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// process.cwd() for a compute script is the repo root (e.g., TEST_DIR_FULL_PATH)
const CWD = process.cwd();
console.log('Node.js snippet executing from CWD:', CWD);

fs.writeFileSync(path.join(CWD, 'auto_node_output.txt'), 'Hello from Node.js auto script');
fs.writeFileSync(path.join(CWD, 'auto_node_flag.txt'), 'Node flag');

console.log('Node.js snippet finished. Files created in:', CWD);
// This stdout will be the content of the .taylored file
process.stdout.write('Node.js snippet executed. CWD: ' + CWD);
`;

    // The compute attribute `compute="/*,*/"` is an example if stripping comments is desired.
    // If the script starts with #! shebang, no stripping might be needed, or strip just the shebang.
    // For this test, let's use a simple compute attribute that doesn't strip, or strips something not present.
    // The actual taylored tool implementation will determine if `compute=""` (empty) is valid
    // or if it needs specific characters to strip (e.g. `compute="剝"` if 剝 is not in the script).
    // The previous test used `compute=""` successfully with a shebang.
    const hostFileContent = `// Host file for Node.js snippet
//<taylored 1 compute="">
${nodeSnippetToExecute}
//</taylored>
console.log("This is the host JS file for Node.js snippet test. It contains a taylored block.");
`;

    fs.writeFileSync(hostFilePath, hostFileContent);
    execSync(`git add ${hostFileName}`, execOptions);
    execSync(`git commit -m "add host file for node snippet test"`, execOptions);

    const tayloredCommand = `${TAYLORED_CMD_BASE} --automatic js main`;

    try {
      console.log(`Executing taylored for Node.js snippet: ${tayloredCommand}`);
      const cmdOutput = execSync(tayloredCommand, execOptions);
      console.log("Taylored command output for Node.js snippet:", cmdOutput.toString());
    } catch (error: any) {
      console.error("Error executing taylored --automatic for Node.js snippet:", error.message);
      if (error.stdout) console.error("STDOUT:", error.stdout.toString());
      if (error.stderr) console.error("STDERR:", error.stderr.toString());
      // Attempt to read the generated .taylored file for diagnostics
      const tayloredFilePath = path.join(TAYLORED_DIR_FULL_PATH, '1.taylored'); // Assuming it's the first/only one
      if (fs.existsSync(tayloredFilePath)) {
          console.error("Diagnostics from 1.taylored (Node.js test):", fs.readFileSync(tayloredFilePath, 'utf8'));
      }
      throw error;
    }

    const expectedOutputFile = path.join(TEST_DIR_FULL_PATH, 'auto_node_output.txt');
    const expectedFlagFile = path.join(TEST_DIR_FULL_PATH, 'auto_node_flag.txt');

    expect(fs.existsSync(expectedOutputFile)).toBe(true);
    expect(normalizeLineEndings(fs.readFileSync(expectedOutputFile, 'utf8'))).toBe("Hello from Node.js auto script");
    expect(fs.existsSync(expectedFlagFile)).toBe(true);
    expect(normalizeLineEndings(fs.readFileSync(expectedFlagFile, 'utf8'))).toBe("Node flag");

    // Log content of .taylored/1.taylored for inspection if needed
    const tayloredResultFilePath = path.join(TAYLORED_DIR_FULL_PATH, '1.taylored');
    if (fs.existsSync(tayloredResultFilePath)) {
      console.log("Content of .taylored/1.taylored (Node.js test):", fs.readFileSync(tayloredResultFilePath, 'utf8'));
    }
  });
});

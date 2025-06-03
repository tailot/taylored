// tests/e2e/automatic-compute.test.ts
import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import * as fsExtra from 'fs-extra'; // For recursive directory operations

const CWD = process.cwd();
const TAYLORED_CLI_PATH = path.join(CWD, 'index.ts'); // Adjust if your compiled CLI is elsewhere
const TAYLORED_DIR_NAME = '.taylored';

const execOpts: ExecSyncOptionsWithStringEncoding = {
    encoding: 'utf8',
    stdio: 'pipe', // Capture output, suppress in console unless error
};

describe('Taylored --automatic with compute attribute E2E Test', () => {
    let testDir: string;

    beforeEach(async () => {
        // Create a unique temporary directory for each test
        testDir = path.join(CWD, \`taylored-test-env-\${Date.now()}\`);
        await fs.mkdir(testDir, { recursive: true });

        // Initialize a git repository in the test directory
        execSync('git init', { cwd: testDir, ...execOpts });
        // Basic git config to avoid errors during commits
        execSync('git config user.email "test@example.com"', { cwd: testDir, ...execOpts });
        execSync('git config user.name "Test User"', { cwd: testDir, ...execOpts });
    });

    afterEach(async () => {
        // Clean up the temporary directory
        if (testDir) {
            await fsExtra.remove(testDir);
        }
    });

    it('should correctly process a <taylored> block with compute attribute and generate the diff', async () => {
        const sourceFileName = 'script.js';
        const sourceFilePath = path.join(testDir, sourceFileName);
        const tayloredBlockNumber = '1';
        const charsToStrip = '/*';
        const scriptShebangAndComment = '/*#!/usr/bin/env node';
        const scriptConsoleLog = 'console.log("Hello from computed script!");';
        const scriptContent = \`\${scriptShebangAndComment}\n\${scriptConsoleLog}\n*/\`; // Content includes */ at the end

        const fileContent = \`
// Some initial content
const a = 10;

<taylored \${tayloredBlockNumber} compute="\${charsToStrip}">\${scriptContent}</taylored>

// Some trailing content
const b = 20;
\`;
        await fs.writeFile(sourceFilePath, fileContent);
        execSync(\`git add \${sourceFileName}\`, { cwd: testDir, ...execOpts });
        execSync('git commit -m "Initial commit with taylored block"', { cwd: testDir, ...execOpts });

        // Run the taylored --automatic command
        // Assuming 'main' or 'master' is the default branch. Adjust if your git init creates a different default.
        // We use 'HEAD' as the branch to compare against for --automatic, as it generates patches relative to current state.
        try {
            execSync(\`node \${TAYLORED_CLI_PATH} --automatic js HEAD\`, { cwd: testDir, stdio: 'pipe' });
        } catch (error: any) {
            // Output error details for easier debugging if the command fails
            console.error('Taylored CLI execution failed:');
            console.error('STDOUT:', error.stdout?.toString());
            console.error('STDERR:', error.stderr?.toString());
            throw error; // Re-throw to fail the test
        }


        // Verify the generated .taylored file
        const tayloredFileName = \`\${tayloredBlockNumber}.taylored\`;
        const tayloredFilePath = path.join(testDir, TAYLORED_DIR_NAME, tayloredFileName);

        expect(await fsExtra.exists(tayloredFilePath)).toBe(true);

        const tayloredFileContent = await fs.readFile(tayloredFilePath, 'utf-8');

        // Expected script output
        const expectedScriptOutput = "Hello from computed script!\n"; // console.log adds a newline

        // Construct the expected diff content
        // It should show the original taylored block being removed and the script output being added.
        // The exact line numbers in the diff (e.g., @@ -3,6 +3,2 @@) can be fragile.
        // We'll check for the key parts: removal of the old block and addition of the new content.

        const oldBlockLines = fileContent.split('\n').filter(line => line.includes('<taylored') || line.includes(scriptConsoleLog) || line.includes('</taylored>'));

        // Check for removal of lines from the original block
        expect(tayloredFileContent).toContain(\`-const a = 10;\`); // Context line
        expect(tayloredFileContent).toContain(\`-<taylored \${tayloredBlockNumber} compute="\${charsToStrip}">\${scriptContent}</taylored>\`);
        expect(tayloredFileContent).toContain(\`-const b = 20;\`); // Context line

        // Check for addition of the script output
        // The script output replaces the entire block.
        // The diff should show the lines *around* the block changing to accommodate the new single line of output.
        // The line \`const a = 10;\` should be followed by \`Hello from computed script!\`
        // and then \`const b = 20;\`
        expect(tayloredFileContent).toContain(\`+\${expectedScriptOutput.trim()}\`); // trim because diff might not show trailing newline of the file itself, but content lines

        // More robust check: the content of the taylored block should be replaced by the script output
        // This can be simulated by applying the patch
        const tempApplyDir = path.join(testDir, 'apply-test');
        await fsExtra.copy(testDir, tempApplyDir, { filter: (src) => !src.includes(TAYLORED_DIR_NAME) && !src.includes('.git') }); // Copy source files, exclude .taylored and .git

        // Before applying, make sure the original file is as expected
        const originalFileInTemp = await fs.readFile(path.join(tempApplyDir, sourceFileName), 'utf-8');
        expect(originalFileInTemp).toEqual(fileContent);

        try {
            execSync(\`git apply \${tayloredFilePath}\`, { cwd: tempApplyDir, stdio: 'pipe' });
        } catch (error: any) {
            console.error('git apply failed:');
            console.error('STDOUT:', error.stdout?.toString());
            console.error('STDERR:', error.stderr?.toString());
            throw error;
        }

        const appliedFileContent = await fs.readFile(path.join(tempApplyDir, sourceFileName), 'utf-8');

        const expectedFileAfterApply = \`
// Some initial content
const a = 10;

\${expectedScriptOutput}
// Some trailing content
const b = 20;
\`;
        // Normalize whitespace and newlines for comparison
        const normalize = (str: string) => str.replace(/\r\n/g, '\n').replace(/^\s*$/gm, '').trim();

        expect(normalize(appliedFileContent)).toEqual(normalize(expectedFileAfterApply));

    });
});

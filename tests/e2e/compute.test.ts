import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptions } from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../../src/lib/constants';

const JEST_TIMEOUT = 30000; // 30 seconds
const BASE_BRANCH_NAME = 'main';
const tayloredExecutable = path.resolve(__dirname, '../../dist/index.js'); // Adjust if necessary

interface FileStructure {
    [filePath: string]: string;
}

interface ExecResult {
    stdout: string;
    stderr: string;
    exitCode: number;
}

// Helper function to run Taylored CLI
async function runTaylored(args: string, cwd: string): Promise<ExecResult> {
    return new Promise((resolve) => {
        let stdout = '';
        let stderr = '';
        try {
            stdout = execSync(`node ${tayloredExecutable} ${args}`, { cwd, encoding: 'utf8', stdio: 'pipe' });
        } catch (error: any) {
            // execSync throws an error for non-zero exit codes
            stdout = error.stdout?.toString() || '';
            stderr = error.stderr?.toString() || '';
            resolve({ stdout, stderr, exitCode: error.status || 1 });
            return;
        }
        resolve({ stdout, stderr, exitCode: 0 });
    });
}

// Helper function to set up a temporary Git repository
async function setupTestRepo(initialFiles: FileStructure = {}): Promise<string> {
    const repoDir = await fs.mkdtemp(path.join(__dirname, 'taylored-test-compute-'));
    const execOpts: ExecSyncOptions = { cwd: repoDir, stdio: 'pipe' };

    try {
        execSync('git init', execOpts);
        execSync(`git checkout -b ${BASE_BRANCH_NAME}`, execOpts); // Create and switch to base branch
        execSync('git config user.email "test@example.com"', execOpts);
        execSync('git config user.name "Test User"', execOpts);

        if (Object.keys(initialFiles).length > 0) {
            for (const [filePath, content] of Object.entries(initialFiles)) {
                const dir = path.dirname(path.join(repoDir, filePath));
                await fs.mkdir(dir, { recursive: true });
                await fs.writeFile(path.join(repoDir, filePath), content);
                execSync(`git add "${filePath}"`, execOpts);
            }
            execSync('git commit -m "Initial commit"', execOpts);
        } else {
            // Make an initial empty commit if no files are provided so the branch exists
            execSync('git commit --allow-empty -m "Initial empty commit"', execOpts);
        }
    } catch (error) {
        await fs.rm(repoDir, { recursive: true, force: true }); // Cleanup on error
        throw error;
    }
    return repoDir;
}

// Helper function to clean up the temporary Git repository
async function cleanupTestRepo(repoDir: string | null): Promise<void> {
    if (repoDir) {
        try {
            await fs.rm(repoDir, { recursive: true, force: true });
        } catch (error) {
            console.warn(`Could not remove test repo: ${repoDir}`, error);
        }
    }
}

describe('Taylored --automatic with compute attribute', () => {
    let repoPath: string | null = null;

    beforeEach(async () => {
        // Setup can be done here if needed for every test, or per test
    }, JEST_TIMEOUT);

    afterEach(async () => {
        if (repoPath) {
            await cleanupTestRepo(repoPath);
            repoPath = null;
        }
    }, JEST_TIMEOUT);

    it('Test Case 1: Basic compute functionality', async () => {
        const testFileName = 'test-file.js';
        const initialContent = `console.log("Initial content.");

// <taylored 1 compute="">
// #!/usr/bin/env node
// console.log("Hello from script!");
// </taylored>

console.log("Post-block content.");
`;
        repoPath = await setupTestRepo({ [testFileName]: initialContent });

        const result = await runTaylored(`--automatic js ${BASE_BRANCH_NAME}`, repoPath);
        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);

        const tayloredFilePath = path.join(repoPath, TAYLORED_DIR_NAME, `1${TAYLORED_FILE_EXTENSION}`);
        expect(await fs.access(tayloredFilePath).then(() => true).catch(() => false)).toBe(true);

        // Apply the patch
        try {
            execSync(`git apply "${tayloredFilePath}"`, { cwd: repoPath, stdio: 'pipe' });
        } catch (e: any) {
            console.error("Error applying patch:", e.stdout?.toString(), e.stderr?.toString());
            throw e;
        }

        const updatedContent = await fs.readFile(path.join(repoPath, testFileName), 'utf-8');
        const expectedContent = `console.log("Initial content.");

Hello from script!

console.log("Post-block content.");
`;
        // Normalize line endings for comparison
        expect(updatedContent.replace(/\r\n/g, '\n')).toBe(expectedContent.replace(/\r\n/g, '\n'));

    }, JEST_TIMEOUT);

    // Further test cases will be added here

    it('Test Case 2: compute with character stripping', async () => {
        const testFileName = 'test-file.js';
        // Note: The script inside compute must be a single line or correctly formatted for `node -e "..."`
        // For multi-line, ensure newlines are handled or use a helper to make it a single cmd.
        // Here, we'll make it a simple one-liner after stripping.
        const initialContent = `console.log("Initial content.");

// <taylored 2 compute="/*SCRIPT_BLOCK_COMMENT_PREFIX*/">
/*SCRIPT_BLOCK_COMMENT_PREFIX*/process.stdout.write('Output after stripping.');
// </taylored>

console.log("Post-block content.");
`;
        repoPath = await setupTestRepo({ [testFileName]: initialContent });

        const result = await runTaylored(`--automatic js ${BASE_BRANCH_NAME}`, repoPath);
        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);

        const tayloredFilePath = path.join(repoPath, TAYLORED_DIR_NAME, `2${TAYLORED_FILE_EXTENSION}`);
        expect(await fs.access(tayloredFilePath).then(() => true).catch(() => false)).toBe(true);

        execSync(`git apply "${tayloredFilePath}"`, { cwd: repoPath, stdio: 'pipe' });

        const updatedContent = await fs.readFile(path.join(repoPath, testFileName), 'utf-8');
        const expectedContent = `console.log("Initial content.");

Output after stripping.
console.log("Post-block content.");
`;
        expect(updatedContent.replace(/\r\n/g, '\n')).toBe(expectedContent.replace(/\r\n/g, '\n'));
    }, JEST_TIMEOUT);

    it('Test Case 3: Script execution error', async () => {
        const testFileName = 'test-file.js';
        const initialContent = `console.log("Initial content.");

// <taylored 3 compute="">
// #!/usr/bin/env node
// throw new Error("Intentional script failure!");
// </taylored>

console.log("Post-block content.");
`;
        repoPath = await setupTestRepo({ [testFileName]: initialContent });

        const result = await runTaylored(`--automatic js ${BASE_BRANCH_NAME}`, repoPath);

        // Expect a non-zero exit code and an error message
        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('Error executing script in block 3');
        expect(result.stderr).toContain('Intentional script failure!');

        const tayloredFilePath = path.join(repoPath, TAYLORED_DIR_NAME, `3${TAYLORED_FILE_EXTENSION}`);
        // The .taylored file should ideally not be created, or if it is (due to current error handling),
        // it might represent the removal of the block before the script error is caught.
        // For this test, we primarily care that the process failed as expected.
        // Depending on implementation, the file might not exist or the overall process might halt.
        // Given the current implementation throws, the file related to THIS block (3.taylored)
        // will not be created because the error occurs before the final rename.
        // The intermediate main.taylored might exist if not cleaned up by the error handler.
        expect(await fs.access(tayloredFilePath).then(() => true).catch(() => false)).toBe(false);
         // Check that the original file is unchanged (or restored)
        const originalFileContentCheck = await fs.readFile(path.join(repoPath, testFileName), 'utf-8');
        expect(originalFileContentCheck.replace(/\r\n/g, '\n')).toBe(initialContent.replace(/\r\n/g, '\n'));

    }, JEST_TIMEOUT);

    it('Test Case 4: No compute attribute (control)', async () => {
        const testFileName = 'test-file.js';
        const blockContent = `// This is a standard block.
// console.log("Standard block content");`;
        const initialContent = `console.log("Initial content.");

// <taylored 4>
${blockContent}
// </taylored>

console.log("Post-block content.");
`;
        repoPath = await setupTestRepo({ [testFileName]: initialContent });

        const result = await runTaylored(`--automatic js ${BASE_BRANCH_NAME}`, repoPath);
        expect(result.stderr).toBe('');
        expect(result.exitCode).toBe(0);

        const tayloredFilePath = path.join(repoPath, TAYLORED_DIR_NAME, `4${TAYLORED_FILE_EXTENSION}`);
        expect(await fs.access(tayloredFilePath).then(() => true).catch(() => false)).toBe(true);

        execSync(`git apply "${tayloredFilePath}"`, { cwd: repoPath, stdio: 'pipe' });

        // Expected content is the same as initial because the block is "added back" by the patch
        // The --automatic command creates a patch that represents adding the block.
        // So applying this patch to a file that *already has the block removed by the temp commit*
        // effectively re-adds the block.
        // Since the original file in our test setup *contains* the block, and the --automatic
        // operation doesn't change the working directory files on the original branch,
        // applying the patch here is more of a test of the patch content itself.
        // A more accurate test of "applying" would be to first git checkout the base branch,
        // then apply. But for this test, we're verifying the patch correctly captures the block.

        // Let's verify the patch content instead of re-applying to the same file state.
        const patchContent = await fs.readFile(tayloredFilePath, 'utf-8');
        expect(patchContent).toContain('+Initial content.'); // Context line
        expect(patchContent).toContain(`+// <taylored 4>`);
        for(const line of blockContent.split('\n')) {
            expect(patchContent).toContain(`+${line}`);
        }
        expect(patchContent).toContain(`+// </taylored>`);
        expect(patchContent).toContain('+Post-block content.'); // Context line

        // If we were to apply it to the original file *after* the automatic command (which doesn't change it on the current branch)
        // it would lead to duplicated content or a failed patch.
        // The test setup for "automatic" implies the user wants to generate patches from existing, marked-up code.
        // The application of such a patch would typically be to a version of the code *without* those markers yet.
        // So, let's simulate applying it to a clean state.

        // 1. Commit current state
        execSync(`git add "${testFileName}"`, { cwd: repoPath });
        execSync(`git commit -m "Before applying patch 4"`, { cwd: repoPath });

        // 2. Go to base branch (which doesn't have the block yet, effectively)
        //    Or, more simply for this test, remove the block manually to simulate the state
        //    against which the patch was generated.
        const contentWithoutBlock = `console.log("Initial content.");

console.log("Post-block content.");
`;
        await fs.writeFile(path.join(repoPath, testFileName), contentWithoutBlock);

        // 3. Apply patch
        execSync(`git apply "${tayloredFilePath}"`, { cwd: repoPath, stdio: 'pipe' });
        const finalContent = await fs.readFile(path.join(repoPath, testFileName), 'utf-8');
        expect(finalContent.replace(/\r\n/g, '\n')).toBe(initialContent.replace(/\r\n/g, '\n'));


    }, JEST_TIMEOUT);
});

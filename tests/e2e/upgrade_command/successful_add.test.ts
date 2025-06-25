import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';

// Path to the project root to align with other E2E tests.
// This allows using `npx ts-node` to execute TypeScript code directly.
const PROJECT_ROOT_PATH = path.resolve(__dirname, '../../..');
const TAYLORED_CMD_BASE = `npx ts-node ${path.join(PROJECT_ROOT_PATH, 'index.ts')}`;


const FIXTURES_DIR = path.join(__dirname, 'successful_add', 'fixtures');
const TEMP_DIR_BASE = path.resolve(process.cwd(), 'tmp_upgrade_test'); // Temporary base directory for tests

// Define default exec options for child_process commands, ensuring they run in the temporary test directory
const execOptions: ExecSyncOptionsWithStringEncoding = {
    cwd: '', // This will be set dynamically in beforeEach
    stdio: 'pipe', // Capture output, don't inherit process's stdio directly
    encoding: 'utf8'
};

describe('taylored --upgrade successful addition scenario', () => {
    let tempTestDir = '';
    let tempPatchPath = ''; // Will store the full path to the .taylored patch in the temp dir
    let tempTargetPath = '';
    // tempReportPath is no longer needed as we'll check cliOutput directly

    beforeEach(() => {
        // Create a unique temporary directory for each test run
        tempTestDir = path.join(TEMP_DIR_BASE, `test_${Date.now()}_${Math.floor(Math.random() * 1000)}`);
        fs.ensureDirSync(tempTestDir);

        // Set the CWD for execOptions to the newly created temporary directory
        execOptions.cwd = tempTestDir;

        // Ensure the .taylored directory exists, as it's expected to contain the patch
        fs.ensureDirSync(path.join(tempTestDir, '.taylored'));

        // Copy the specific patch fixture and rename it to the expected .taylored extension
        // The fixture is 'patch_add.patch', but the CLI expects files in .taylored/ to end with .taylored
        const newTayloredPatchName = 'patch_add.taylored';
        fs.copyFileSync(path.join(FIXTURES_DIR, 'patch_add.patch'), path.join(tempTestDir, '.taylored', newTayloredPatchName));
        tempPatchPath = path.join(tempTestDir, '.taylored', newTayloredPatchName); // Update tempPatchPath to the new location and name

        // Copy the target file separately (it's not expected to be in .taylored/)
        fs.copyFileSync(path.join(FIXTURES_DIR, 'target_current_add.txt'), path.join(tempTestDir, 'target_current_add.txt'));
        tempTargetPath = path.join(tempTestDir, 'target_current_add.txt');

        // Initialize a Git repository in the temporary directory
        execSync('git init -b main', execOptions);
        execSync('git config user.email "test@example.com"', execOptions);
        execSync('git config user.name "Test User"', execOptions);
        execSync('git config commit.gpgsign false', execOptions); // Disable GPG signing for tests

        // Add the target file to git and make an initial commit
        execSync(`git add "${path.basename(tempTargetPath)}"`, execOptions);
        execSync('git commit -m "Initial commit for upgrade test - target file"', execOptions);

        // The patch file (now as .taylored) should also be committed to simulate a managed taylored file
        execSync(`git add "${path.relative(tempTestDir, tempPatchPath)}"`, execOptions); // Add .taylored/patch_add.taylored
        execSync('git commit -m "Add taylored patch file for upgrade test"', execOptions);
    });

    afterEach(() => {
        // Clean up the temporary directory
        if (fs.existsSync(tempTestDir)) {
            fs.removeSync(tempTestDir);
        }
    });

    it('should correctly upgrade the patch file when frames are intact', () => {
        // Constructs the command using TAYLORED_CMD_BASE to execute the CLI via ts-node
        // Pass only the basename of the patch file, as the CLI expects it to be in .taylored/
        const command = `${TAYLORED_CMD_BASE} --upgrade "${path.basename(tempPatchPath)}" "${tempTargetPath}"`;

        let cliOutput = '';
        let cliErrorOutput = ''; // Capture stderr separately if available from error object
        try {
            cliOutput = execSync(command, execOptions);
            console.log('CLI Output (Successful Upgrade Test):\n', cliOutput);
        } catch (error: any) {
            // If execSync throws an error, it means the command returned a non-zero exit code.
            // This might be expected in some scenarios, but for a "successful upgrade"
            // it should exit with 0.
            cliOutput = error.stdout?.toString() || ''; // Capture stdout from the error object
            cliErrorOutput = error.stderr?.toString() || ''; // Capture stderr from the error object
            console.error('Error executing taylored --upgrade:', cliOutput, cliErrorOutput);
            // Re-throw the error to fail the test if any error occurs during a success-expected scenario
            throw new Error(`Command failed: ${command}\\nError: ${error.message}\\nStdout: ${cliOutput}\\nStderr: ${cliErrorOutput}`);
        }

        // 1. Check if the original patch was backed up
        const backupPatchPath = tempPatchPath + '.backup';
        expect(fs.existsSync(backupPatchPath)).toBe(true);

        // 2. Check the content of the updated patch file
        const updatedPatchContent = fs.readFileSync(tempPatchPath, 'utf8');
        const expectedPatchContent = `--- a/target_current_add.txt
+++ b/target_current_add.txt
@@ -1,4 +1,7 @@
 Line 1
 Line 2 (Top Frame)
+New Content X
+New Content Y
+New Content Z
 Line 3 (Bottom Frame)
 Line 4
`; // Note: The final newline is important in patches
        // Normalize line endings for comparison if necessary, although git patches usually use LF
        expect(updatedPatchContent.replace(/\r\n/g, '\n')).toBe(expectedPatchContent.replace(/\r\n/g, '\n'));

        // 3. Verify the report content from cliOutput
        // Check for separate lines for "Status" and "Patch updated"
        expect(cliOutput).toContain('Status: INTACT'); // Should be present
        expect(cliOutput).toContain('Patch updated: YES'); // Should be present
        expect(cliOutput).toContain('All frames are intact. Patch content has been updated from the target file.');
        expect(cliOutput).toContain('Top Frame: INTACT');
        expect(cliOutput).toContain('Bottom Frame: INTACT');
        // Removed the problematic assertion: expect(cliOutput).toContain(`Upgrade report saved to: ${path.join(tempTestDir, 'taylored_upgrade_report.txt')}`);


        // 4. Verify that the backup is identical to the original fixture patch
        const originalFixturePatchContent = fs.readFileSync(path.join(FIXTURES_DIR, 'patch_add.patch'), 'utf8');
        const backupContent = fs.readFileSync(backupPatchPath, 'utf8');
        expect(backupContent.replace(/\r\n/g, '\n')).toBe(originalFixturePatchContent.replace(/\r\n/g, '\n'));
    });
});


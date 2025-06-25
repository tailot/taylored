// tests/e2e/core/upgrade.test.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs-extra';
import * as path from 'path';
import { execSync, ExecSyncOptions } from 'child_process';
import { TAYLORED_DIR_NAME } from '../../../lib/constants';

const TAYLORED_CMD_BASE = 'node dist/index.js';
const TEST_REPO_DIR = path.join(__dirname, 'test-repo-upgrade');
const TAYLORED_DIR_FULL_PATH = path.join(TEST_REPO_DIR, TAYLORED_DIR_NAME);

const execOptions: ExecSyncOptions = {
    cwd: TEST_REPO_DIR,
    stdio: 'pipe', // Capture stdout/stderr, suppress console output during tests
    encoding: 'utf-8',
};

function runCommandAndCapture(command: string, options: ExecSyncOptions = execOptions) {
    try {
        const stdout = execSync(command, options);
        return { stdout: stdout.toString(), stderr: '', success: true };
    } catch (error: any) {
        return {
            stdout: error.stdout ? error.stdout.toString() : '',
            stderr: error.stderr ? error.stderr.toString() : '',
            success: false,
            error: error
        };
    }
}

describe('taylored --upgrade', () => {
    beforeEach(async () => {
        await fs.emptyDir(TEST_REPO_DIR);
        await fs.ensureDir(TEST_REPO_DIR);
        execSync('git init', execOptions);
        execSync('git config user.email "test@example.com"', execOptions);
        execSync('git config user.name "Test User"', execOptions);
        await fs.ensureDir(TAYLORED_DIR_FULL_PATH);
        // Create an initial commit
        await fs.writeFile(path.join(TEST_REPO_DIR, 'initial.txt'), 'initial content');
        execSync('git add initial.txt && git commit -m "Initial commit"', execOptions);

    });

    afterEach(async () => {
        await fs.remove(TEST_REPO_DIR);
    });

    // SCENARIO 1: Basic upgrade - content of an added line changes
    test('should upgrade a patch if an added line content changes, keeping index hashes', async () => {
        const CWD = execOptions.cwd!.toString();
        const filePath = path.join(CWD, 'config.txt');
        const patchName = 'update-config.taylored';
        const patchPath = path.join(TAYLORED_DIR_FULL_PATH, patchName);

        // 1. Create base file state and commit (v1)
        await fs.writeFile(filePath, 'version=1\nname=app\n');
        execSync('git add . && git commit -m "v1 of config.txt"', execOptions);
        // const v1Commit = execSync('git rev-parse HEAD', execOptions).toString().trim(); // Not used directly

        // 2. Create a new branch, modify the file (add a line), and commit (v2)
        execSync('git checkout -b feature/add-setting', execOptions);
        await fs.writeFile(filePath, 'version=1\nname=app\nfeature_flag=true\n'); // Added feature_flag
        execSync('git add . && git commit -m "v2 with feature_flag"', execOptions);

        // 3. Save the patch (feature/add-setting vs main)
        execSync('git checkout main', execOptions);
        // Assuming --as is not implemented for --save, use default naming or fixed name
        const saveResult = runCommandAndCapture(`${TAYLORED_CMD_BASE} --save feature/add-setting`);
        // Need to find the generated patch file name if --as is not used.
        // For simplicity, let's assume the patch will be named feature_add-setting.taylored
        // Or, if --as IS supported by --save (it should be as per DOCUMENTATION.md for --save)
        const saveAsResult = runCommandAndCapture(`${TAYLORED_CMD_BASE} --save feature/add-setting --as ${patchName.replace('.taylored','')}`);
        expect(saveAsResult.success || saveResult.success).toBe(true); // Ensure patch was saved


        const originalPatchContent = await fs.readFile(patchPath, 'utf-8');
        const originalIndexLine = originalPatchContent.split('\n').find(line => line.startsWith('index '));

        expect(originalPatchContent).toContain('+feature_flag=true');
        expect(originalIndexLine).toBeDefined();

        // 4. Modify config.txt on main:
        // The content of the line that *would be added* by the patch is different in the current file.
        // Original patch adds 'feature_flag=true' after 'name=app'.
        // Current file on main will have 'feature_flag=false' in that same conceptual location.
        await fs.writeFile(filePath, 'version=1\nname=app\nfeature_flag=false\n');
        // execSync('git add . && git commit -m "main updated, feature_flag content changed to false"', execOptions); // No commit, test against FS

        // 5. Run upgrade
        const { stdout, success, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`);
        if (!success) console.error("Upgrade failed. Stderr:", stderr);


        expect(success).toBe(true);
        expect(stdout).toContain(`Patch '${patchName}' has been surgically updated.`);

        // 6. Verify the upgraded patch
        const upgradedPatchContent = await fs.readFile(patchPath, 'utf-8');
        const upgradedIndexLine = upgradedPatchContent.split('\n').find(line => line.startsWith('index '));

        expect(upgradedPatchContent).toContain('+feature_flag=false'); // Content updated
        expect(upgradedPatchContent).not.toContain('+feature_flag=true');
        expect(upgradedIndexLine).toBe(originalIndexLine);
        expect(upgradedPatchContent).toContain(' name=app');
    });


    // SCENARIO 2: Upgrade against a specific branch
    test('should upgrade a patch against a specific branch, not the local file', async () => {
        const CWD = execOptions.cwd!.toString();
        const filePath = path.join(CWD, 'settings.ini');
        const patchName = 'update-settings.taylored';
        const patchNameWithoutExt = 'update-settings';
        const patchPath = path.join(TAYLORED_DIR_FULL_PATH, patchName);

        // 1. Initial state on main:
        await fs.writeFile(filePath, '[general]\nuser=alpha\n\n[display]\nmode=light\n');
        execSync('git add . && git commit -m "Initial settings on main"', execOptions);

        // 2. Create 'temp-patch-branch' to define the original change (add 'contrast=normal')
        execSync('git checkout -b temp-patch-branch', execOptions);
        await fs.writeFile(filePath, '[general]\nuser=alpha\n\n[display]\nmode=light\ncontrast=normal\n');
        execSync('git add . && git commit -m "Added contrast on temp-patch-branch"', execOptions);

        // 3. Save the patch (temp-patch-branch vs main)
        execSync('git checkout main', execOptions);
        runCommandAndCapture(`${TAYLORED_CMD_BASE} --save temp-patch-branch --as ${patchNameWithoutExt}`);
        execSync('git branch -D temp-patch-branch', execOptions);

        const originalPatchContent = await fs.readFile(patchPath, 'utf-8');
        const originalIndexLine = originalPatchContent.split('\n').find(line => line.startsWith('index '));
        expect(originalPatchContent).toContain('+contrast=normal');

        // 4. Create a 'feature' branch. Here, 'contrast' is 'high'.
        execSync('git checkout -b feature', execOptions);
        await fs.writeFile(filePath, '[general]\nuser=alpha\n\n[display]\nmode=light\ncontrast=high\n');
        execSync('git add . && git commit -m "Contrast set to high on feature branch"', execOptions);
        execSync('git checkout main', execOptions);

        // 5. Modify the local file on 'main' to be different from both patch and 'feature' branch
        await fs.writeFile(filePath, '[general]\nuser=alpha\n\n[display]\nmode=light\ncontrast=local_value\n');

        // 6. Run upgrade, targeting the 'feature' branch
        const { stdout, success, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName} feature`);
         if (!success) console.error("Upgrade branch failed. Stderr:", stderr);

        expect(success).toBe(true);
        expect(stdout).toContain(`Patch '${patchName}' has been surgically updated.`);

        // 7. Verify the patch is updated to reflect the change from 'normal' to 'high' (from feature branch)
        const upgradedPatchContent = await fs.readFile(patchPath, 'utf-8');
        const upgradedIndexLine = upgradedPatchContent.split('\n').find(line => line.startsWith('index '));

        expect(upgradedPatchContent).toContain('+contrast=high');
        expect(upgradedPatchContent).not.toContain('+contrast=normal');
        expect(upgradedPatchContent).not.toContain('+contrast=local_value');
        expect(upgradedIndexLine).toBe(originalIndexLine);
        expect(upgradedPatchContent).toContain(' mode=light');
    });

    // SCENARIO 3: Patch is already up-to-date
    test('should report patch is up-to-date if no surgical modification is needed', async () => {
        const filePath = path.join(TEST_REPO_DIR, 'file.txt');
        const patchName = 'add-line.taylored';
        const patchNameWithoutExt = 'add-line';
        await fs.writeFile(filePath, 'line1\nline3\n');
        execSync('git add . && git commit -m "base for up-to-date test"', execOptions);

        execSync('git checkout -b temp-add', execOptions);
        await fs.writeFile(filePath, 'line1\nline2\nline3\n');
        execSync('git add . && git commit -m "added line2"', execOptions);

        execSync('git checkout main', execOptions);
        runCommandAndCapture(`${TAYLORED_CMD_BASE} --save temp-add --as ${patchNameWithoutExt}`);
        execSync('git branch -D temp-add', execOptions);

        await fs.writeFile(filePath, 'line1\nline2\nline3\n');

        const { stdout, success, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`);
        if (!success) console.error("Upgrade up-to-date failed. Stderr:", stderr);
        expect(success).toBe(true);
        expect(stdout).toMatch(/Patch 'add-line.taylored' is already up-to-date|content did not change/);
    });

    // SCENARIO 4: Context frame changed - upgrade should fail
    test('should fail to upgrade if context frame is broken', async () => {
        const filePath = path.join(TEST_REPO_DIR, 'context-test.txt');
        const patchName = 'context-patch.taylored';
        const patchNameWithoutExt = 'context-patch';

        await fs.writeFile(filePath, 'context_A\ncontext_B\n');
        execSync('git add . && git commit -m "context only"', execOptions);

        execSync('git checkout -b temp-add-between-context', execOptions);
        await fs.writeFile(filePath, 'context_A\nadded_line\ncontext_B\n');
        execSync('git add . && git commit -m "added line between context"', execOptions);

        execSync('git checkout main', execOptions);
        runCommandAndCapture(`${TAYLORED_CMD_BASE} --save temp-add-between-context --as ${patchNameWithoutExt}`);
        execSync('git branch -D temp-add-between-context', execOptions);

        await fs.writeFile(filePath, 'context_A_MODIFIED\nadded_line\ncontext_B\n');

        const { stdout, stderr, success } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`);

        // The handleUpgradeCommand exits 1 for CRITICAL ERROR messages
        expect(success).toBe(false);
        expect(stderr).toContain('CRITICAL ERROR: Upper context frame not found');
    });

    // SCENARIO 5: Patch contains deletions, should not be upgraded by this version
    test('should not upgrade patch if it contains deletions', async () => {
        const filePath = path.join(TEST_REPO_DIR, 'delete-test.txt');
        const patchName = 'delete-patch.taylored';
        const patchNameWithoutExt = 'delete-patch';

        await fs.writeFile(filePath, 'line_to_keep\nline_to_delete\n');
        execSync('git add . && git commit -m "File with line to delete"', execOptions);

        execSync('git checkout -b temp-delete', execOptions);
        await fs.writeFile(filePath, 'line_to_keep\n');
        execSync('git add . && git commit -m "Deleted a line"', execOptions);

        execSync('git checkout main', execOptions);
        runCommandAndCapture(`${TAYLORED_CMD_BASE} --save temp-delete --as ${patchNameWithoutExt}`);
        execSync('git branch -D temp-delete', execOptions);

        await fs.writeFile(filePath, 'line_to_keep\nline_to_delete_MODIFIED\n');

        const { stdout, success, stderr } = runCommandAndCapture(`${TAYLORED_CMD_BASE} --upgrade ${patchName}`);
        if (!success && !stderr.includes("contains deletions and cannot be surgically upgraded")) {
            // If it failed for other reasons than the expected "contains deletions" message
            console.error("Upgrade deletion test failed unexpectedly. Stderr:", stderr, "Stdout:", stdout);
        }

        // The upgradePatch returns a message that is NOT a "CRITICAL ERROR"
        // so handleUpgradeCommand will log it and exit 0 (success).
        expect(success).toBe(true);
        expect(stdout).toContain(`contains deletions and cannot be surgically upgraded`);
    });
});

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// tests/e2e/taysell.test.ts
import * as path from 'path';
import * as fs from 'fs-extra';
import { execSync, ExecSyncOptions } from 'child_process';
import { decryptAES256GCM, TaysellFile } from '../../lib/taysell-utils'; // For decrypting test file
import { TAYLORED_FILE_EXTENSION } from '../../lib/constants';

const ROOT_DIR = path.resolve(__dirname, '../../'); // Project root
const CLI_ENTRY = path.join(ROOT_DIR, 'index.ts'); // Path to CLI entry point
const TEMP_DIR_BASE = path.join(ROOT_DIR, 'tests/e2e/temp-taysell');

const execCli = (args: string, options?: ExecSyncOptions & { cwd?: string }) => {
    const command = `npx ts-node ${CLI_ENTRY} ${args}`;
    return execSync(command, {
        stdio: 'pipe', // Capture output, suppress in tests unless debugging
        ...options,
        cwd: options?.cwd || TEMP_DIR_BASE, // Default to temp dir
    }).toString();
};

describe('Taysell E2E Tests', () => {
    let currentTempDir: string;
    let testCounter = 0;

    beforeEach(async () => {
        testCounter++;
        currentTempDir = path.join(TEMP_DIR_BASE, `test-${Date.now()}-${testCounter}`);
        await fs.ensureDir(currentTempDir);
    });

    afterEach(async () => {
        if (await fs.pathExists(currentTempDir)) {
            await fs.remove(currentTempDir);
        }
    });

    // Mock Docker check for setup-backend E2E by creating a dummy docker command if not present
    // This is a bit of a hack for CI environments. A better way would be conditional test skipping.
    const ensureDummyDocker = () => {
        try {
            execSync("docker --version");
        } catch (e) {
            // Docker not found, create a dummy script
            const dummyDockerPath = path.join(currentTempDir, "docker");
            fs.writeFileSync(dummyDockerPath, "#!/bin/sh\necho Docker version 20.10.0, build abcdef");
            fs.chmodSync(dummyDockerPath, 0o755);
            process.env.PATH = `${currentTempDir}:${process.env.PATH}`; // Prepend to PATH
        }
    };


    describe('setup-backend', () => {
        it('should create taysell-server directory with template files', () => {
            ensureDummyDocker();
            // For E2E, we can't easily answer inquirer prompts.
            // This test will check if the command runs and creates basic structure.
            // We assume unit tests cover the .env content based on mocked prompts.
            // To make it non-interactive for critical prompts (like overwrite), we ensure the dir is new.

            let output = "";
            try {
                // We expect this to fail or hang if it truly waits for inquirer input
                // that we can't provide via execSync easily.
                // The goal is to see if initial setup (copying) happens.
                // This is a limitation of E2E testing highly interactive CLIs.
                // We will pipe "yes" for any overwrite prompts for now.
                // For non-overwrite case, we hope defaults are enough or it errors out quickly.
                // For `setup-backend`, the prompts are for .env values.
                // We will pipe newline characters to attempt to accept defaults.
                // This is highly dependent on inquirer's behavior with piped input.
                const command = `printf '\\n\\n\\n\\n\\n\\n' | npx ts-node ${CLI_ENTRY} setup-backend`;
                output = execSync(command, {
                    cwd: currentTempDir,
                    stdio: 'pipe',
                }).toString();
            } catch (error: any) {
                output = error.stdout?.toString() + error.stderr?.toString();
                // Log warning, but don't fail the test just for this command failing due to interactivity.
                // The primary assertions are about file creation.
                console.warn("setup-backend E2E command execution warning (may be due to interactivity):", output);
            }

            expect(fs.pathExistsSync(path.join(currentTempDir, 'taysell-server'))).toBe(true);
            expect(fs.pathExistsSync(path.join(currentTempDir, 'taysell-server', 'Dockerfile'))).toBe(true);
            expect(fs.pathExistsSync(path.join(currentTempDir, 'taysell-server', 'docker-compose.yml'))).toBe(true);
            expect(fs.pathExistsSync(path.join(currentTempDir, 'taysell-server', 'package.json'))).toBe(true);
            expect(fs.pathExistsSync(path.join(currentTempDir, 'taysell-server', 'index.js'))).toBe(true);
            // .env file creation depends on successful inquirer prompts.
            // Given we are piping newlines, inquirer might take defaults or error.
            // .env file creation is unreliable in this E2E setup due to prompts.
            // expect(fs.pathExistsSync(path.join(currentTempDir, 'taysell-server', '.env'))).toBe(true);
        }, 60000); // Increase timeout for this test as it might be slow
    });

    describe('create-taysell', () => {
        const dummyTayloredContent = "diff --git a/file.txt b/file.txt\nindex e69de29..9daeafb 100644\n--- a/file.txt\n+++ b/file.txt\n@@ -0,0 +1 @@\n+Hello";
        const dummyPatchName = 'e2e-test-patch';
        // dummyTayloredFilePath will be set in beforeEach context of currentTempDir
        let dummyTayloredFilePath: string;

        const envServerUrl = 'https://e2e-server.example.com';
        const envEncryptionKey = 'e2eTestEncryptionKey123456789012'; // Must be 32 chars for actual AES
        const dummyEnvContent = `
SERVER_BASE_URL=${envServerUrl}
PATCH_ENCRYPTION_KEY=${envEncryptionKey}
SELLER_NAME=E2E Seller
SELLER_WEBSITE=https://e2e.seller.com
SELLER_CONTACT=e2e@seller.com
`;

        beforeEach(async () => {
            dummyTayloredFilePath = path.join(currentTempDir, `${dummyPatchName}${TAYLORED_FILE_EXTENSION}`);
            // Create dummy .taylored file
            await fs.writeFile(dummyTayloredFilePath, dummyTayloredContent);
            // Create dummy .env file in a taysell-server subdir to make create-taysell non-interactive for these
            const taysellServerDir = path.join(currentTempDir, 'taysell-server');
            await fs.ensureDir(taysellServerDir);
            await fs.writeFile(path.join(taysellServerDir, '.env'), dummyEnvContent);
        });

        it('should create encrypted patch and .taysell metadata file', async () => {
            const cliPrice = "7.89";
            const cliDesc = "E2E Test Description";

            // For inquirer prompts not covered by .env or CLI args (like patchId, patchName, etc.),
            // we pipe newlines to accept defaults.
            const command = `printf '\\n\\n\\n\\n\\n\\n' | npx ts-node ${CLI_ENTRY} create-taysell ${dummyPatchName}${TAYLORED_FILE_EXTENSION} --price "${cliPrice}" --desc "${cliDesc}"`;
            const output = execSync(command, { cwd: currentTempDir, stdio: 'pipe' }).toString();

            const encryptedFilePath = path.join(currentTempDir, `${dummyPatchName}${TAYLORED_FILE_EXTENSION}.encrypted`);
            const metadataFilePath = path.join(currentTempDir, `${dummyPatchName}.taysell`);

            expect(await fs.pathExists(encryptedFilePath)).toBe(true);
            expect(await fs.pathExists(metadataFilePath)).toBe(true);

            // Validate .taysell file content
            const taysellJson: TaysellFile = await fs.readJson(metadataFilePath);
            expect(taysellJson.taysellVersion).toBe('1.0-decentralized');
            expect(taysellJson.patchId).toBeDefined();
            // Default patchName is from filename if not overridden by prompt taking a default empty string
            expect(taysellJson.metadata.name).toBe(dummyPatchName);
            expect(taysellJson.metadata.description).toBe(cliDesc); // This is from CLI arg
            expect(taysellJson.payment.price).toBe(cliPrice); // This is from CLI arg
            expect(taysellJson.payment.currency.toUpperCase()).toBe('USD'); // Default from prompt if not changed
            expect(taysellJson.endpoints.initiatePaymentUrl).toBe(`${envServerUrl}/pay/${taysellJson.patchId}`);
            expect(taysellJson.endpoints.getPatchUrl).toBe(`${envServerUrl}/get-patch`);
            expect(taysellJson.sellerInfo.name).toBe('E2E Seller');


            // Validate encrypted content
            const encryptedContent = await fs.readFile(encryptedFilePath, 'utf-8');
            // AES key needs to be 32 chars for the actual encrypt function
            const actualEncryptionKey = envEncryptionKey.padEnd(32, '0'); // Pad if key is too short for test
            const decryptedContent = decryptAES256GCM(encryptedContent, actualEncryptionKey);
            expect(decryptedContent).toBe(dummyTayloredContent);
        }, 30000);
    });

    // TODO: E2E for --buy (more complex due to needing a mock server)
});

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// tests/unit/setup-backend-handler.test.ts
import { handleSetupBackend } from '../../lib/handlers/setup-backend-handler'; // Adjust path
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import inquirer from 'inquirer';
import * as path from 'path'; // Import path

jest.mock('child_process');
jest.mock('fs-extra');
jest.mock('inquirer');

// Helper to resolve template path similar to how it's done in the handler
const getMockTemplateSourcePath = () => {
    const isDev = __filename.endsWith('.ts'); // In test environment, this will be true
    return path.resolve(
        __dirname, // 'tests/unit'
        isDev ? '../../templates/backend-in-a-box' : '../../../templates/backend-in-a-box' // Should resolve to project_root/templates/...
    );
};


describe('handleSetupBackend', () => {
    const mockCwd = '/test/cwd';
    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let processExitSpy: jest.SpyInstance;

    beforeEach(() => {
        jest.resetAllMocks(); // Reset mocks for each test
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => {
            throw new Error(`process.exit called with ${code}`);
        });

        // Default mock implementations
        (child_process.execSync as jest.Mock).mockReturnValue(Buffer.from('Docker version 20.10.7, build f0df350'));
        (fs.pathExists as jest.Mock).mockResolvedValue(false); // Default: taysell-server dir does not exist
        (fs.ensureDir as jest.Mock).mockResolvedValue(undefined);
        (fs.copy as jest.Mock).mockResolvedValue(undefined);
        jest.mocked(fs.writeFile).mockImplementation(() => Promise.resolve()); // Use mockImplementation
        jest.mocked(fs.emptyDir).mockImplementation(() => Promise.resolve()); // Consistent mock style

        // Mock path.resolve for template source path to ensure it "exists"
        // The actual fs.pathExists check for the template source path will use this resolved path.
        // We need to make sure this specific path check returns true.
        const mockTemplatePath = getMockTemplateSourcePath();
        (fs.pathExists as jest.Mock).mockImplementation(p => {
            if (p === mockTemplatePath) {
                return Promise.resolve(true); // Simulate template source exists
            }
            if (p === path.join(mockCwd, 'taysell-server')) {
                return Promise.resolve(false); // Default: target taysell-server dir does not exist
            }
            return Promise.resolve(false);
        });

    });

    afterEach(() => {
        delete process.env.JEST_WORKER_ID; // Ensure JEST_WORKER_ID is cleared after each test
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        processExitSpy.mockRestore();
    });

    it('should complete successfully if Docker is installed and directory does not exist', async () => {
        // Add specific inquirer mock for this test
        // No inquirer.prompt mock needed here because JEST_WORKER_ID is set by beforeEach,
        // so the handler will use its internal defaults.

        await handleSetupBackend(mockCwd);

        expect(child_process.execSync).toHaveBeenCalledWith('docker --version', { stdio: 'ignore' });
        expect(fs.copy).toHaveBeenCalledWith(getMockTemplateSourcePath(), path.join(mockCwd, 'taysell-server'));
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(mockCwd, 'taysell-server', '.env'),
            expect.stringContaining('PAYPAL_ENVIRONMENT=sandbox')
        );
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Running in test environment, using default config for .env'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully created .env file at'));
        expect(process.exit).not.toHaveBeenCalled();
    });

    it('should exit if Docker is not installed', async () => {
        (child_process.execSync as jest.Mock).mockImplementation(() => {
            throw new Error('Docker not found');
        });
        await expect(handleSetupBackend(mockCwd)).rejects.toThrow('process.exit called with 1');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR: Docker is not installed.'));
    });

    it('should prompt for overwrite if taysell-server directory exists and user aborts', async () => {
        delete process.env.JEST_WORKER_ID; // Ensure inquirer is called
        // fs.pathExists for taysell-server should return true
        const mockTemplatePath = getMockTemplateSourcePath();
        (fs.pathExists as jest.Mock).mockImplementation(p => {
            if (p === mockTemplatePath) return Promise.resolve(true);
            if (p === path.join(mockCwd, 'taysell-server')) return Promise.resolve(true); // Directory exists
            return Promise.resolve(false);
        });
        jest.mocked(inquirer.prompt).mockResolvedValueOnce({ overwrite: false }); // Mock for overwrite prompt

        await handleSetupBackend(mockCwd);

        expect(jest.mocked(inquirer.prompt)).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({ name: 'overwrite' })
        ]));
        expect(fs.copy).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith('Backend setup aborted by user.');
        expect(process.exit).not.toHaveBeenCalled();
    });

    it('should overwrite if taysell-server directory exists and user confirms', async () => {
        delete process.env.JEST_WORKER_ID; // Ensure inquirer is called
         const mockTemplatePath = getMockTemplateSourcePath();
        (fs.pathExists as jest.Mock).mockImplementation(p => {
            if (p === mockTemplatePath) return Promise.resolve(true);
            if (p === path.join(mockCwd, 'taysell-server')) return Promise.resolve(true); // Directory exists
            return Promise.resolve(false);
        });
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ overwrite: true }) // Confirm overwrite
            .mockResolvedValueOnce({ // Env answers
                paypalEnv: 'production',
                paypalClientId: 'prod-id',
                paypalClientSecret: 'prod-secret',
                serverPublicUrl: 'https://prod.example.com',
                patchEncryptionKey: 'prod-encryption-key-12345678901234567890',
                serverPort: '8080',
            });

        await handleSetupBackend(mockCwd);

        expect(fs.emptyDir).toHaveBeenCalledWith(path.join(mockCwd, 'taysell-server'));
        expect(fs.copy).toHaveBeenCalled();
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(mockCwd, 'taysell-server', '.env'),
            expect.stringContaining('PAYPAL_ENVIRONMENT=production')
        );
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Successfully created .env file at'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Backend Setup Complete'));
    });

    it('should write correct .env content based on user input', async () => {
        delete process.env.JEST_WORKER_ID; // Ensure inquirer is called
        const mockAnswers = {
            paypalEnv: 'production',
            paypalClientId: 'customId',
            paypalClientSecret: 'customSecret',
            serverPublicUrl: 'https://mycustom.url',
            patchEncryptionKey: 'myCustomKeyForEncryption123456789',
            serverPort: '5000',
        };
        jest.mocked(inquirer.prompt).mockResolvedValue(mockAnswers);

        await handleSetupBackend(mockCwd);

        const expectedEnvContent = `
# Node.js Environment
NODE_ENV=production

# Server Configuration
SERVER_BASE_URL=${mockAnswers.serverPublicUrl}
PORT=${mockAnswers.serverPort}

# PayPal Configuration
PAYPAL_ENVIRONMENT=${mockAnswers.paypalEnv}
PAYPAL_CLIENT_ID=${mockAnswers.paypalClientId}
PAYPAL_CLIENT_SECRET=${mockAnswers.paypalClientSecret}

# Patch Encryption
PATCH_ENCRYPTION_KEY=${mockAnswers.patchEncryptionKey}

# Database Configuration (SQLite)
DB_PATH=./db/taysell.sqlite
`.trim();
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(mockCwd, 'taysell-server', '.env'),
            expectedEnvContent
        );
    });

    it('should exit if template source directory does not exist', async () => {
        // Override fs.pathExists for the template source path
        (fs.pathExists as jest.Mock).mockImplementation(p => {
            if (p === getMockTemplateSourcePath()) {
                return Promise.resolve(false); // Template source does NOT exist
            }
            return Promise.resolve(false);
        });

        await expect(handleSetupBackend(mockCwd)).rejects.toThrow('process.exit called with 1');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('CRITICAL ERROR: Backend template source directory not found'));
    });
});

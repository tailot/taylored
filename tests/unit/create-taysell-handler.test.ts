// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// tests/unit/create-taysell-handler.test.ts
import type inquirer_for_types_only from 'inquirer'; // Type-only import
import { handleCreateTaysell } from '../../lib/handlers/create-taysell-handler'; // Adjust path
import * as fs from 'fs-extra';
import inquirer from 'inquirer';
import { v4 as uuidv4 } from 'uuid';
import * as taysellUtils from '../../lib/taysell-utils'; // Import all to mock specific function
import { TAYLORED_FILE_EXTENSION } from '../../lib/constants';

jest.mock('fs-extra');
jest.mock('inquirer');
jest.mock('uuid', () => ({
    ...jest.requireActual('uuid'),
    v4: jest.fn(() => 'default-mock-uuid-v4-from-module-mock'),
}));
jest.mock('../../lib/taysell-utils', () => ({
    ...jest.requireActual('../../lib/taysell-utils'),
    encryptAES256GCM: jest.fn(),
}));

describe('handleCreateTaysell', () => {
    const mockCwd = '/test/cwd';
    const mockTayloredFileName = 'my_patch' + TAYLORED_FILE_EXTENSION;
    const mockFullTayloredPath = `${mockCwd}/${mockTayloredFileName}`;
    const mockEnvPath = `${mockCwd}/taysell-server/.env`;

    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let processExitSpy: jest.SpyInstance;

    const defaultEnvConfig = {
        SERVER_BASE_URL: 'https://api.example.com',
        PATCH_ENCRYPTION_KEY: 'supersecretkey12345678901234567890',
        // PATCH_ID not included by default to test UUID generation
    };

    const defaultInquirerAnswers = {
        patchName: 'My Awesome Patch',
        patchDescription: 'This patch is awesome.',
        patchId: 'custom-patch-id-from-prompt', // Default if not from env/uuid
        tayloredVersion: '>=1.0.0',
        price: '19.99',
        currency: 'EUR',
        sellerName: 'Test Seller Co.',
        sellerWebsite: 'https://seller.example.com',
        sellerContact: 'contact@seller.example.com',
    };

    beforeEach(() => {
        jest.resetAllMocks();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        processExitSpy = jest.spyOn(process, 'exit').mockImplementation((code?: string | number | null | undefined): never => {
            throw new Error(`process.exit called with ${code}`);
        });

        jest.mocked(fs.pathExists).mockImplementation(async p => {
            if (p === mockFullTayloredPath) return true; // Taylored file exists
            if (p === mockEnvPath) return true; // .env file exists by default
            return false;
        });
        jest.mocked(fs.readFile).mockImplementation(async p => {
            if (p === mockEnvPath) return (
                `SERVER_BASE_URL=${defaultEnvConfig.SERVER_BASE_URL}\nPATCH_ENCRYPTION_KEY=${defaultEnvConfig.PATCH_ENCRYPTION_KEY}`
            );
            if (p === mockFullTayloredPath) return 'patch content here';
            throw new Error(`readFile mock: Unknown path ${p}`);
        });
        jest.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());
        jest.mocked(fs.writeJson).mockResolvedValue(undefined); // writeJson is fine with mockResolvedValue
        jest.mocked(taysellUtils.encryptAES256GCM).mockReturnValue('encrypted-patch-content');
        // Force cast the mock to the expected signature
        (uuidv4 as jest.Mock<string, []>).mockReturnValue('mock-uuid-v4');
        jest.mocked(inquirer.prompt).mockResolvedValue(defaultInquirerAnswers as any); // Cast to any for complex inquirer types
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        processExitSpy.mockRestore();
    });

    it('should create .taysell package successfully with info from .env and prompts', async () => {
        await handleCreateTaysell(mockTayloredFileName, '10.00', 'Cmd line desc', mockCwd);

        expect(taysellUtils.encryptAES256GCM).toHaveBeenCalledWith('patch content here', defaultEnvConfig.PATCH_ENCRYPTION_KEY);
        expect(fs.writeFile).toHaveBeenCalledWith(
            `${mockCwd}/${mockTayloredFileName}.encrypted`,
            'encrypted-patch-content'
        );
        expect(fs.writeJson).toHaveBeenCalledWith(
            `${mockCwd}/my_patch.taysell`,
            expect.objectContaining({
                patchId: defaultInquirerAnswers.patchId, // Uses prompt default if not in env
                metadata: expect.objectContaining({ name: defaultInquirerAnswers.patchName, description: defaultInquirerAnswers.patchDescription }),
                payment: expect.objectContaining({ price: defaultInquirerAnswers.price, currency: defaultInquirerAnswers.currency.toUpperCase() }),
                endpoints: expect.objectContaining({
                    initiatePaymentUrl: `${defaultEnvConfig.SERVER_BASE_URL}/pay/${defaultInquirerAnswers.patchId}`,
                    getPatchUrl: `${defaultEnvConfig.SERVER_BASE_URL}/get-patch`,
                }),
            }),
            { spaces: 2 }
        );
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Taysell Package Creation Complete'));
    });

    it('should use uuidv4 for patchId if not in .env and not provided by prompt (if prompt used default uuid)', async () => {
        // Simulate prompt also defaulting to uuid, or PATCH_ID not being asked if env doesn't have it
        jest.mocked(inquirer.prompt).mockResolvedValue({
            ...defaultInquirerAnswers,
            patchId: 'mock-uuid-v4' // Simulate prompt taking the default uuid
        } as any); // Cast to any for complex inquirer types
        // And ensure env doesn't have PATCH_ID
        jest.mocked(fs.readFile).mockImplementation(async p => {
             if (p === mockEnvPath) return (
                `SERVER_BASE_URL=${defaultEnvConfig.SERVER_BASE_URL}\nPATCH_ENCRYPTION_KEY=${defaultEnvConfig.PATCH_ENCRYPTION_KEY}`
            ); // No PATCH_ID
            if (p === mockFullTayloredPath) return 'patch content here';
            throw new Error(`readFile mock: Unknown path ${p}`);
        });


        await handleCreateTaysell(mockTayloredFileName, undefined, undefined, mockCwd);
        expect(uuidv4).toHaveBeenCalled(); // Check if it was called
        expect(fs.writeJson).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({ patchId: 'mock-uuid-v4' }),
            expect.any(Object)
        );
    });

    it('should prompt for SERVER_BASE_URL and PATCH_ENCRYPTION_KEY if not in .env', async () => {
        (fs.pathExists as jest.Mock).mockImplementation(p => { // .env does not exist
            if (p === mockFullTayloredPath) return true;
            if (p === mockEnvPath) return false;
            return false;
        });
         jest.mocked(inquirer.prompt).mockResolvedValue({
            ...defaultInquirerAnswers,
            serverBaseUrl: 'https://prompted.api.example.com',
            patchEncryptionKey: 'promptedKey12345678901234567890123',
        } as any); // Cast to any for complex inquirer types

        await handleCreateTaysell(mockTayloredFileName, undefined, undefined, mockCwd);

        expect(jest.mocked(inquirer.prompt)).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ name: 'serverBaseUrl' }),
                expect.objectContaining({ name: 'patchEncryptionKey' }),
            ])
        );
        expect(taysellUtils.encryptAES256GCM).toHaveBeenCalledWith(expect.any(String), 'promptedKey12345678901234567890123');
        expect(fs.writeJson).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                endpoints: expect.objectContaining({
                    initiatePaymentUrl: `https://prompted.api.example.com/pay/${defaultInquirerAnswers.patchId}`,
                }),
            }),
            expect.any(Object)
        );
    });


    it('should exit if input file is not a .taylored file', async () => {
        await expect(handleCreateTaysell('my_patch.txt', undefined, undefined, mockCwd))
            .rejects.toThrow('process.exit called with 1');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Input file must be a .taylored file'));
    });

    it('should exit if input taylored file does not exist', async () => {
        (fs.pathExists as jest.Mock).mockImplementation(p => {
            if (p === mockFullTayloredPath) return Promise.resolve(false); // Taylored file does NOT exist
            return Promise.resolve(false);
        });
        await expect(handleCreateTaysell(mockTayloredFileName, undefined, undefined, mockCwd))
            .rejects.toThrow('process.exit called with 1');
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Taylored file not found'));
    });

    it('should correctly use command line price and description when provided', async () => {
        const cliPrice = "5.55";
        const cliDesc = "A very specific description from CLI.";
        jest.mocked(inquirer.prompt).mockResolvedValue({ // Inquirer would be prompted with these as defaults
            ...defaultInquirerAnswers,
            price: cliPrice,
            patchDescription: cliDesc,
        } as any); // Cast to any for complex inquirer types

        await handleCreateTaysell(mockTayloredFileName, cliPrice, cliDesc, mockCwd);

        expect(fs.writeJson).toHaveBeenCalledWith(
            expect.any(String),
            expect.objectContaining({
                metadata: expect.objectContaining({ description: cliDesc }),
                payment: expect.objectContaining({ price: cliPrice }),
            }),
            expect.any(Object)
        );
    });
});

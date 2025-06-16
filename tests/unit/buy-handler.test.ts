// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// tests/unit/buy-handler.test.ts
import { handleBuyCommand } from '../../lib/handlers/buy-handler'; // Adjust path
import * as fs from 'fs-extra';
import * as path from 'path'; // Import path
import inquirer from 'inquirer';
import open from 'open';
import * as https from 'https';
import * as taysellUtils from '../../lib/taysell-utils'; // To use actual validateTaysellFileContent
import * as applyLogic from '../../lib/apply-logic';
import *  as utils from '../../lib/utils'; // For printUsageAndExit
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../../lib/constants';
import { Writable } from 'stream';
import { IncomingMessage } from 'http'; // For https.request mock


jest.mock('fs-extra');
jest.mock('inquirer');
jest.mock('open');
jest.mock('https'); // Mock the entire https module
jest.mock('../../lib/apply-logic');
jest.mock('../../lib/utils');


describe('handleBuyCommand', () => {
    const mockCwd = '/test/cwd';
    const mockTaysellFileName = 'mypatch.taysell';
    const mockFullTaysellPath = `${mockCwd}/${mockTaysellFileName}`;

    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;
    // processExitSpy is implicitly tested via printUsageAndExit mock

    const validTaysellFileContent: taysellUtils.TaysellFile = {
        taysellVersion: '1.0-decentralized',
        patchId: 'test-patch-id-123',
        sellerInfo: { name: 'Test Seller', website: 'https://seller.example.com', contact: 'contact@seller.com' },
        metadata: { name: 'My Test Patch', description: 'A patch for testing', tayloredVersion: '>=1.0.0' },
        endpoints: {
            initiatePaymentUrl: 'https://seller.example.com/pay/test-patch-id-123',
            getPatchUrl: 'https://seller.example.com/api/download-patch'
        },
        payment: { price: '12.34', currency: 'USD' }
    };

    const mockHttpsRequest = {
        on: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
    };
    let mockHttpsResponse: Writable & { statusCode?: number; setEncoding?: jest.Mock; };

    beforeEach(() => {
        jest.resetAllMocks();
        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        jest.mocked(utils.printUsageAndExit).mockImplementation((msg?: string) => {
            if (msg) console.error(msg); // Simulate printing error
            throw new Error('process.exit called'); // Simulate exit
        });


        jest.mocked(fs.pathExists).mockImplementation(async () => true);
        jest.mocked(fs.readJson).mockResolvedValue(validTaysellFileContent as any);
        jest.mocked(fs.ensureDir).mockImplementation(async () => {});
        jest.mocked(fs.writeFile).mockImplementation(() => Promise.resolve());
        jest.mocked(open).mockResolvedValue(undefined as any);
        jest.mocked(applyLogic.handleApplyOperation).mockResolvedValue(undefined);

        // Setup https mock
        mockHttpsResponse = new Writable() as Writable & { statusCode?: number; setEncoding?: jest.Mock; };
        mockHttpsResponse._write = (chunk, encoding, callback) => { callback(); }; // Basic Writable implementation
        mockHttpsResponse.setEncoding = jest.fn();

        jest.mocked(https.request).mockImplementation(
            (options: any, callback?: any): any => {
                if (callback) {
                    process.nextTick(() => callback(mockHttpsResponse as unknown as IncomingMessage));
                }
                return mockHttpsRequest as any; // as ClientRequest
            }
        );

         // Reset individual https request mocks
        mockHttpsRequest.on.mockReset();
        mockHttpsRequest.write.mockReset();
        mockHttpsRequest.end.mockReset();

        // Default successful https response
        mockHttpsResponse.statusCode = 200;
        mockHttpsRequest.on.mockImplementation((event, cb) => {
            if (event === 'data') { /* store cb if needed */ }
            if (event === 'end') { process.nextTick(() => cb()); } // Simulate end for success
            return mockHttpsRequest as any;
        });
    });

    afterEach(() => {
        consoleLogSpy.mockRestore();
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    it('should complete successfully for a valid .taysell file and successful purchase', async () => {
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ proceed: true } as any) // Security warning
            .mockResolvedValueOnce({ purchaseToken: 'valid-token' } as any); // Paste token

        // Simulate server sending patch data
        const patchContent = 'this is the decrypted patch';
        mockHttpsRequest.on.mockImplementation((event, cb) => {
            if (event === 'data') { process.nextTick(() => cb(Buffer.from(patchContent))); }
            if (event === 'end') { process.nextTick(() => cb()); }
            return mockHttpsRequest as any;
        });

        await handleBuyCommand(mockTaysellFileName, false, mockCwd);

        expect(fs.readJson).toHaveBeenCalledWith(mockFullTaysellPath);
        expect(open).toHaveBeenCalledWith(validTaysellFileContent.endpoints.initiatePaymentUrl);
        expect(https.request).toHaveBeenCalled();
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(mockCwd, TAYLORED_DIR_NAME, `${validTaysellFileContent.patchId.replace(/[^a-z0-9]/gi, '_')}${TAYLORED_FILE_EXTENSION}`),
            patchContent
        );
        expect(applyLogic.handleApplyOperation).toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('Purchase and application of patch'));
    });

    it('should perform a dry run correctly', async () => {
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ proceed: true } as any)
            .mockResolvedValueOnce({ purchaseToken: 'valid-token' } as any);

        const patchContent = 'dry run patch content';
         mockHttpsRequest.on.mockImplementation((event, cb) => {
            if (event === 'data') { process.nextTick(() => cb(Buffer.from(patchContent))); }
            if (event === 'end') { process.nextTick(() => cb()); }
            return mockHttpsRequest as any;
        });

        await handleBuyCommand(mockTaysellFileName, true, mockCwd);

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(applyLogic.handleApplyOperation).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--- DRY RUN ---'));
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining(patchContent));
    });

    it('should exit if .taysell file is not found', async () => {
        jest.mocked(fs.pathExists).mockImplementation(async () => false);
        await expect(handleBuyCommand(mockTaysellFileName, false, mockCwd))
            .rejects.toThrow('process.exit called');
        expect(utils.printUsageAndExit).toHaveBeenCalledWith(expect.stringContaining('file not found'));
    });

    it('should exit if .taysell file is invalid (validation fails)', async () => {
        jest.mocked(fs.readJson).mockResolvedValue({ ...validTaysellFileContent, patchId: null } as any); // Invalid data
        await expect(handleBuyCommand(mockTaysellFileName, false, mockCwd))
            .rejects.toThrow('process.exit called');
        expect(utils.printUsageAndExit).toHaveBeenCalledWith(expect.stringContaining('Invalid .taysell file'));
    });

    it('should warn if initiatePaymentUrl is not HTTPS and continue', async () => {
        jest.mocked(fs.readJson).mockResolvedValue({ ...validTaysellFileContent, endpoints: {...validTaysellFileContent.endpoints, initiatePaymentUrl: 'http://insecure.com/pay'} } as any);
        jest.mocked(inquirer.prompt) // Still need to mock prompts for the rest of the flow
            .mockResolvedValueOnce({ proceed: true } as any)
            .mockResolvedValueOnce({ purchaseToken: 'valid-token' } as any);

        await handleBuyCommand(mockTaysellFileName, false, mockCwd);
        expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('does not use HTTPS'));
        expect(open).toHaveBeenCalledWith('http://insecure.com/pay'); // Still tries to open
    });


    it('should exit if getPatchUrl is not HTTPS', async () => {
        jest.mocked(fs.readJson).mockResolvedValue({ ...validTaysellFileContent, endpoints: {...validTaysellFileContent.endpoints, getPatchUrl: 'http://insecure.com/api'} }as any);
        // No need to mock inquirer as validation should happen before prompts
        await expect(handleBuyCommand(mockTaysellFileName, false, mockCwd))
            .rejects.toThrow('process.exit called');
        expect(utils.printUsageAndExit).toHaveBeenCalledWith(expect.stringContaining('getPatchUrl must use HTTPS'));
    });

    it('should allow user to abort at security warning', async () => {
        jest.mocked(inquirer.prompt).mockResolvedValueOnce({ proceed: false } as any); // User says no
        await handleBuyCommand(mockTaysellFileName, false, mockCwd);
        expect(jest.mocked(open)).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith('Purchase aborted by user.');
    });

    it('should handle error when opening payment URL', async () => {
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ proceed: true } as any)
            .mockResolvedValueOnce({ purchaseToken: 'a-token' } as any);
        jest.mocked(open).mockRejectedValue(new Error('Browser error'));

        // Should still proceed to ask for token and attempt download
        await handleBuyCommand(mockTaysellFileName, false, mockCwd);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Could not open the payment URL'));
        expect(https.request).toHaveBeenCalled(); // Still attempts download
    });

    it('should handle non-200 status from patch download', async () => {
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ proceed: true } as any)
            .mockResolvedValueOnce({ purchaseToken: 'a-token' } as any);

        mockHttpsResponse.statusCode = 401;
        const errorJson = { error: "Invalid token" };
        mockHttpsRequest.on.mockImplementation((event, cb) => {
            if (event === 'data') { process.nextTick(() => cb(Buffer.from(JSON.stringify(errorJson)))); }
            if (event === 'end') { process.nextTick(() => cb()); }
            return mockHttpsRequest as any;
        });

        await expect(handleBuyCommand(mockTaysellFileName, false, mockCwd))
            .rejects.toThrow('process.exit called');
        expect(utils.printUsageAndExit).toHaveBeenCalledWith(expect.stringContaining('Failed to retrieve patch. Details: Failed to download patch. Status: 401 - Invalid token'));
    });

    it('should handle network error during patch download', async () => {
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ proceed: true } as any)
            .mockResolvedValueOnce({ purchaseToken: 'a-token' } as any);

        mockHttpsRequest.on.mockImplementation((event, cb) => {
            if (event === 'error') { process.nextTick(() => cb(new Error('Network connection failed'))); }
            return mockHttpsRequest as any;
        });
        // Manually trigger the 'error' event for the request object itself
        process.nextTick(() => mockHttpsRequest.on.mock.calls.find(call => call[0] === 'error')[1](new Error('Network connection failed')));


        await expect(handleBuyCommand(mockTaysellFileName, false, mockCwd))
            .rejects.toThrow('process.exit called');
        expect(utils.printUsageAndExit).toHaveBeenCalledWith(
            `CRITICAL ERROR: Failed to retrieve patch. Details: Error making request to get patch: Network connection failed`
        );
    });


    it('should handle error during patch application', async () => {
        jest.mocked(inquirer.prompt)
            .mockResolvedValueOnce({ proceed: true } as any)
            .mockResolvedValueOnce({ purchaseToken: 'valid-token' } as any);
        jest.mocked(applyLogic.handleApplyOperation).mockRejectedValue(new Error('Apply failed'));

        const patchContent = 'patch data';
        mockHttpsRequest.on.mockImplementation((event, cb) => {
            if (event === 'data') { process.nextTick(() => cb(Buffer.from(patchContent))); }
            if (event === 'end') { process.nextTick(() => cb()); }
            return mockHttpsRequest as any;
        });

        await handleBuyCommand(mockTaysellFileName, false, mockCwd);
        expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error applying patch: Apply failed'));
    });
});

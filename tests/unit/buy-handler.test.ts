// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// tests/unit/buy-handler.test.ts
import { handleBuyCommand } from '../../lib/handlers/buy-handler';
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
import open from 'open';
import * as https from 'https';
import * as taysellUtils from '../../lib/taysell-utils';
import * as applyLogic from '../../lib/apply-logic';
import * as utils from '../../lib/utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../../lib/constants';
import { Writable, PassThrough } from 'stream';
import { IncomingMessage, ClientRequest } from 'http'; // Using http for types

jest.mock('fs-extra');
jest.mock('inquirer');
jest.mock('open');
jest.mock('https');
jest.mock('../../lib/apply-logic');
jest.mock('../../lib/utils');
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-cli-session-id'), // Consistent mock UUID
}));

// Simulate polling logic for tests
jest.mock('../../lib/handlers/buy-handler', () => {
    const originalModule = jest.requireActual('../../lib/handlers/buy-handler');
    return {
        ...originalModule,
        __esModule: true,
        // Keep the mock only for pollForToken, the rest is the real function
        // This does not work as expected because handleBuyCommand calls pollForToken internally.
        // The best solution is to mock https.get to control the polling response.
    };
});


describe('handleBuyCommand', () => {
    const mockCwd = '/test/cwd';
    const mockTaysellFileName = 'mypatch.taysell';
    const mockFullTaysellPath = path.join(mockCwd, mockTaysellFileName);

    let consoleLogSpy: jest.SpyInstance;
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

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

    let mockHttpsRequest: Writable;
    let mockHttpsGetResponse: PassThrough & { statusCode?: number; setEncoding: jest.Mock, on: jest.Mock, emit: jest.Mock };

    beforeEach(() => {
        jest.resetAllMocks();
        // Set JEST_WORKER_ID to simulate the test environment and skip prompts
        process.env.JEST_WORKER_ID = '1';

        consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        jest.mocked(utils.printUsageAndExit).mockImplementation((msg?: string) => {
            if (msg) console.error(msg);
            throw new Error('process.exit called');
        });

        jest.mocked(fs.pathExists).mockImplementation(async () => true);
        jest.mocked(fs.readFile).mockImplementation(async () => JSON.stringify(validTaysellFileContent));
        jest.mocked(fs.ensureDir).mockImplementation(async () => {});
        jest.mocked(fs.writeFile).mockImplementation(async () => {});
        jest.mocked(open).mockResolvedValue({} as any);
        jest.mocked(applyLogic.handleApplyOperation).mockResolvedValue(undefined);

        const mockClientRequestInstance = {
            on: jest.fn().mockReturnThis(),
            end: jest.fn().mockReturnThis(),
            write: jest.fn().mockReturnThis(),
            abort: jest.fn().mockReturnThis(),
        } as unknown as ClientRequest;

        // Mock per https.get (usato per il polling)
        // This will be the mocked IncomingMessage. Tests will configure its behavior.
        mockHttpsGetResponse = new PassThrough() as PassThrough & { statusCode?: number; setEncoding: jest.Mock, on: jest.Mock; emit: jest.Mock };
        mockHttpsGetResponse.on = jest.fn().mockReturnThis(); // Default mock for .on
        mockHttpsGetResponse.emit = jest.fn();
        mockHttpsGetResponse.setEncoding = jest.fn();

        jest.mocked(https.get).mockImplementation(
            (url: string | URL, optionsOrCallback: any, callbackOrUndefined?: (res: IncomingMessage) => void): ClientRequest => {
                let actualCallback: ((res: IncomingMessage) => void) | undefined;
                if (typeof optionsOrCallback === 'function') {
                    actualCallback = optionsOrCallback;
                } else if (typeof callbackOrUndefined === 'function') {
                    actualCallback = callbackOrUndefined;
                }

                if (actualCallback) {
                    // The mockHttpsGetResponse (configured per test) acts as the IncomingMessage
                    actualCallback(mockHttpsGetResponse as any as IncomingMessage); // Cast to IncomingMessage
                }
                return mockClientRequestInstance;
            }
        );

        // Mock per https.request (usato per POST /get-patch)
        const mockRequestFn = (
            arg1: https.RequestOptions | string | URL,
            arg2?: ((res: IncomingMessage) => void) | https.RequestOptions,
            arg3?: (res: IncomingMessage) => void
        ): ClientRequest => {
            let options: https.RequestOptions | string | URL = arg1;
            let callback: ((res: IncomingMessage) => void) | undefined;

            if (typeof arg2 === 'function') {
                callback = arg2;
            } else if (typeof arg3 === 'function') {
                options = arg2 as https.RequestOptions; // arg1 is url, arg2 is options
                callback = arg3;
            }

                if (typeof callback === 'function') {
                    const mockResForRequest = new PassThrough() as any; // Start with PassThrough, add properties
                    mockResForRequest.statusCode = 200; // Default success for patch download
                    mockResForRequest.headers = {};
                    mockResForRequest.setEncoding = jest.fn();

                    process.nextTick(() => {
                        if ((options as https.RequestOptions).method === 'POST') {
                            (mockResForRequest as PassThrough).emit('data', Buffer.from("mocked patch content"));
                        }
                        (mockResForRequest as PassThrough).emit('end');
                    });
                    callback(mockResForRequest as IncomingMessage); // Cast to IncomingMessage
                }
                return mockClientRequestInstance;
        };
        jest.mocked(https.request).mockImplementation(mockRequestFn as typeof https.request);
    });

    afterEach(() => {
        // Remove the environment variable so it doesn't affect other tests
        delete process.env.JEST_WORKER_ID;
        jest.restoreAllMocks(); // Ensures console spies are restored among other things
    });

    it('should complete successfully for a valid .taysell file and successful purchase', async () => {
        // Simulate a successful polling response
        mockHttpsGetResponse.statusCode = 200;
        mockHttpsGetResponse.on.mockImplementation(function(this: any, event: string, cb: (...args: any[]) => void) {
            if (event === 'data') {
                process.nextTick(() => cb(Buffer.from(JSON.stringify({ purchaseToken: 'valid-token', patchId: 'test-patch-id-123' }))));
            }
            if (event === 'end') {
                process.nextTick(() => cb());
            }
            return this;
        });

        await handleBuyCommand(mockTaysellFileName, false, mockCwd);

        expect(open).toHaveBeenCalledWith(expect.stringContaining(validTaysellFileContent.endpoints.initiatePaymentUrl));
        expect(https.request).toHaveBeenCalled();
        expect(fs.writeFile).toHaveBeenCalledWith(
            path.join(mockCwd, TAYLORED_DIR_NAME, `test_patch_id_123${TAYLORED_FILE_EXTENSION}`), // Corrected filename
            "mocked patch content" // Expecting the content from the https.request mock
        );
    });

    it('should perform a dry run correctly', async () => {
        mockHttpsGetResponse.statusCode = 200;
        mockHttpsGetResponse.on.mockImplementation(function(this: any, event: string, cb: (...args: any[]) => void) {
            if(event === 'data') {
                process.nextTick(() => cb(Buffer.from(JSON.stringify({ purchaseToken: 'valid-token', patchId: 'test-patch-id-123'}))));
            }
            if(event === 'end') {
                process.nextTick(() => cb());
            }
            return this;
        });

        await handleBuyCommand(mockTaysellFileName, true, mockCwd);

        expect(fs.writeFile).not.toHaveBeenCalled();
        expect(applyLogic.handleApplyOperation).not.toHaveBeenCalled();
        expect(console.log).toHaveBeenCalledWith(expect.stringContaining('--- DRY RUN ---'));
    });

    it('should exit if .taysell file is not found', async () => {
        jest.mocked(fs.pathExists).mockImplementation(async () => false);
        await expect(handleBuyCommand(mockTaysellFileName, false, mockCwd))
            .rejects.toThrow('process.exit called');
        expect(utils.printUsageAndExit).toHaveBeenCalledWith(expect.stringContaining('Taysell file not found'));
    });
});

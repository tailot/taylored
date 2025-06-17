// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import { handleCreateTaysell } from '../../lib/handlers/create-taysell-handler';
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
import { v4 as uuidv4 } from 'uuid';
import * as taysellUtils from '../../lib/taysell-utils';
import { TAYLORED_FILE_EXTENSION } from '../../lib/constants';

jest.mock('fs-extra');
jest.mock('inquirer');
jest.mock('uuid', () => ({
    v4: jest.fn(() => 'mock-uuid-v4'),
}));
jest.mock('../../lib/taysell-utils', () => ({
    ...jest.requireActual('../../lib/taysell-utils'),
    encryptAES256GCM: jest.fn(),
}));

describe('handleCreateTaysell', () => {
    const mockCwd = '/test/cwd';
    const mockTayloredFileName = 'my_patch' + TAYLORED_FILE_EXTENSION;
    const mockFullTayloredPath = path.join(mockCwd, mockTayloredFileName);
    const mockEnvPath = path.join(mockCwd, 'taysell-server', '.env');

    const defaultEnvConfig = {
        SERVER_BASE_URL: 'https://api.example.com',
        PATCH_ENCRYPTION_KEY: 'a_default_test_key_that_is_32_characters_long',
        SELLER_NAME: 'E2E Test Seller',
        SELLER_WEBSITE: 'https://example.com',
        SELLER_CONTACT: 'e2e@example.com',
    };

    beforeEach(() => {
        jest.resetAllMocks();
        process.env.JEST_WORKER_ID = '1';

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        jest.mocked(fs.pathExists).mockImplementation(async (p) => p === mockFullTayloredPath || p === mockEnvPath);
        jest.mocked(fs.readFile).mockImplementation(async (p) => {
            if (p === mockEnvPath) {
                return Object.entries(defaultEnvConfig)
                    .map(([key, value]) => `${key}=${value}`)
                    .join('\n');
            }
            if (p === mockFullTayloredPath) return 'patch content here';
            return '';
        });
        jest.mocked(fs.writeFile).mockImplementation(async () => {});
        jest.mocked(fs.writeJson).mockResolvedValue(undefined);
        jest.mocked(taysellUtils.encryptAES256GCM).mockReturnValue('encrypted-patch-content');
        (uuidv4 as jest.Mock).mockReturnValue('mock-uuid-v4');
    });

    afterEach(() => {
        delete process.env.JEST_WORKER_ID;
        jest.restoreAllMocks();
    });

    it('should create .taysell package using non-interactive test defaults', async () => {
        const cliPrice = '10.00';
        const cliDesc = 'Cmd line desc';

        await handleCreateTaysell(mockTayloredFileName, cliPrice, cliDesc, mockCwd);

        expect(inquirer.prompt).not.toHaveBeenCalled();

        expect(fs.writeJson).toHaveBeenCalledWith(
            path.join(mockCwd, 'my_patch.taysell'),
            expect.objectContaining({
                patchId: 'mock-uuid-v4',
                metadata: expect.objectContaining({
                    name: 'my_patch',
                    description: cliDesc,
                }),
                payment: expect.objectContaining({
                    price: cliPrice,
                    currency: 'USD',
                }),
                sellerInfo: expect.objectContaining({
                    name: defaultEnvConfig.SELLER_NAME,
                }),
            }),
            { spaces: 2 }
        );
    });

    it('should use fallback defaults when .env file is missing in test mode', async () => {
        jest.mocked(fs.pathExists).mockImplementation(async (p) => p === mockFullTayloredPath); // .env does not exist

        await handleCreateTaysell(mockTayloredFileName, undefined, undefined, mockCwd);

        expect(inquirer.prompt).not.toHaveBeenCalled();

        expect(taysellUtils.encryptAES256GCM).toHaveBeenCalledWith(
            'patch content here',
            'a_default_test_key_that_is_32_characters_long' // Align with handler's test fallback
        );

        expect(fs.writeJson).toHaveBeenCalledWith(
            path.join(mockCwd, 'my_patch.taysell'),
            expect.objectContaining({
                patchId: 'mock-uuid-v4', // Should also check this as it's part of the output
                endpoints: expect.objectContaining({
                    initiatePaymentUrl: 'http://test.com/pay/mock-uuid-v4', // Corrected fallback
                }),
                sellerInfo: expect.objectContaining({
                    name: 'E2E Test Seller', // Corrected fallback
                }),
            }),
            { spaces: 2 }
        );
    });
});

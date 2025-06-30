// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import { handleCreateTaysell } from '../../lib/handlers/create-taysell-handler';
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
import * as crypto from 'crypto'; // Import crypto
import * as taysellUtils from '../../lib/taysell-utils';
import { TAYLORED_FILE_EXTENSION } from '../../lib/constants';

jest.mock('fs-extra');
jest.mock('inquirer');
// Mock crypto's randomUUID with a correctly formatted UUID string
jest.mock('crypto', () => {
  const originalCrypto = jest.requireActual('crypto');
  return {
    __esModule: true, // Try indicating it's an ES module
    ...originalCrypto,
    randomUUID: () => '123e4567-e89b-12d3-a456-426614174000', // Direct function
  };
});
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

  // No direct manipulation of crypto here

  beforeEach(() => {
    jest.resetAllMocks();
    process.env.JEST_WORKER_ID = '1';

    // crypto.randomUUID is mocked via jest.mock at the top of the file
    // Add explicit mock for inquirer.prompt
    jest.mocked(inquirer.prompt).mockResolvedValue({
      serverBaseUrl: defaultEnvConfig.SERVER_BASE_URL, // Assuming this is read from env or default
      patchEncryptionKey: defaultEnvConfig.PATCH_ENCRYPTION_KEY, // Assuming this is read from env or default
      patchName: mockTayloredFileName.replace(TAYLORED_FILE_EXTENSION, ''),
      patchDescription: 'Default test description', // Default or passed in
      patchId: '123e4567-e89b-12d3-a456-426614174000', // Ensure this is the mocked UUID
      tayloredVersion: '>=6.8.21',
      price: '0.00', // Default or passed in
      currency: 'USD',
      sellerName: defaultEnvConfig.SELLER_NAME,
      sellerWebsite: defaultEnvConfig.SELLER_WEBSITE,
      sellerContact: defaultEnvConfig.SELLER_CONTACT,
    });

    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();

    jest
      .mocked(fs.pathExists)
      .mockImplementation(
        async (p) => p === mockFullTayloredPath || p === mockEnvPath,
      );
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
    jest
      .mocked(taysellUtils.encryptAES256GCM)
      .mockReturnValue('encrypted-patch-content');
    // No longer need to mock uuidv4 directly as jest.mock('crypto') handles it.
  });

  afterEach(() => {
    delete process.env.JEST_WORKER_ID;
    jest.restoreAllMocks();
    // No need to restore crypto.randomUUID as it's handled by jest.mock
  });

  it('should create .taysell package using non-interactive test defaults', async () => {
    const cliPrice = '10.00';
    const cliDesc = 'Cmd line desc';

    await handleCreateTaysell(mockTayloredFileName, cliPrice, cliDesc, mockCwd);

    expect(inquirer.prompt).not.toHaveBeenCalled();

    expect(fs.writeJson).toHaveBeenCalledWith(
      path.join(mockCwd, 'my_patch.taysell'),
      expect.objectContaining({
        patchId: '123e4567-e89b-12d3-a456-426614174000',
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
      { spaces: 2 },
    );
  });

  it('should use fallback defaults when .env file is missing in test mode', async () => {
    jest
      .mocked(fs.pathExists)
      .mockImplementation(async (p) => p === mockFullTayloredPath); // .env does not exist

    await handleCreateTaysell(
      mockTayloredFileName,
      undefined,
      undefined,
      mockCwd,
    );

    expect(inquirer.prompt).not.toHaveBeenCalled();

    expect(taysellUtils.encryptAES256GCM).toHaveBeenCalledWith(
      'patch content here',
      'a_default_test_key_that_is_32_characters_long', // Align with handler's test fallback
    );

    expect(fs.writeJson).toHaveBeenCalledWith(
      path.join(mockCwd, 'my_patch.taysell'),
      expect.objectContaining({
        patchId: '123e4567-e89b-12d3-a456-426614174000', // Should also check this as it's part of the output
        endpoints: expect.objectContaining({
          initiatePaymentUrl:
            'http://test.com/pay/123e4567-e89b-12d3-a456-426614174000', // Corrected fallback
        }),
        sellerInfo: expect.objectContaining({
          name: 'E2E Test Seller', // Corrected fallback
        }),
      }),
      { spaces: 2 },
    );
  });
});

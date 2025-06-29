// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// lib/handlers/create-taysell-handler.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
import * as crypto from 'crypto'; // For generating patchId
import { encryptAES256GCM } from '../taysell-utils'; // Corrected path
import { TAYLORED_FILE_EXTENSION } from '../constants';
import { CliUsageError, FileNotFoundError, BackendSetupError } from '../errors'; // Using BackendSetupError for config issues
import { formatUsageMessage } from '../utils'; // For formatting usage messages
/**
 * Reads a simple .env file and parses its key-value pairs.
 *
 * This function is a basic parser that assumes keys and values are separated by '='.
 * It handles lines starting with '#' as comments and ignores empty lines.
 *
 * @async
 * @param {string} envPath - The path to the .env file.
 * @returns {Promise<Record<string, string>>} A promise that resolves to an object
 *          containing the key-value pairs from the .env file. Returns an empty
 *          object if the file does not exist.
 */
async function readEnvFile(envPath: string): Promise<Record<string, string>> {
    if (!await fs.pathExists(envPath)) {
        return {};
    }
    const content = await fs.readFile(envPath, 'utf-8');
    const envConfig: Record<string, string> = {};
    content.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
            envConfig[key.trim()] = valueParts.join('=').trim();
        }
    });
    return envConfig;
}

/**
 * Implements the `taylored create-taysell <file.taylored> [--price <price>] [--desc "description"]` command.
 *
 * This function takes an existing `.taylored` patch file and prepares it for commercial
 * distribution through the Taysell system. The process involves:
 *
 * 1.  **Validation**: Checks if the input `tayloredFilePath` is a valid `.taylored` file and exists.
 * 2.  **Backend Configuration**: Attempts to read `SERVER_BASE_URL` and `PATCH_ENCRYPTION_KEY`
 *     from `taysell-server/.env` located in the `cwd`. If not found, it prompts the user for them.
 * 3.  **Interactive Prompts (via Inquirer)**: Collects metadata for the commercial patch.
 *     This includes:
 *     - Commercial name for the patch.
 *     - Description (uses `descriptionInput` if provided).
 *     - Unique Patch ID (can be auto-generated using UUIDv4 or taken from environment/input).
 *     - Required `taylored` CLI version.
 *     - Price (uses `priceInput` if provided).
 *     - Currency code (e.g., USD).
 *     - Seller information (name, website, contact email), potentially pre-filled from `.env`.
 *     In test environments (`process.env.JEST_WORKER_ID` set), prompts are skipped, and
 *     default/test values are used.
 * 4.  **Patch Encryption**: Reads the content of the input `.taylored` file and encrypts it
 *     using AES-256-GCM with the `PATCH_ENCRYPTION_KEY`. The encrypted content is saved
 *     to a new file named `<original_basename>.taylored.encrypted`.
 * 5.  **.taysell File Generation**: Creates a JSON metadata file (e.g., `<original_basename>.taysell`).
 *     This file contains all commercial details, seller information, and constructed API
 *     endpoints (`initiatePaymentUrl`, `getPatchUrl`) based on the `SERVER_BASE_URL` and `patchId`.
 * 6.  **User Instructions**: Informs the user about the created encrypted patch and `.taysell`
 *     metadata file, advising them to upload the encrypted patch to their Taysell server's
 *     `patches/` directory and distribute the `.taysell` file to buyers.
 *
 * For more information on this command and the Taysell system, refer to `DOCUMENTATION.md`.
 *
 * @async
 * @param {string} tayloredFilePath - Path to the source `.taylored` patch file to be packaged.
 * @param {string | undefined} priceInput - Optional price provided via command-line argument.
 * @param {string | undefined} descriptionInput - Optional description provided via command-line argument.
 * @param {string} cwd - The current working directory. Used to resolve file paths and locate
 *                       the `taysell-server/.env` file.
 * @returns {Promise<void>} A promise that resolves when the Taysell package creation is complete.
 * @throws {CliUsageError | FileNotFoundError | BackendSetupError | Error} Throws custom errors on failure.
 */
export async function handleCreateTaysell(
    tayloredFilePath: string,
    priceInput: string | undefined,
    descriptionInput: string | undefined,
    cwd: string
): Promise<void> {
    console.log(`Starting .taysell package creation for: ${tayloredFilePath}`);

    if (!tayloredFilePath.endsWith(TAYLORED_FILE_EXTENSION)) {
         throw new CliUsageError(formatUsageMessage(`Input file must be a .taylored file. Received: ${tayloredFilePath}`));
    }
    const fullTayloredPath = path.resolve(cwd, tayloredFilePath);
    if (!await fs.pathExists(fullTayloredPath)) {
        throw new FileNotFoundError(`Taylored file not found at: ${fullTayloredPath}`);
    }
    const patchFileNameBase = path.basename(tayloredFilePath);

    // Look for local backend configuration
    const envPath = path.join(cwd, 'taysell-server', '.env');
    const envConfig = await readEnvFile(envPath);

    let {
        SERVER_BASE_URL: serverBaseUrl,
        PATCH_ENCRYPTION_KEY: patchEncryptionKey,
        // Allow reading patchId from .env if users want to pre-define it, though typically it's per-patch
        PATCH_ID: patchIdFromEnv
    } = envConfig;

    const questions: any[] = []; // Use any[] to bypass QuestionCollection type issue in test
    if (!serverBaseUrl) {
        questions.push({
            type: 'input', name: 'serverBaseUrl', message: 'Enter the SERVER_BASE_URL of your Taysell backend:',
            validate: (input: string) => input.trim() !== '' || 'Server URL cannot be empty.'
        });
    }
    if (!patchEncryptionKey) {
        questions.push({
            type: 'password', name: 'patchEncryptionKey', message: 'Enter the PATCH_ENCRYPTION_KEY for encrypting patches:',
            validate: (input: string) => input.trim().length >= 32 || 'Encryption key must be at least 32 characters.'
        });
    }

    questions.push(
        { type: 'input', name: 'patchName', message: 'Enter the commercial name for this patch:', default: patchFileNameBase.replace(TAYLORED_FILE_EXTENSION, '') },
        { type: 'input', name: 'patchDescription', message: 'Enter a description for this patch:', default: descriptionInput || 'No description provided.'},
            { type: 'input', name: 'patchId', message: 'Enter a unique ID for this patch (or press Enter to generate one):', default: patchIdFromEnv || crypto.randomUUID() },
        { type: 'input', name: 'tayloredVersion', message: 'Enter the required taylored CLI version (e.g., >=6.8.21):', default: '>=6.8.21'}, // TODO: Read from current CLI version?
        { type: 'input', name: 'price', message: 'Enter the price (e.g., 9.99):', default: priceInput, validate: (input: string) => !isNaN(parseFloat(input)) || 'Invalid price.' },
        { type: 'input', name: 'currency', message: 'Enter the currency code (e.g., USD, EUR):', default: 'USD', validate: (input: string) => input.trim().length === 3 || 'Currency code must be 3 letters.'}
    );
    // Seller info
    questions.push(
        { type: 'input', name: 'sellerName', message: 'Enter your seller name/company name:', default: envConfig.SELLER_NAME || '' },
        { type: 'input', name: 'sellerWebsite', message: 'Enter your seller website (URL):', default: envConfig.SELLER_WEBSITE || '' },
        { type: 'input', name: 'sellerContact', message: 'Enter your seller contact email:', default: envConfig.SELLER_CONTACT || '' }
    );

    let answers;

    // Check if the code is running inside a Jest test worker
    if (process.env.JEST_WORKER_ID) {
        // If in a test, use default values instead of prompting
        console.log('Running in test environment, skipping interactive prompts.');
        answers = {
            patchName: patchFileNameBase.replace(TAYLORED_FILE_EXTENSION, ''),
            patchDescription: descriptionInput || 'Default test description',
            patchId: patchIdFromEnv || crypto.randomUUID(),
            tayloredVersion: '>=6.8.21',
            price: priceInput || '0.00',
            currency: 'USD',
            sellerName: envConfig.SELLER_NAME || 'E2E Test Seller',
            sellerWebsite: envConfig.SELLER_WEBSITE || 'https://example.com',
            sellerContact: envConfig.SELLER_CONTACT || 'e2e@example.com',
            // Also provide defaults for potentially missing env variables
            serverBaseUrl: serverBaseUrl || 'http://test.com',
            patchEncryptionKey: patchEncryptionKey || 'a_default_test_key_that_is_32_characters_long'
        };
    } else {
        // If not in a test, show the interactive prompts
        answers = await inquirer.prompt(questions);
    }


    // Consolidate answers with envConfig
    serverBaseUrl = serverBaseUrl || answers.serverBaseUrl;
    patchEncryptionKey = patchEncryptionKey || answers.patchEncryptionKey;
    const finalPatchId = answers.patchId;

    console.log(`Using Patch ID: ${finalPatchId}`);
    console.log(`Using Server Base URL: ${serverBaseUrl}`);

    // 3. Encrypt the <file.taylored>
    const patchContent = await fs.readFile(fullTayloredPath, 'utf-8');
    const encryptedPatchContent = encryptAES256GCM(patchContent, patchEncryptionKey);
    const encryptedFileName = `${patchFileNameBase}.encrypted`;
    const encryptedFilePath = path.join(cwd, encryptedFileName); // Save in CWD for now
    await fs.writeFile(encryptedFilePath, encryptedPatchContent);
    console.log(`Patch encrypted successfully: ${encryptedFilePath}`);

    // 4. Generate the .taysell file
    const taysellFileContent = {
        taysellVersion: "1.0-decentralized",
        patchId: finalPatchId,
        sellerInfo: {
            name: answers.sellerName,
            website: answers.sellerWebsite,
            contact: answers.sellerContact
        },
        metadata: {
            name: answers.patchName,
            description: answers.patchDescription,
            tayloredVersion: answers.tayloredVersion
        },
        endpoints: {
            initiatePaymentUrl: `${serverBaseUrl}/pay/${finalPatchId}`, // Construct URL
            getPatchUrl: `${serverBaseUrl}/get-patch` // Construct URL
        },
        payment: {
            price: answers.price,
            currency: answers.currency.toUpperCase()
        }
    };

    const taysellFileName = `${patchFileNameBase.replace(TAYLORED_FILE_EXTENSION, '')}.taysell`;
    const taysellJsonPath = path.join(cwd, taysellFileName);
    await fs.writeJson(taysellJsonPath, taysellFileContent, { spaces: 2 });
    console.log(`.taysell metadata file generated: ${taysellJsonPath}`);

    // 5. Inform the seller
    console.log(`
--- Taysell Package Creation Complete ---`);
    console.log(`  Encrypted Patch: ${encryptedFilePath}`);
    console.log(`  Metadata File: ${taysellJsonPath}`);
    console.log(`
IMPORTANT: Upload the encrypted patch ('${encryptedFileName}') to your Taysell server's 'patches/' directory.`);
    console.log(`The .taysell file ('${taysellFileName}') is what you distribute to buyers.`);
}

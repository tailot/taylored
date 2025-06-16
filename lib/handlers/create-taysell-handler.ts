// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// lib/handlers/create-taysell-handler.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
import { v4 as uuidv4 } from 'uuid'; // For generating patchId
import { encryptAES256GCM } from '../taysell-utils'; // Corrected path
import { TAYLORED_FILE_EXTENSION } from '../constants'; // Assuming this exists for .taylored extension

// Helper function to read .env file
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

export async function handleCreateTaysell(
    tayloredFilePath: string,
    priceInput: string | undefined,
    descriptionInput: string | undefined,
    cwd: string
): Promise<void> {
    console.log(`Starting .taysell package creation for: ${tayloredFilePath}`);

    // 1. Validate input .taylored file
    if (!tayloredFilePath.endsWith(TAYLORED_FILE_EXTENSION)) {
         console.error(`CRITICAL ERROR: Input file must be a .taylored file. Received: ${tayloredFilePath}`);
         process.exit(1);
    }
    const fullTayloredPath = path.resolve(cwd, tayloredFilePath);
    if (!await fs.pathExists(fullTayloredPath)) {
        console.error(`CRITICAL ERROR: Taylored file not found at: ${fullTayloredPath}`);
        process.exit(1);
    }
    const patchFileNameBase = path.basename(tayloredFilePath);

    // 2. Look for local backend configuration
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
        { type: 'input', name: 'patchId', message: 'Enter a unique ID for this patch (or press Enter to generate one):', default: patchIdFromEnv || uuidv4() },
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


    const answers = await inquirer.prompt(questions);

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

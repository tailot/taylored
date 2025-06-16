// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// lib/handlers/buy-handler.ts
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer';
// import open from 'open'; // Changed to dynamic import
import * as https from 'https'; // Keep this
// Import the new validator and types from taysell-utils
import { decryptAES256GCM, validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit } from '../utils';

// Remove local interfaces for TaysellFile structure as they are now imported or part of TaysellFile from utils

export async function handleBuyCommand(
    taysellFilePath: string,
    isDryRun: boolean,
    cwd: string
): Promise<void> {
    console.log(`Starting purchase process for: ${taysellFilePath}`);

    const fullTaysellPath = path.resolve(cwd, taysellFilePath);
    if (!await fs.pathExists(fullTaysellPath)) {
        // printUsageAndExit available from utils
        printUsageAndExit(`CRITICAL ERROR: .taysell file not found at: ${fullTaysellPath}`);
        return; // printUsageAndExit exits, but for type safety
    }

    let taysellData: TaysellFile;
    try {
        const rawData = await fs.readJson(fullTaysellPath);
        taysellData = validateTaysellFileContent(rawData); // Use the utility function

        // Warning for initiatePaymentUrl if not HTTPS (optional, can be part of validateTaysellFileContent too)
        if (!taysellData.endpoints.initiatePaymentUrl.startsWith('https://')) {
            console.warn(`WARNING: initiatePaymentUrl ("${taysellData.endpoints.initiatePaymentUrl}") does not use HTTPS. Proceed with caution.`);
        }

    } catch (error: any) {
        printUsageAndExit(`CRITICAL ERROR: Invalid .taysell file at ${fullTaysellPath}. Details: ${error.message}`);
        return; // printUsageAndExit exits
    }

    console.log(`Successfully loaded .taysell file for patch: "${taysellData.metadata.name}" from seller "${taysellData.sellerInfo.name}".`);
    console.log(`Price: ${taysellData.payment.price} ${taysellData.payment.currency}`);

    // 2. Display Security Warning
    console.log('\n--- SECURITY WARNING ---');
    console.log(`You are about to connect to the seller's website: ${taysellData.sellerInfo.website || 'N/A'}`);
    console.log(`Seller: ${taysellData.sellerInfo.name}`);
    console.log(`Contact: ${taysellData.sellerInfo.contact}`);
    console.log(`This CLI tool facilitates the purchase but CANNOT guarantee the security or integrity of third-party services or the patch itself.`);
    console.log(`Proceed only if you trust the seller: "${taysellData.sellerInfo.name}".`);

    const { proceed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'proceed',
        message: 'Do you want to continue with the purchase?',
        default: false,
    }]);

    if (!proceed) {
        console.log('Purchase aborted by user.');
        return;
    }

    // 3. Open initiatePaymentUrl in the default browser
    console.log(`Opening payment page in your browser: ${taysellData.endpoints.initiatePaymentUrl}`);
    try {
        const open = (await import('open')).default; // Dynamic import
        await open(taysellData.endpoints.initiatePaymentUrl);
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Could not open the payment URL in browser. Please open it manually: ${taysellData.endpoints.initiatePaymentUrl}`);
        // We can still continue and ask for the token
    }

    // 4. Wait for the user to paste the purchaseToken
    const { purchaseToken } = await inquirer.prompt([{
        type: 'password', // Use password for sensitive tokens
        name: 'purchaseToken',
        message: 'After completing payment, paste the purchaseToken provided by the seller here:',
        validate: input => input.trim() !== '' || 'Purchase token cannot be empty.',
    }]);

    // 5. Make a POST request to getPatchUrl
    let decryptedPatchContent: string;
    try {
        // ... (https.request logic as implemented previously)
        const parsedUrl = new URL(taysellData.endpoints.getPatchUrl);
        // ... (options, https.request, req.on('error'), req.write, req.end())
        decryptedPatchContent = await new Promise<string>((resolve, reject) => {
            const req = https.request({
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || 443,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(JSON.stringify({ patchId: taysellData.patchId, purchaseToken }))
            }
            }, (res) => {
                // ... (res.on 'data', res.on 'end')
                 let responseBody = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    responseBody += chunk;
                });
                res.on('end', () => {
                    if (res.statusCode === 200) { resolve(responseBody); } else {
                        let errorMsg = `Failed to download patch. Status: ${res.statusCode}`;
                        try {
                            const errorJson = JSON.parse(responseBody);
                            errorMsg += ` - ${errorJson.error || responseBody}`;
                        } catch (e) {
                            errorMsg += ` - ${responseBody}`;
                        }
                        reject(new Error(errorMsg));
                     }
                });
            });
            req.on('error', (e) => reject(e));
            req.write(JSON.stringify({ patchId: taysellData.patchId, purchaseToken }));
            req.end();
        });
    } catch (error: any) {
        printUsageAndExit(`CRITICAL ERROR: Failed to retrieve patch. Details: ${error.message}`);
        return;
    }

    // 6. Save Patch (Dry Run Handling)
    const patchFileName = `${taysellData.patchId.replace(/[^a-z0-9]/gi, '_')}${TAYLORED_FILE_EXTENSION}`;
    const localPatchDir = path.join(cwd, TAYLORED_DIR_NAME);
    await fs.ensureDir(localPatchDir);
    const localPatchPath = path.join(localPatchDir, patchFileName);

    if (isDryRun) {
        console.log('\n--- DRY RUN ---');
        console.log(`Patch would be saved to: ${localPatchPath}`);
        console.log('Patch Content:');
        console.log('----------------------------------------');
        console.log(decryptedPatchContent);
        console.log('----------------------------------------');
        console.log('Dry run complete. No files were written, and no patch was applied.');
        return;
    }

    // 7. Save the patch and apply
    await fs.writeFile(localPatchPath, decryptedPatchContent);
    console.log(`Successfully downloaded and saved patch to: ${localPatchPath}`);

    console.log('Applying the patch...');
    try {
        // The mode for handleApplyOperation would be '--add'
        // handleApplyOperation expects the simple filename, not the full path,
        // and assumes it's in the TAYLORED_DIR_NAME directory.
        await handleApplyOperation(patchFileName, false, false, '--add', cwd);
        console.log(`Patch "${taysellData.metadata.name}" applied successfully.`);
    } catch (error: any) {
        console.error(`Error applying patch: ${error.message}`);
        console.error(`The patch was downloaded to ${localPatchPath}, but applying it failed. You may need to apply it manually or investigate the error.`);
        // process.exit(1); // Decide if failure to apply is a critical error
    }
    console.log(`Purchase and application of patch "${taysellData.metadata.name}" complete.`);
}

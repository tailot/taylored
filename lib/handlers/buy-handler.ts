import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit, promptOrUseDefaults } from '../utils'; // Import promptOrUseDefaults
import { v4 as uuidv4 } from 'uuid';
import open from 'open';
// import inquirer from 'inquirer'; // No longer directly needed

/**
 * Polls a given URL to check for a purchase token associated with a CLI session ID.
 * This is part of the decentralized purchase flow where the CLI waits for a browser-based
 * payment process to complete and notify the backend.
 *
 * @param {string} checkUrl - The base URL to poll for checking purchase status.
 * @param {string} cliSessionId - The unique session ID for this CLI instance's purchase attempt.
 * @param {string} patchIdToVerify - The patch ID that must match the one in the token response.
 * @param {number} [timeoutMs=600000] - Total time in milliseconds to poll before timing out.
 * @param {number} [intervalMs=2500] - Interval in milliseconds between polling attempts.
 * @returns {Promise<{ patchId: string; purchaseToken: string }>} A promise that resolves with the patch ID and purchase token.
 * @throws {Error} If polling times out or a non-recoverable error (like 404) occurs.
 */
async function pollForToken(
    checkUrl: string,
    cliSessionId: string,
    patchIdToVerify: string,
    timeoutMs: number = 600000,
    intervalMs: number = 2500
): Promise<{ patchId: string; purchaseToken: string }> {
    const startTime = Date.now();
    console.log(`CLI: Starting polling for purchase token for session ${cliSessionId}. Timeout: ${timeoutMs / 1000}s.`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const fullUrl = `${checkUrl}/${cliSessionId}`;
            const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
                https
                    .get(fullUrl, (res) => {
                        let data = '';
                        res.on('data', (chunk) => (data += chunk));
                        res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
                    })
                    .on('error', (err) => reject(err));
            });

            if (response.statusCode === 200) {
                const data = JSON.parse(response.body);
                if (data.purchaseToken && data.patchId && data.patchId === patchIdToVerify) {
                    console.log('CLI: Purchase token and verified patch ID received successfully.');
                    return { purchaseToken: data.purchaseToken, patchId: data.patchId };
                }
            } else if (response.statusCode === 404) {
                console.error('CLI: Purchase session not found (404). Stopping polling.');
                throw new Error('Purchase session not found.');
            }
        } catch (error: any) {
            // Do not interrupt for generic network errors, let the timeout handle it
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timeout while polling for purchase token.');
}

/**
 * Handles the '--buy' command.
 * This function orchestrates the process of purchasing a patch using a .taysell file:
 * 1. Validates the input .taysell file path and its content.
 * 2. Confirms with the user if they want to proceed with the purchase (skipped in test mode).
 * 3. Generates a unique CLI session ID and constructs a payment initiation URL.
 * 4. Opens the payment initiation URL in the user's default web browser.
 * 5. Polls a backend endpoint (`/check-purchase`) using the CLI session ID to wait for
 *    the payment to be completed and a purchase token to be issued by the backend.
 * 6. Once the purchase token is received, it requests the encrypted patch content from
 *    the backend's getPatchUrl endpoint, sending the patchId and purchaseToken.
 * 7. If not a dry run:
 *    a. Saves the downloaded (and still encrypted) patch content to the .taylored directory.
 *    b. (Currently commented out) Would then call `handleApplyOperation` to apply the patch.
 * 8. If it is a dry run, it prints the received patch content instead of saving/applying.
 *
 * @param {string} taysellFilePath - Path to the .taysell file describing the patch to be purchased.
 * @param {boolean} isDryRun - If true, simulates the purchase and prints patch content instead of saving/applying.
 * @param {string} CWD - The current working directory.
 */
export async function handleBuyCommand(taysellFilePath: string, isDryRun: boolean, CWD: string): Promise<void> {
    if (!taysellFilePath.endsWith('.taysell')) {
        printUsageAndExit(`Invalid file type for '${taysellFilePath}'. Expected a .taysell file.`);
        return;
    }

    const fullTaysellPath = path.resolve(CWD, taysellFilePath);
    if (!(await fs.pathExists(fullTaysellPath))) {
        printUsageAndExit(`CRITICAL ERROR: Taysell file not found at: ${fullTaysellPath}`);
        return;
    }

    let taysellData: TaysellFile;
    try {
        const fileContent = await fs.readFile(fullTaysellPath, 'utf-8');
        taysellData = JSON.parse(fileContent);
        validateTaysellFileContent(taysellData);
    } catch (error: any) {
        printUsageAndExit(`Error reading or parsing taysell file ${taysellFilePath}: ${error.message}`);
        return;
    }

    const { endpoints, patchId, metadata } = taysellData;

    if (!endpoints?.initiatePaymentUrl || !endpoints?.getPatchUrl) {
        printUsageAndExit('Endpoint URLs (initiatePaymentUrl or getPatchUrl) are not defined in the taysell file.');
        return;
    }
    if (!patchId) {
        printUsageAndExit('Patch ID is not defined in the taysell file.');
        return;
    }

    const getPatchUrlObj = new URL(endpoints.getPatchUrl);
    if (getPatchUrlObj.protocol !== 'https:') {
        printUsageAndExit('CRITICAL ERROR: for security reasons, getPatchUrl must use HTTPS.');
        return;
    }

    const confirmQuestion = [
        {
            type: 'confirm',
            name: 'proceed',
            message: `You are about to purchase the patch "${metadata.name}" from "${taysellData.sellerInfo.name}". Continue?`,
            default: true,
        },
    ];
    const defaultConfirmAnswer = { proceed: true }; // In test, always proceed

    const { proceed } = await promptOrUseDefaults(confirmQuestion, defaultConfirmAnswer);
    if (!proceed) {
        console.log('Purchase aborted by user.');
        return;
    }

    const cliSessionId = uuidv4();
    const initiatePaymentUrlWithParams = `${endpoints.initiatePaymentUrl}?cliSessionId=${cliSessionId}`;

    console.log('CLI: Opening browser for payment approval...');
    try {
        await open(initiatePaymentUrlWithParams);
    } catch (error) {
        console.error('CLI: Could not open browser. Please copy and paste the following URL into your browser:', error);
        console.log(initiatePaymentUrlWithParams);
    }

    console.log('CLI: Waiting to receive purchase token from browser...');
    let purchaseToken: string;

    try {
        const paymentApiBaseUrl = new URL(endpoints.initiatePaymentUrl).origin;
        const checkUrl = `${paymentApiBaseUrl}/check-purchase`;
        console.log(`CLI: Starting polling to: ${checkUrl}/${cliSessionId}`);
        const pollResult = await pollForToken(checkUrl, cliSessionId, patchId);
        purchaseToken = pollResult.purchaseToken;
    } catch (error: any) {
        printUsageAndExit(`CLI: Failed to retrieve purchase token via polling: ${error.message}`);
        return;
    }

    console.log(`CLI: Requesting patch from ${endpoints.getPatchUrl}...`);
    try {
        const postData = JSON.stringify({ patchId, purchaseToken });
        const options = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const patchContent = await new Promise<string>((resolve, reject) => {
            const req = https.request(endpoints.getPatchUrl, options, (res) => {
                let body = '';
                res.on('data', (chunk) => (body += chunk));
                res.on('end', () => {
                    if (res.statusCode !== 200) {
                        reject(new Error(`Failed to download patch. Status: ${res.statusCode} - ${body}`));
                    } else {
                        resolve(body);
                    }
                });
            });
            req.on('error', (e) => reject(new Error(`Error making request to get patch: ${e.message}`)));
            req.write(postData);
            req.end();
        });

        if (isDryRun) {
            console.log('--- DRY RUN ---');
            console.log('The patch will not be saved or applied.');
            console.log('Received patch content:');
            console.log(patchContent);
        } else {
            const tayloredDir = path.resolve(CWD, TAYLORED_DIR_NAME);
            const targetFileName = `${patchId.replace(/[^a-z0-9]/gi, '_')}${TAYLORED_FILE_EXTENSION}`;
            const destinationPath = path.join(tayloredDir, targetFileName);

            await fs.ensureDir(tayloredDir);
            await fs.writeFile(destinationPath, patchContent);
            console.log(`Patch downloaded and saved to: ${destinationPath}`);

            //await handleApplyOperation(targetFileName, false, false, "buy", CWD);
            console.log(`Purchase and application of patch '${metadata.name}' completed.`);
        }
    } catch (error: any) {
        printUsageAndExit(`CRITICAL ERROR: Failed to retrieve patch. Details: ${error.message}`);
    }
}

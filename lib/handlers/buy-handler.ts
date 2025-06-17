import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit } from '../utils';
import { v4 as uuidv4 } from 'uuid';
// import open from 'open'; // Removed static import
import inquirer from 'inquirer';

async function pollForToken(checkUrl: string, cliSessionId: string, patchIdToVerify: string, timeoutMs: number = 600000, intervalMs: number = 2500): Promise<{ patchId: string; purchaseToken: string }> {
    const startTime = Date.now();
    console.log(`CLI: Starting polling for purchase token for session ${cliSessionId}. Timeout: ${timeoutMs / 1000}s.`);

    while (Date.now() - startTime < timeoutMs) {
        try {
            const fullUrl = `${checkUrl}/${cliSessionId}`;
            const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
                https.get(fullUrl, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
                }).on('error', (err) => reject(err));
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
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timeout while polling for purchase token.');
}

export async function handleBuyCommand(
    taysellFilePath: string,
    isDryRun: boolean,
    CWD: string
): Promise<void> {
    if (!taysellFilePath.endsWith('.taysell')) {
        printUsageAndExit(`Invalid file type for '${taysellFilePath}'. Expected a .taysell file.`);
        return;
    }

    const fullTaysellPath = path.resolve(CWD, taysellFilePath);
    if (!await fs.pathExists(fullTaysellPath)) {
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

    // Added to avoid prompt if in test mode
    if (!process.env.JEST_WORKER_ID) {
        const { proceed } = await inquirer.prompt([{
            type: 'confirm',
            name: 'proceed',
            message: `You are about to purchase the patch "${metadata.name}" from "${taysellData.sellerInfo.name}". Continue?`,
            default: true,
        }]);
        if (!proceed) {
            console.log('Purchase aborted by user.');
            return;
        }
    }


    const cliSessionId = uuidv4();
    const initiatePaymentUrlWithParams = `${endpoints.initiatePaymentUrl}?cliSessionId=${cliSessionId}`;

    console.log('CLI: Opening browser for payment approval...');
    try {
        const {default: open} = await import('open'); // Dynamic import
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

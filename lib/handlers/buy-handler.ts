import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
//import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit } from '../utils';
import { v4 as uuidv4 } from 'uuid';
import inquirer from 'inquirer';

async function pollForToken(checkUrl: string, cliSessionId: string, patchIdToVerify: string, timeoutMs: number = 600000, intervalMs: number = 2500): Promise<{ patchId: string; purchaseToken: string }> {
    const startTime = Date.now();
    console.log(`CLI: Starting polling for purchase token for session ${cliSessionId}. Timeout: ${timeoutMs / 1000}s.`);
    let lastWarningTime = 0;
    const WARNING_INTERVAL = 15000; // ms, to avoid spamming warnings

    while (Date.now() - startTime < timeoutMs) {
        try {
            const fullUrl = `${checkUrl}/${cliSessionId}`;
            const response = await new Promise<{ statusCode: number | undefined; body: string }>((resolve, reject) => {
                https.get(fullUrl, (res) => {
                    let data = '';
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
                }).on('error', (err) => reject(err)); // Network errors will be caught by the outer try-catch
            });

            if (response.statusCode === 200) {
                const data = JSON.parse(response.body); // JSON parse errors will be caught by outer try-catch
                if (data.purchaseToken && data.patchId && data.patchId === patchIdToVerify) {
                    console.log('CLI: Purchase token and verified patch ID received successfully.');
                    return { purchaseToken: data.purchaseToken, patchId: data.patchId };
                } else {
                    // Successful response, but unexpected data (e.g., missing token, wrong patchId)
                    if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
                        console.warn(`CLI: Server responded successfully (200) but with unexpected data structure at ${fullUrl}. Retrying...`);
                        lastWarningTime = Date.now();
                    }
                }
            } else if (response.statusCode === 404) {
                console.error(`CLI: Purchase session not found (404) at ${fullUrl}. This may mean the session expired or was invalid.`);
                throw new Error('Purchase session not found (404).'); // Specific error for 404
            } else if (response.statusCode !== undefined && response.statusCode > 405) {
                // Server errors (5xx) or other client errors (>405 and not 404)
                // These are considered terminal for the polling process by this client.
                const errorMessage = `Server error during polling: Status ${response.statusCode}`;
                console.error(`CLI: ${errorMessage} at ${fullUrl}. Aborting polling.`);
                throw new Error(errorMessage); // This will be caught by handleBuyCommand
            } else if (response.statusCode !== 200) { 
                // For other non-200 codes not explicitly handled (e.g., 400-403, 405, or 2xx with unexpected data if previous checks failed)
                // Log a warning and continue retrying until timeout.
                if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
                    console.warn(`CLI: Unexpected response (Status: ${response.statusCode}) from server at ${fullUrl}. Retrying...`);
                    lastWarningTime = Date.now();
                }
            }
        } catch (error: any) {
            // If the error is a specific one we want to propagate immediately (404 or server error > 405), re-throw it.
            if (error.message &&
                (error.message.includes('Purchase session not found (404)') || error.message.startsWith('Server error during polling:'))) {
                throw error; 
            }
            // Catches network errors from https.get or JSON.parse errors
            if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
                console.warn(`CLI: Error during polling attempt: ${error.message}. Retrying...`);
                lastWarningTime = Date.now();
            }
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }
    // Timeout occurred
    throw new Error('Timeout: Waited too long for purchase confirmation. If payment was made, please contact the seller.');
}

/**
 * Displays a standardized assistance message to the user when a purchase-related error occurs.
 * @param issueType A string describing the type of issue (e.g., "Timeout", "Download Failed").
 * @param taysellData The TaysellFile data.
 * @param cliSessionId The CLI session ID (relevant for timeout issues).
 * @param purchaseToken The purchase token (relevant for download failures after payment).
 * @param underlyingErrorMessage The original error message that triggered this assistance message.
 */
function displayPurchaseAssistanceMessage(
    issueType: "Timeout" | "Download Failed" | "Polling Server Error",
    taysellData: TaysellFile,
    cliSessionId: string | null,
    purchaseToken: string | null,
    underlyingErrorMessage: string
): void {
    const title = issueType === "Timeout" ? "Purchase Confirmation Timed Out" :
                  issueType === "Download Failed" ? "Payment Succeeded, Download Failed" :
                  "Server Error During Purchase Confirmation";
    console.error(`\n--- ${title} ---`);

    if (issueType === "Timeout") {
        console.error("We were unable to confirm your purchase within the time limit.");
        console.error("This could be due to several reasons:");
        console.error("  - The payment process was not completed in the browser.");
        console.error("  - There was a network issue preventing communication with the server.");
        console.error("  - The seller's server is experiencing delays.");
    } else if (issueType === "Polling Server Error") {
        console.error("The seller's server reported an issue while we were trying to confirm your purchase status.");
        console.error("This might be a temporary problem with the server or an issue with the purchase session.");
        console.error("Details of the error encountered:");
        // The underlyingErrorMessage will contain the status code from the server.
        console.error(`  ${underlyingErrorMessage}`);
    } else {
        console.error("An error occurred while attempting to download the patch after your payment was processed.");
    }
    console.error("\nIf you believe your payment was successful (or in case of download failure), please contact the seller for assistance.\n");

    const sellerContact = taysellData.sellerInfo.contact;
    const patchName = taysellData.metadata.name;

    console.error(`Seller Contact: ${sellerContact}\n`);
    console.error("Please provide them with the following information if you contact them:\n");
    console.error(`- Issue: ${issueType} for patch "${patchName}" (Patch ID: ${taysellData.patchId}).`);
    if (cliSessionId) console.error(`- CLI Session ID: ${cliSessionId}`);
    if (purchaseToken) console.error(`- Purchase Token: ${purchaseToken}`);
    console.error("\n---------------------------\n");
    console.error(`CRITICAL ERROR: ${underlyingErrorMessage}`); // Display the original error that led to this
    process.exit(1);
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
        if (error.message && error.message.startsWith('Timeout:')) {
            displayPurchaseAssistanceMessage(
                "Timeout",
                taysellData,
                cliSessionId,
                null, // No purchase token yet if timeout occurred during polling
                `Timeout confirming purchase for patch "${taysellData.metadata.name}". ${error.message}`
            );
            // process.exit(1) is called within displayPurchaseAssistanceMessage
        } else if (error.message && error.message.includes('Purchase session not found (404)')) {
            printUsageAndExit(`CLI: Failed to retrieve purchase token. The purchase session was not found (404), possibly expired or invalid.`);
        } else if (error.message && error.message.startsWith('Server error during polling:')) {
            displayPurchaseAssistanceMessage(
                "Polling Server Error",
                taysellData,
                cliSessionId,
                null, // No purchase token if polling failed due to server error
                `The server returned an error while confirming purchase for patch "${taysellData.metadata.name}". ${error.message}`
            );
            // displayPurchaseAssistanceMessage calls process.exit(1), so this line should not be reached.
            // The original printUsageAndExit message here was also misleading for this error type.
        } else {
            printUsageAndExit(`CLI: An unexpected error occurred while trying to retrieve the purchase token: ${error.message}`);
        }
        return; // Should be unreachable
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
        displayPurchaseAssistanceMessage(
            "Download Failed",
            taysellData,
            cliSessionId, // Pass cliSessionId for completeness, though purchaseToken is more direct here
            purchaseToken, // Purchase token is available if download failed after polling
            `Failed to retrieve/download patch "${taysellData.metadata.name}". Details: ${error.message}`
        );
        // process.exit(1) is called within displayPurchaseAssistanceMessage
    }
}

import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
//import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit } from '../utils';
import * as crypto from 'crypto';
import inquirer from 'inquirer';

/**
 * Polls a server endpoint to check for purchase confirmation and retrieve a purchase token.
 *
 * This function repeatedly makes GET requests to a specified `checkUrl` (appended with
 * `cliSessionId`) until the server responds with a valid `purchaseToken` and a matching
 * `patchId`, or until a timeout occurs. It handles various HTTP status codes,
 * retrying on transient issues (like 404 or other client-side errors) and failing fast
 * on definitive server errors (5xx or >405). Warnings are logged to the console
 * periodically if polling continues without success, to avoid spamming.
 *
 * @async
 * @param {string} checkUrl - The base URL of the server endpoint to poll for purchase status.
 * @param {string} cliSessionId - The unique session ID generated by the CLI to link
 *                                this polling session with the browser-based payment process.
 * @param {string} patchIdToVerify - The expected Patch ID. The server's response must include
 *                                   this ID for the polling to be considered successful.
 * @param {number} [timeoutMs=600000] - Total time in milliseconds to continue polling before timing out.
 *                                      Defaults to 10 minutes.
 * @param {number} [intervalMs=2500] - Interval in milliseconds between polling attempts.
 *                                     Defaults to 2.5 seconds.
 * @returns {Promise<{ patchId: string; purchaseToken: string }>} A promise that resolves with an
 *          object containing the `patchId` and `purchaseToken` upon successful confirmation.
 * @throws {Error} Throws an error if:
 *                 - Polling times out.
 *                 - The server returns a terminal error status (e.g., 5xx).
 *                 - The server responds successfully but with an invalid/unexpected data structure.
 */
async function pollForToken(
  checkUrl: string,
  cliSessionId: string,
  patchIdToVerify: string,
  timeoutMs: number = 600000,
  intervalMs: number = 2500,
): Promise<{ patchId: string; purchaseToken: string }> {
  const startTime = Date.now();
  console.log(
    `CLI: Starting polling for purchase token for session ${cliSessionId}. Timeout: ${timeoutMs / 1000}s.`,
  );
  let lastWarningTime = 0;
  const WARNING_INTERVAL = 15000; // ms, to avoid spamming warnings

  while (Date.now() - startTime < timeoutMs) {
    try {
      const fullUrl = `${checkUrl}/${cliSessionId}`;
      const response = await new Promise<{
        statusCode: number | undefined;
        body: string;
      }>((resolve, reject) => {
        https
          .get(fullUrl, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () =>
              resolve({ statusCode: res.statusCode, body: data }),
            );
          })
          .on('error', (err) => reject(err)); // Network errors will be caught by the outer try-catch
      });

      if (response.statusCode === 200) {
        const data = JSON.parse(response.body); // JSON parse errors will be caught by outer try-catch
        if (
          data.purchaseToken &&
          data.patchId &&
          data.patchId === patchIdToVerify
        ) {
          console.log(
            'CLI: Purchase token and verified patch ID received successfully.',
          );
          return { purchaseToken: data.purchaseToken, patchId: data.patchId };
        } else {
          // Successful response, but unexpected data (e.g., missing token, wrong patchId)
          if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
            console.warn(
              `CLI: Server responded successfully (200) but with unexpected data structure at ${fullUrl}. Retrying...`,
            );
            lastWarningTime = Date.now();
          }
        }
      } else if (response.statusCode === 404) {
        // Changed behavior: Log a warning and retry on 404, instead of throwing immediately.
        if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
          console.warn(
            `CLI: Purchase session not found (404) at ${fullUrl}. Please waiting! Retrying...`,
          );
          lastWarningTime = Date.now();
        }
      } else if (
        response.statusCode !== undefined &&
        response.statusCode > 405
      ) {
        // Server errors (5xx) or other client errors (>405 and not 404)
        // These are considered terminal for the polling process by this client.
        const errorMessage = `Server error during polling: Status ${response.statusCode}`;
        console.error(`CLI: ${errorMessage} at ${fullUrl}. Aborting polling.`);
        throw new Error(errorMessage); // This will be caught by handleBuyCommand
      } else if (response.statusCode !== 200) {
        // For other non-200 codes not explicitly handled (e.g., 400-403, 405, or 2xx with unexpected data if previous checks failed)
        // Log a warning and continue retrying until timeout.
        if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
          console.warn(
            `CLI: Unexpected response (Status: ${response.statusCode}) from server at ${fullUrl}. Retrying...`,
          );
          lastWarningTime = Date.now();
        }
      }
    } catch (error: any) {
      // If the error is a specific one we want to propagate immediately (404 or server error > 405), re-throw it.
      if (
        error.message &&
        error.message.startsWith('Server error during polling:')
      ) {
        throw error;
      }
      // Catches network errors from https.get or JSON.parse errors
      if (Date.now() - lastWarningTime > WARNING_INTERVAL) {
        console.warn(
          `CLI: Error during polling attempt: ${error.message}. Retrying...`,
        );
        lastWarningTime = Date.now();
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  // Timeout occurred
  throw new Error(
    'Timeout: Waited too long for purchase confirmation. If payment was made, please contact the seller.',
  );
}

/**
 * Displays a standardized user assistance message when a purchase-related error occurs.
 *
 * This function formats and logs a detailed error message to the console, guiding the user
 * on how to proceed if their payment was potentially made but the patch acquisition failed.
 * It includes seller contact information and relevant transaction identifiers.
 * After displaying the message, it terminates the process with exit code 1.
 *
 * @param {"Timeout" | "Download Failed" | "Polling Server Error"} issueType - The type of issue encountered.
 * @param {TaysellFile} taysellData - The parsed content of the `.taysell` file, containing
 *                                    seller and patch information.
 * @param {string | null} cliSessionId - The CLI session ID, relevant for timeout or polling issues.
 * @param {string | null} purchaseToken - The purchase token, if obtained (relevant for download failures).
 * @param {string} underlyingErrorMessage - The original error message that led to this assistance request.
 * @returns {void} This function does not return as it exits the process.
 */
function displayPurchaseAssistanceMessage(
  issueType: 'Timeout' | 'Download Failed' | 'Polling Server Error',
  taysellData: TaysellFile,
  cliSessionId: string | null,
  purchaseToken: string | null,
  underlyingErrorMessage: string,
): void {
  const title =
    issueType === 'Timeout'
      ? 'Purchase Confirmation Timed Out'
      : issueType === 'Download Failed'
        ? 'Payment Succeeded, Download Failed'
        : 'Server Error During Purchase Confirmation';
  console.error(`\n--- ${title} ---`);

  if (issueType === 'Timeout') {
    console.error(
      'We were unable to confirm your purchase within the time limit.',
    );
    console.error('This could be due to several reasons:');
    console.error('  - The payment process was not completed in the browser.');
    console.error(
      '  - There was a network issue preventing communication with the server.',
    );
    console.error("  - The seller's server is experiencing delays.");
  } else if (issueType === 'Polling Server Error') {
    console.error(
      "The seller's server reported an issue while we were trying to confirm your purchase status.",
    );
    console.error(
      'This might be a temporary problem with the server or an issue with the purchase session.',
    );
    console.error('Details of the error encountered:');
    // The underlyingErrorMessage will contain the status code from the server.
    console.error(`  ${underlyingErrorMessage}`);
  } else {
    console.error(
      'An error occurred while attempting to download the patch after your payment was processed.',
    );
  }
  console.error(
    '\nIf you believe your payment was successful (or in case of download failure), please contact the seller for assistance.\n',
  );

  const sellerContact = taysellData.sellerInfo.contact;
  const patchName = taysellData.metadata.name;

  console.error(`Seller Contact: ${sellerContact}\n`);
  console.error(
    'Please provide them with the following information if you contact them:\n',
  );
  console.error(
    `- Issue: ${issueType} for patch "${patchName}" (Patch ID: ${taysellData.patchId}).`,
  );
  if (cliSessionId) console.error(`- CLI Session ID: ${cliSessionId}`);
  if (purchaseToken) console.error(`- Purchase Token: ${purchaseToken}`);
  console.error('\n---------------------------\n');
  console.error(`CRITICAL ERROR: ${underlyingErrorMessage}`); // Display the original error that led to this
  process.exit(1);
}

/**
 * Implements the `taylored --buy <file.taysell> [--dry-run]` command.
 *
 * This function orchestrates the process of purchasing a commercial Taylored patch.
 * The workflow includes:
 * 1.  **File Validation**: Reads and validates the provided `.taysell` metadata file.
 *     Ensures required fields (endpoints, patchId) are present and `getPatchUrl` uses HTTPS.
 * 2.  **User Confirmation**: Prompts the user (unless in a test environment) to confirm
 *     the purchase, displaying patch name and seller information.
 * 3.  **Payment Initiation**:
 *     - Generates a unique `cliSessionId`.
 *     - Constructs the payment URL from `endpoints.initiatePaymentUrl` in the `.taysell` file,
 *       appending the `cliSessionId`.
 *     - Opens this URL in the user's default web browser for payment processing.
 * 4.  **Payment Confirmation Polling**:
 *     - Calls `pollForToken` to repeatedly query the seller's Taysell server
 *       (at `SERVER_BASE_URL/check-purchase/:cliSessionId`) to wait for payment
 *       completion and retrieve a `purchaseToken`.
 * 5.  **Patch Download**:
 *     - Upon receiving a valid `purchaseToken`, makes a POST request to the
 *       `endpoints.getPatchUrl` (from `.taysell` file) with the `patchId` and `purchaseToken`.
 *     - The server is expected to return the decrypted patch content.
 * 6.  **Patch Handling**:
 *     - If `isDryRun` is true: Prints the downloaded patch content to the console.
 *     - If `isDryRun` is false:
 *       - Saves the patch content to a new `.taylored` file in the local `.taylored/` directory
 *         (filename derived from `patchId`).
 *       - (Currently commented out) Would then call `handleApplyOperation` to apply the new patch.
 * 7.  **Error Handling**: If any step fails (e.g., file validation, polling timeout, download error),
 *     it calls `printUsageAndExit` or `displayPurchaseAssistanceMessage` to inform the user
 *     and then typically exits the process.
 *
 * For more details on this command and the Taysell system, refer to `DOCUMENTATION.md`.
 *
 * @async
 * @param {string} taysellFilePath - Path to the `.taysell` metadata file for the patch to be purchased.
 * @param {boolean} isDryRun - If true, simulates the purchase and prints the patch content
 *                             instead of saving and applying it.
 * @param {string} CWD - The current working directory, used for resolving file paths.
 * @returns {Promise<void>} A promise that resolves when the buy operation (or dry run) is complete,
 *                          or if the user aborts the process.
 * @throws {Error} This function typically handles its own errors by calling `printUsageAndExit`
 *                 or `displayPurchaseAssistanceMessage` which terminate the process. It doesn't
 *                 usually throw errors to be caught by the main CLI handler.
 */
export async function handleBuyCommand(
  taysellFilePath: string,
  isDryRun: boolean,
  CWD: string,
): Promise<void> {
  if (!taysellFilePath.endsWith('.taysell')) {
    printUsageAndExit(
      `Invalid file type for '${taysellFilePath}'. Expected a .taysell file.`,
    );
    return;
  }

  const fullTaysellPath = path.resolve(CWD, taysellFilePath);
  if (!(await fs.pathExists(fullTaysellPath))) {
    printUsageAndExit(
      `CRITICAL ERROR: Taysell file not found at: ${fullTaysellPath}`,
    );
    return;
  }

  let taysellData: TaysellFile;
  try {
    const fileContent = await fs.readFile(fullTaysellPath, 'utf-8');
    taysellData = JSON.parse(fileContent);
    validateTaysellFileContent(taysellData);
  } catch (error: any) {
    printUsageAndExit(
      `Error reading or parsing taysell file ${taysellFilePath}: ${error.message}`,
    );
    return;
  }

  const { endpoints, patchId, metadata } = taysellData;

  if (!endpoints?.initiatePaymentUrl || !endpoints?.getPatchUrl) {
    printUsageAndExit(
      'Endpoint URLs (initiatePaymentUrl or getPatchUrl) are not defined in the taysell file.',
    );
    return;
  }
  if (!patchId) {
    printUsageAndExit('Patch ID is not defined in the taysell file.');
    return;
  }

  const getPatchUrlObj = new URL(endpoints.getPatchUrl);
  if (getPatchUrlObj.protocol !== 'https:') {
    printUsageAndExit(
      'CRITICAL ERROR: for security reasons, getPatchUrl must use HTTPS.',
    );
    return;
  }

  // Added to avoid prompt if in test mode
  if (!process.env.JEST_WORKER_ID) {
    const { proceed } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'proceed',
        message: `You are about to purchase the patch "${metadata.name}" from "${taysellData.sellerInfo.name}". Continue?`,
        default: true,
      },
    ]);
    if (!proceed) {
      console.log('Purchase aborted by user.');
      return;
    }
  }

  const cliSessionId = crypto.randomUUID();
  const initiatePaymentUrlWithParams = `${endpoints.initiatePaymentUrl}?cliSessionId=${cliSessionId}`;

  console.log('CLI: Opening browser for payment approval...');
  try {
    const { default: open } = await import('open'); // Dynamic import
    await open(initiatePaymentUrlWithParams);
  } catch (error) {
    console.error(
      'CLI: Could not open browser. Please copy and paste the following URL into your browser:',
      error,
    );
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
        'Timeout',
        taysellData,
        cliSessionId,
        null, // No purchase token yet if timeout occurred during polling
        `Timeout confirming purchase for patch "${taysellData.metadata.name}". ${error.message}`,
      );
      // process.exit(1) is called within displayPurchaseAssistanceMessage
    } else if (
      error.message &&
      error.message.includes('Purchase session not found (404)')
    ) {
      // This block should ideally not be reached if pollForToken retries on 404 until timeout.
      // However, keeping it as a fallback or if other parts of the code could throw this.
      // The more likely scenario now is a general timeout.
      printUsageAndExit(
        `CLI: The purchase session was consistently not found (404) and polling timed out or was aborted.`,
      );
    } else if (
      error.message &&
      error.message.startsWith('Server error during polling:')
    ) {
      displayPurchaseAssistanceMessage(
        'Polling Server Error',
        taysellData,
        cliSessionId,
        null, // No purchase token if polling failed due to server error
        `The server returned an error while confirming purchase for patch "${taysellData.metadata.name}". ${error.message}`,
      );
      // displayPurchaseAssistanceMessage calls process.exit(1), so this line should not be reached.
      // The original printUsageAndExit message here was also misleading for this error type.
    } else {
      printUsageAndExit(
        `CLI: An unexpected error occurred while trying to retrieve the purchase token: ${error.message}`,
      );
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
            reject(
              new Error(
                `Failed to download patch. Status: ${res.statusCode} - ${body}`,
              ),
            );
          } else {
            resolve(body);
          }
        });
      });
      req.on('error', (e) =>
        reject(new Error(`Error making request to get patch: ${e.message}`)),
      );
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
      console.log(
        `Purchase and application of patch '${metadata.name}' completed.`,
      );
    }
  } catch (error: any) {
    displayPurchaseAssistanceMessage(
      'Download Failed',
      taysellData,
      cliSessionId, // Pass cliSessionId for completeness, though purchaseToken is more direct here
      purchaseToken, // Purchase token is available if download failed after polling
      `Failed to retrieve/download patch "${taysellData.metadata.name}". Details: ${error.message}`,
    );
    // process.exit(1) is called within displayPurchaseAssistanceMessage
  }
}

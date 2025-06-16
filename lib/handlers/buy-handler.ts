import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import { validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit } from '../utils';
import { v4 as uuidv4 } from 'uuid';
import open from 'open';
import inquirer from 'inquirer';

async function pollForToken(checkUrl: string, cliSessionId: string, patchIdToVerify: string, timeoutMs: number = 600000, intervalMs: number = 2500): Promise<{ patchId: string; purchaseToken: string }> {
    const startTime = Date.now();
    console.log(`CLI: Inizio polling per token di acquisto per sessione ${cliSessionId}. Timeout: ${timeoutMs / 1000}s.`);

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
                    console.log('CLI: Token di acquisto e ID patch verificato ricevuti con successo.');
                    return { purchaseToken: data.purchaseToken, patchId: data.patchId };
                }
            } else if (response.statusCode === 404) {
                console.error('CLI: Sessione di acquisto non trovata (404). Interruzione polling.');
                throw new Error('Sessione di acquisto non trovata.');
            }
        } catch (error: any) {
            // Non interrompere per errori di rete generici, lascia che il timeout gestisca
        }
        await new Promise(resolve => setTimeout(resolve, intervalMs));
    }

    throw new Error('Timeout durante il polling per il token di acquisto.');
}

export async function handleBuyCommand(
    taysellFilePath: string,
    isDryRun: boolean,
    CWD: string
): Promise<void> {
    // CORREZIONE: Il comando --buy deve usare file .taysell
    if (!taysellFilePath.endsWith('.taysell')) {
        printUsageAndExit(`Invalid file type for '${taysellFilePath}'. Expected a .taysell file.`);
        return; // Aggiunto return per coerenza
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
        printUsageAndExit('CRITICAL ERROR: per motivi di sicurezza, getPatchUrl deve usare HTTPS.');
        return;
    }

    // Aggiunto per evitare il prompt se in modalità test
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

    console.log('CLI: Apertura del browser per l\'approvazione del pagamento...');
    try {
        await open(initiatePaymentUrlWithParams);
    } catch (error) {
        console.error('CLI: Impossibile aprire il browser. Copia e incolla il seguente URL nel tuo browser:', error);
        console.log(initiatePaymentUrlWithParams);
    }

    console.log('CLI: In attesa della ricezione del token di acquisto dal browser...');
    let purchaseToken: string;

    try {
        const paymentApiBaseUrl = new URL(endpoints.initiatePaymentUrl).origin;
        const checkUrl = `${paymentApiBaseUrl}/check-purchase`;
        console.log(`CLI: Avvio polling verso: ${checkUrl}/${cliSessionId}`);
        const pollResult = await pollForToken(checkUrl, cliSessionId, patchId);
        purchaseToken = pollResult.purchaseToken;
    } catch (error: any) {
        printUsageAndExit(`CLI: Fallimento nel recuperare il token di acquisto tramite polling: ${error.message}`);
        return;
    }

    console.log(`CLI: Richiesta patch a ${endpoints.getPatchUrl}...`);
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
            console.log('La patch non sarà salvata o applicata.');
            console.log('Contenuto della patch ricevuta:');
            console.log(patchContent);
        } else {
            const tayloredDir = path.resolve(CWD, TAYLORED_DIR_NAME);
            const targetFileName = `${patchId.replace(/[^a-z0-9]/gi, '_')}${TAYLORED_FILE_EXTENSION}`;
            const destinationPath = path.join(tayloredDir, targetFileName);
            
            await fs.ensureDir(tayloredDir);
            await fs.writeFile(destinationPath, patchContent);
            console.log(`Patch scaricata e salvata in: ${destinationPath}`);

            await handleApplyOperation(targetFileName, false, false, "buy", CWD);
            console.log(`Acquisto e applicazione della patch '${metadata.name}' completati.`);
        }
    } catch (error: any) {
        printUsageAndExit(`CRITICAL ERROR: Failed to retrieve patch. Details: ${error.message}`);
    }
}

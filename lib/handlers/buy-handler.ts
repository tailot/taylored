import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer'; // Parzialmente sostituito dalla logica del server locale
import * as https from 'https';
import { validateTaysellFileContent, TaysellFile } from '../taysell-utils';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { handleApplyOperation } from '../apply-logic';
import { printUsageAndExit } from '../utils';

// Importazioni per il micro-server locale
import * as express from 'express';
import { v4 as uuidv4 } from 'uuid'; // Per generare ID di sessione unici
import open from 'open'; // Per aprire l'URL nel browser

const DEFAULT_CLI_LOCAL_PORT = 3001; // Porta di default per il server locale della CLI

export async function handleBuyCommand(args: string[]): Promise<void> {
    if (args.length === 0) {
        printUsageAndExit('Missing <taysell_file_path> argument for buy command.');
    }
    if (args.length > 1) {
        printUsageAndExit('Too many arguments for buy command. Expected only <taysell_file_path>.');
    }

    const taysellFilePath = args[0];
    if (!taysellFilePath.endsWith(TAYLORED_FILE_EXTENSION)) {
        printUsageAndExit(`Invalid file type. Expected a ${TAYLORED_FILE_EXTENSION} file.`);
    }

    let taysellData: TaysellFile;
    try {
        const fileContent = await fs.readFile(taysellFilePath, 'utf-8');
        taysellData = JSON.parse(fileContent);
        validateTaysellFileContent(taysellData); // Validate structure and content
    } catch (error: any) {
        console.error(`Error reading or parsing taysell file ${taysellFilePath}: ${error.message}`);
        process.exit(1);
    }

    if (!taysellData.payment?.initiatePaymentUrl || !taysellData.payment?.getPatchUrl) {
        console.error('Payment URLs are not defined in the taysell file.');
        process.exit(1);
    }
    if (!taysellData.patchId) {
        console.error('Patch ID is not defined in the taysell file.');
        process.exit(1);
    }

    const cliSessionId = uuidv4();
    const cliLocalPort = DEFAULT_CLI_LOCAL_PORT; // In futuro, potremmo cercare una porta disponibile

    const app = express();
    app.use(express.json());

    let resolveTokenPromise: (token: string) => void;
    const tokenReceivedPromise = new Promise<string>((resolve) => {
        resolveTokenPromise = resolve;
    });

    const server = app.listen(cliLocalPort, () => {
        console.log(`CLI: Server locale in ascolto sulla porta ${cliLocalPort} per il token di acquisto...`);
        console.log(`CLI: Sessione ID: ${cliSessionId}`);
    });

    // Endpoint per ricevere il token dal browser (dalla pagina di successo)
    app.post('/receive-token', (req, res) => {
        const { patchId: receivedPatchId, purchaseToken: receivedToken } = req.body;

        if (!receivedPatchId || !receivedToken) {
            console.error('CLI: Dati token non validi ricevuti dal browser.');
            res.status(400).json({ status: 'error', message: 'Dati token non validi.' });
            return;
        }

        if (receivedPatchId !== taysellData.patchId) {
            console.error(`CLI: Patch ID non corrispondente. Atteso ${taysellData.patchId}, ricevuto ${receivedPatchId}.`);
            res.status(400).json({ status: 'error', message: 'Patch ID non corrispondente.' });
            return;
        }

        console.log('CLI: Token di acquisto ricevuto dal browser!');
        resolveTokenPromise(receivedToken); // Risolve la promessa con il token ricevuto

        res.json({ status: 'success', message: 'Token ricevuto dalla CLI.' });

        // Chiudi il server dopo aver inviato la risposta e risolto la promessa
        server.close(() => {
            console.log('CLI: Server locale terminato.');
        });
    });

    // Aggiungi cliSessionId e cliLocalPort all'URL di pagamento
    const initiatePaymentUrlWithParams = `${taysellData.payment.initiatePaymentUrl}?cliSessionId=${cliSessionId}&cliLocalPort=${cliLocalPort}`;

    console.log('CLI: Apertura del browser per l\'approvazione del pagamento...');
    try {
        await open(initiatePaymentUrlWithParams);
    } catch (error) {
        console.error('CLI: Impossibile aprire il browser. Copia e incolla il seguente URL nel tuo browser:', error);
        console.log(initiatePaymentUrlWithParams);
        // In questo caso, l'utente dovrà gestire manualmente il reindirizzamento e il server attenderà.
    }

    console.log('CLI: In attesa della ricezione del token di acquisto dal browser...');
    let purchaseToken: string;
    try {
        purchaseToken = await tokenReceivedPromise; // Attendi che il token venga ricevuto
        console.log('CLI: Token di acquisto ottenuto.');

        // Qui il server è già stato chiuso nel gestore di /receive-token
        // Non è necessario server.close() qui se la logica rimane quella.

    } catch (error) {
        console.error('CLI: Errore durante l\'attesa del token di acquisto:', error);
        server.close(() => { // Assicurati che il server sia chiuso in caso di errore prima della ricezione del token
            console.log('CLI: Server locale terminato a causa di un errore.');
        });
        process.exit(1);
    }


    // --- Logica precedente per ottenere il patch ---
    const getPatchUrl = taysellData.payment.getPatchUrl;
    const postData = JSON.stringify({
        patchId: taysellData.patchId,
        purchaseToken: purchaseToken,
    });

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
        },
    };

    console.log(`CLI: Richiesta patch a ${getPatchUrl}...`);

    // Utilizza una nuova Promise per gestire la richiesta HTTPS e lo stream del file
    await new Promise<void>((resolve, reject) => {
        const req = https.request(getPatchUrl, options, (res) => {
            if (res.statusCode !== 200) {
                let errorData = '';
                res.on('data', chunk => errorData += chunk);
                res.on('end', () => {
                    console.error(`CLI: Errore durante il recupero della patch. Status: ${res.statusCode}, Messaggio: ${errorData}`);
                    reject(new Error(`Server error: ${res.statusCode} - ${errorData}`));
                });
                return;
            }

            const tayloredDir = path.resolve(process.cwd(), TAYLORED_DIR_NAME);
            const targetFileName = `${taysellData.name}${TAYLORED_FILE_EXTENSION}`;
            const destinationPath = path.join(tayloredDir, targetFileName);

            fs.ensureDirSync(tayloredDir); // Assicura che la directory esista

            const fileStream = fs.createWriteStream(destinationPath);
            res.pipe(fileStream);

            fileStream.on('finish', () => {
                console.log(`CLI: Patch scaricata e salvata con successo in ${destinationPath}`);
                // Dopo aver salvato il file, applica le modifiche
                // Nota: handleApplyOperation si aspetta il nome del file, non il percorso completo
                handleApplyOperation(targetFileName, true)
                    .then(() => {
                        console.log(`CLI: Operazione di applicazione per ${targetFileName} completata.`);
                        resolve();
                    })
                    .catch(applyError => {
                        console.error(`CLI: Errore durante l'applicazione della patch ${targetFileName}:`, applyError);
                        reject(applyError);
                    });
            });

            fileStream.on('error', (streamErr) => {
                console.error(`CLI: Errore durante il salvataggio del file patch: ${streamErr.message}`);
                fs.unlink(destinationPath, () => {}); // Tenta di eliminare il file parziale
                reject(streamErr);
            });
        });

        req.on('error', (requestErr) => {
            console.error(`CLI: Errore durante la richiesta della patch: ${requestErr.message}`);
            reject(requestErr);
        });

        req.write(postData);
        req.end();
    }).catch(error => {
        // L'errore è già stato loggato, esci se necessario o gestisci ulteriormente
        process.exit(1);
    });

    console.log('CLI: Processo di acquisto e applicazione completato.');
}

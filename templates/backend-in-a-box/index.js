// index.js
const express = require('express');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const paypal = require('@paypal/checkout-server-sdk');
const axios = require('axios');
const path = require('path'); // Required for serving static files

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './db/taysell.sqlite';
// SERVER_BASE_URL should be your server's public URL, needed for PayPal return/cancel URLs
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

// Setup PayPal environment
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error("ERRORE CRITICO: Le variabili d'ambiente PAYPAL_CLIENT_ID e PAYPAL_CLIENT_SECRET non sono definite.");
    console.error("Queste variabili sono necessarie per l'integrazione con PayPal.");
    console.error("Senza di esse, le funzionalità di pagamento non opereranno correttamente.");
    // In un ambiente di produzione, potresti voler terminare il processo:
    // process.exit(1);
}

// Considerations for Production Environment:
// - Use HTTPS: Ensure SERVER_BASE_URL uses https.
// - Robust Error Handling: Implement more sophisticated error handling and logging.
// - Security: Add rate limiting, input validation, and other security measures.
// - Database Management: Use a more robust database solution for production.
// - Environment Variables: Manage secrets and configurations securely.

const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
const client = new paypal.core.PayPalHttpClient(environment);

app.use(express.json());
app.use(express.static('public')); // Serve static files from 'public' directory

// Ensure the directory for the SQLite database exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
    console.log(`Directory ${dbDir} created for SQLite database.`);
}

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("Errore durante la connessione al database SQLite:", err.message);
        return;
    }
    console.log("Connesso al database SQLite.");
    // Create purchases table if it doesn't exist
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        patch_id TEXT NOT NULL,
        purchase_token TEXT UNIQUE,
        paypal_order_id TEXT UNIQUE,
        status TEXT NOT NULL,
        cli_session_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("Errore durante la creazione della tabella 'purchases':", err.message);
        } else {
            console.log("Tabella 'purchases' pronta.");
        }
    });
});

// Endpoint to create a PayPal order and initiate a purchase
app.get('/pay/:patchId', async (req, res) => {
    const { patchId } = req.params;
    const { cliSessionId } = req.query; // Extract from query

    if (!patchId) {
        return res.status(400).json({ error: "patchId è obbligatorio." });
    }
    if (!cliSessionId) {
        return res.status(400).json({ error: "cliSessionId è obbligatorio." });
    }

    const purchaseId = crypto.randomBytes(16).toString('hex');
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: 'EUR',
                value: '0.01', // Example value
            },
            description: `Acquisto patch ${patchId}`
        }],
        application_context: {
            return_url: `${SERVER_BASE_URL}/paypal/success?cliSessionId=${cliSessionId}`,
            cancel_url: `${SERVER_BASE_URL}/paypal/cancel?cliSessionId=${cliSessionId}`,
            user_action: 'PAY_NOW',
        }
    });

    try {
        const order = await client.execute(request);
        // Store cliSessionId along with other purchase details
        db.run(`INSERT INTO purchases (id, patch_id, paypal_order_id, status, cli_session_id) VALUES (?, ?, ?, ?, ?)`,
            [purchaseId, patchId, order.result.id, 'CREATED', cliSessionId],
            function(err) {
                if (err) {
                    console.error("Errore durante l'inserimento dell'acquisto nel database:", err.message);
                    return res.status(500).json({ error: "Errore interno del server." });
                }
                console.log(`Nuovo acquisto inserito con ID: ${purchaseId}, PayPal Order ID: ${order.result.id}`);
                const approveUrl = order.result.links.find(link => link.rel === 'approve').href;
                res.redirect(approveUrl);
            });
    } catch (error) {
        console.error("Errore durante la creazione dell'ordine PayPal:", error);
        res.status(500).json({ error: "Errore durante la creazione dell'ordine PayPal." });
    }
});

// PayPal webhook endpoint
app.post('/paypal/webhook', async (req, res) => {
    const webhookEvent = req.body;
    // Log the full event for debugging
    // console.log("Received webhook event:", JSON.stringify(webhookEvent, null, 2));

    // Validate webhook signature (important for security, omitted for brevity in this example)
    // See PayPal documentation for details on webhook signature validation

    if (webhookEvent.event_type === 'CHECKOUT.ORDER.APPROVED' || webhookEvent.event_type === 'CHECKOUT.ORDER.COMPLETED') {
        const orderID = webhookEvent.resource.id;
        const purchaseToken = crypto.randomBytes(16).toString('hex'); // Generate unique purchase token

        db.run(`UPDATE purchases SET status = 'COMPLETED', purchase_token = ? WHERE paypal_order_id = ?`,
            [purchaseToken, orderID],
            async function(err) {
                if (err) {
                    console.error(`Errore durante l'aggiornamento dello stato dell'acquisto per l'ordine PayPal ${orderID}:`, err.message);
                    return res.sendStatus(500); // Internal server error
                }
                if (this.changes === 0) {
                    console.warn(`Nessun acquisto trovato o aggiornato per l'ordine PayPal ${orderID}. L'ordine potrebbe non esistere o essere già stato processato.`);
                    // Consider if this should be an error or handled differently
                    return res.sendStatus(404); // Not Found or some other appropriate status
                }
                console.log(`Acquisto completato e token generato per l'ordine PayPal ${orderID}. Token: ${purchaseToken}`);
                res.sendStatus(200); // Acknowledge receipt of webhook
            });
    } else {
        console.log(`Evento webhook ricevuto non gestito: ${webhookEvent.event_type}`);
        res.sendStatus(200); // Acknowledge other events without processing
    }
});

// Endpoint for successful PayPal payment
// Validates cliSessionId and serves success.html
app.get('/paypal/success', (req, res) => {
    const { cliSessionId } = req.query; // Extract from query
    // Basic validation - in a real app, you might want to verify these against a stored state
    if (!cliSessionId) {
        return res.status(400).send("Parametro cliSessionId mancante o non valido.");
    }
    // Serve a success page
    res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

// Endpoint for cancelled PayPal payment
app.get('/paypal/cancel', (req, res) => {
    const { cliSessionId } = req.query; // Extract from query
    // You might want to log this event or handle it in some way
    console.log(`Pagamento annullato per sessione ${cliSessionId}.`);
    // Serve a cancel page or redirect
    res.send("Pagamento annullato.");
});

// Add new endpoint GET /check-purchase/:cliSessionId
app.get('/check-purchase/:cliSessionId', (req, res) => {
    const { cliSessionId } = req.params;
    if (!cliSessionId) {
        return res.status(400).json({ error: "cliSessionId è obbligatorio." });
    }

    db.get(`SELECT patch_id, purchase_token, status FROM purchases WHERE cli_session_id = ?`, [cliSessionId], (err, row) => {
        if (err) {
            console.error("Errore durante la verifica dell'acquisto:", err.message);
            return res.status(500).json({ error: "Errore interno del server." });
        }

        if (!row) {
            return res.status(404).json({ message: "Sessione di acquisto non trovata." });
        }

        if (row.status === 'COMPLETED') {
            res.status(200).json({ patchId: row.patch_id, purchaseToken: row.purchase_token });
        } else if (row.status === 'PENDING' || row.status === 'CREATED') {
            res.status(202).json({ status: row.status, message: "Acquisto in attesa." });
        } else {
            // Handle other statuses if necessary, or treat as pending/error
            res.status(202).json({ status: row.status, message: "Stato acquisto sconosciuto, considerato in attesa." });
        }
    });
});

// Aggiungi questa nuova rotta per gestire il download delle patch
app.post('/get-patch', (req, res) => {
    const { patchId, purchaseToken } = req.body;
    const encryptionKey = process.env.PATCH_ENCRYPTION_KEY;

    if (!patchId || !purchaseToken) {
        return res.status(400).json({ error: "patchId e purchaseToken sono obbligatori." });
    }
    
    if (!encryptionKey) {
        console.error("ERRORE CRITICO: La variabile d'ambiente PATCH_ENCRYPTION_KEY non è definita.");
        return res.status(500).json({ error: "Errore di configurazione del server." });
    }

    // Verifica il token di acquisto nel database
    db.get(`SELECT * FROM purchases WHERE patch_id = ? AND purchase_token = ? AND status = 'COMPLETED'`, 
        [patchId, purchaseToken], 
        (err, row) => {
            if (err) {
                console.error("Errore durante la verifica del token di acquisto:", err.message);
                return res.status(500).json({ error: "Errore interno del server." });
            }

            if (!row) {
                return res.status(401).json({ error: "Token di acquisto non valido o non autorizzato." });
            }

            // Se il token è valido, procedi con la decrittazione e l'invio del file
            // Nota: La convenzione del nome file deve corrispondere a quella usata da 'create-taysell'
            const encryptedFilePath = path.join(__dirname, 'patches', `${patchId}.taylored.enc`);
            
            fs.readFile(encryptedFilePath, 'utf-8', (readErr, encryptedContent) => {
                if (readErr) {
                    console.error(`File patch crittografato non trovato a: ${encryptedFilePath}`, readErr);
                    return res.status(404).json({ error: "File patch non trovato." });
                }

                try {
                    const decryptedContent = decryptAES256GCM(encryptedContent, encryptionKey);
                    res.setHeader('Content-Type', 'text/plain');
                    res.status(200).send(decryptedContent);
                } catch (decryptErr) {
                    console.error("Errore durante la decrittazione della patch:", decryptErr);
                    res.status(500).json({ error: "Impossibile decrittare la patch." });
                }
            });
        });
});

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Backend in a Box è in esecuzione!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
    console.log(`URL base del server: ${SERVER_BASE_URL}`);
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        console.warn("ATTENZIONE: PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET non sono impostati. Le funzionalità PayPal non saranno disponibili.");
    }
});

module.exports = { app, db }; // Export for testing or other modules
// index.js
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const paypal = require('@paypal/checkout-server-sdk');
const axios = require('axios');
const http = require('http'); // Required for Socket.IO
const { Server } = require("socket.io"); // Required for Socket.IO
const path = require('path'); // Required for serving static files

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = './database.db';
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

// Initialize SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("Errore durante la connessione al database SQLite:", err.message);
        return;
    }
    console.log("Connesso al database SQLite.");
    // Create purchases table if it doesn't exist
    // Added cli_session_id and cli_local_port
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        patch_id TEXT NOT NULL,
        purchase_token TEXT UNIQUE,
        paypal_order_id TEXT UNIQUE,
        status TEXT NOT NULL,
        cli_session_id TEXT UNIQUE,
        cli_local_port INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("Errore durante la creazione della tabella 'purchases':", err.message);
        } else {
            console.log("Tabella 'purchases' pronta.");
        }
    });
});

// Create HTTP server and initialize Socket.IO
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // Allow all origins for simplicity, adjust for production
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    console.log(`Socket.IO client connected: ${socket.id}`);

    socket.on('joinSession', (sessionId) => {
        socket.join(sessionId); // CLI client joins a room based on its unique session ID
        console.log(`Socket ${socket.id} joined session room ${sessionId}`);
    });

    socket.on('disconnect', () => {
        console.log(`Socket.IO client disconnected: ${socket.id}`);
    });
});

// Endpoint to create a PayPal order and initiate a purchase
// Validates cliSessionId and cliLocalPort from query params
app.post('/pay/:patchId', async (req, res) => {
    const { patchId } = req.params;
    const { cliSessionId, cliLocalPort } = req.query; // Extract from query

    if (!patchId) {
        return res.status(400).json({ error: "patchId è obbligatorio." });
    }
    if (!cliSessionId || !cliLocalPort) {
        return res.status(400).json({ error: "cliSessionId e cliLocalPort sono obbligatori." });
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
            return_url: `${SERVER_BASE_URL}/paypal/success?cliSessionId=${cliSessionId}&cliLocalPort=${cliLocalPort}`,
            cancel_url: `${SERVER_BASE_URL}/paypal/cancel?cliSessionId=${cliSessionId}&cliLocalPort=${cliLocalPort}`,
            user_action: 'PAY_NOW',
        }
    });

    try {
        const order = await client.execute(request);
        // Store cliSessionId and cliLocalPort along with other purchase details
        db.run(`INSERT INTO purchases (id, patch_id, paypal_order_id, status, cli_session_id, cli_local_port) VALUES (?, ?, ?, ?, ?, ?)`,
            [purchaseId, patchId, order.result.id, 'CREATED', cliSessionId, cliLocalPort], // Added cliSessionId, cliLocalPort
            function(err) {
                if (err) {
                    console.error("Errore durante l'inserimento dell'acquisto nel database:", err.message);
                    return res.status(500).json({ error: "Errore interno del server." });
                }
                console.log(`Nuovo acquisto inserito con ID: ${purchaseId}, PayPal Order ID: ${order.result.id}`);
                res.status(201).json({ orderID: order.result.id, approveUrl: order.result.links.find(link => link.rel === 'approve').href });
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

                // Retrieve cli_session_id and cli_local_port to emit event
                // Ensure correct variable names are used for patch_id, id from DB
                db.get(`SELECT patch_id, id, cli_session_id, cli_local_port FROM purchases WHERE paypal_order_id = ?`,
                    [orderID],
                    (err, row) => {
                        if (err) {
                            console.error("Errore durante il recupero di cli_session_id e cli_local_port:", err.message);
                            // Decide how to handle this: event won't be sent, but payment is processed
                            return;
                        }
                        if (row && row.cli_session_id) {
                            // Emit event to the specific CLI client's room
                            io.to(row.cli_session_id).emit('purchase_completed', {
                                patchId: row.patch_id, // Use patch_id from DB
                                purchaseToken: purchaseToken,
                                // purchaseId: row.id // Use id from DB as purchaseId if needed by client
                            });
                            console.log(`Evento 'purchase_completed' emesso per sessione ${row.cli_session_id}. Patch ID: ${row.patch_id}, Token: ${purchaseToken}`);
                        } else {
                            console.log(`Nessun cli_session_id trovato per l'ordine ${orderID}, impossibile emettere evento Socket.IO.`);
                        }
                    });
                res.sendStatus(200); // Acknowledge receipt of webhook
            });
    } else {
        console.log(`Evento webhook ricevuto non gestito: ${webhookEvent.event_type}`);
        res.sendStatus(200); // Acknowledge other events without processing
    }
});

// Endpoint for successful PayPal payment
// Validates cliSessionId and cliLocalPort and serves success.html
app.get('/paypal/success', (req, res) => {
    const { cliSessionId, cliLocalPort } = req.query; // Extract from query
    // Basic validation - in a real app, you might want to verify these against a stored state
    if (!cliSessionId || !cliLocalPort) {
        return res.status(400).send("Parametri cliSessionId e cliLocalPort mancanti o non validi.");
    }
    // Serve a success page
    res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

// Endpoint for cancelled PayPal payment
app.get('/paypal/cancel', (req, res) => {
    const { cliSessionId, cliLocalPort } = req.query; // Extract from query
    // You might want to log this event or handle it in some way
    console.log(`Pagamento annullato per sessione ${cliSessionId} sulla porta ${cliLocalPort}.`);
    // Serve a cancel page or redirect
    res.send("Pagamento annullato.");
});

// Health check endpoint
app.get('/', (req, res) => {
    res.send('Backend in a Box è in esecuzione!');
});

// Start the server with Socket.IO
server.listen(PORT, () => {
    console.log(`Server in ascolto sulla porta ${PORT}`);
    console.log(`URL base del server: ${SERVER_BASE_URL}`);
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        console.warn("ATTENZIONE: PAYPAL_CLIENT_ID o PAYPAL_CLIENT_SECRET non sono impostati. Le funzionalità PayPal non saranno disponibili.");
    }
});

module.exports = { app, server, db, io }; // Export for testing or other modules
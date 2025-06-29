// index.js
const express = require('express');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const path = require('path');
const axios = require('axios'); // Make sure axios is required

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './db/taysell.sqlite';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

// --- Decryption Logic ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 310000;

function decryptAES256GCM(encryptedText, passwordKey) {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted text format. Expected salt:iv:authtag:ciphertext');
    }
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];

    const key = crypto.pbkdf2Sync(passwordKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
// --- End of Embedded Decryption Logic ---

// --- PayPal Configuration ---
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
const webhookId = process.env.PAYPAL_WEBHOOK_ID; // Your webhook ID from PayPal developer dashboard

// const environment = process.env.PAYPAL_ENVIRONMENT === 'production' // Removed
//     ? new paypal.core.LiveEnvironment(clientId, clientSecret) // Removed
//     : new paypal.core.SandboxEnvironment(clientId, clientSecret); // Removed
// const client = new paypal.core.PayPalHttpClient(environment); // Removed
const PAYPAL_API_BASE = process.env.PAYPAL_ENVIRONMENT === 'production'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com';

// --- Helper function to get Access Token ---
async function getPayPalAccessToken() {
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    try {
        const response = await axios.post(`${PAYPAL_API_BASE}/v1/oauth2/token`, 'grant_type=client_credentials', {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${auth}`,
            },
        });
        return response.data.access_token;
    } catch (error) {
        console.error('Error getting PayPal access token:', error.response ? error.response.data : error.message);
        throw new Error('Failed to get PayPal access token');
    }
}


// Middleware to capture raw body
app.use((req, res, next) => {
    // Only for PayPal webhook route, capture raw body for verification
    if (req.originalUrl === '/paypal/webhook') {
        let data = '';
        req.setEncoding('utf8');
        req.on('data', chunk => {
            data += chunk;
        });
        req.on('end', () => {
            req.rawBody = data;
            next();
        });
    } else {
        // For other routes, use standard express.json()
        express.json()(req, res, next);
    }
});


(async () => {
    try {
        const dbDir = path.dirname(DB_PATH);
        await fs.mkdir(dbDir, { recursive: true });
        console.log(`Directory ${dbDir} created for SQLite database.`);
    } catch (error) {
        console.error("Failed to create database directory:", error);
    }
})();

// --- Database setup ---
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error("Error connecting to the SQLite database:", err.message);
        return;
    }
    console.log("Connected to the SQLite database.");
    db.run(`CREATE TABLE IF NOT EXISTS purchases (
        id TEXT PRIMARY KEY,
        patch_id TEXT NOT NULL,
        purchase_token TEXT UNIQUE,
        paypal_order_id TEXT UNIQUE,
        status TEXT NOT NULL,
        cli_session_id TEXT UNIQUE,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        token_used_at DATETIME DEFAULT NULL
    )`, (err) => {
        if (err) {
            console.error("Error creating 'purchases' table:", err.message);
        } else {
            console.log("Table 'purchases' is ready.");
        }
    });
});


// --- /pay/:patchId route ---
app.get('/pay/:patchId', async (req, res) => {
    const { patchId } = req.params;
    const { cliSessionId } = req.query;

    if (!patchId || !cliSessionId) {
        return res.status(400).json({ error: "patchId and cliSessionId are required." });
    }

    const sanitizedPatchId = path.basename(patchId);
    if (sanitizedPatchId !== patchId) {
        return res.status(400).json({ error: "Invalid patchId format." });
    }

    const metadataPath = path.join(__dirname, 'patches', `${sanitizedPatchId}.taysell`);
    let patchMetadata;
    try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8');
        patchMetadata = JSON.parse(metadataContent);
    } catch (error) {
        console.error(`Could not read or parse metadata for patchId ${sanitizedPatchId} at ${metadataPath}:`, error);
        return res.status(404).json({ error: "Patch metadata not found or invalid. Ensure the .taysell file was uploaded correctly." });
    }

    const { price, currency } = patchMetadata.payment || {};
    if (!price || !currency) {
        return res.status(400).json({ error: "Price or currency is missing in the patch metadata file." });
    }

    const purchaseId = crypto.randomBytes(16).toString('hex');
    const orderPayload = {
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: currency,
                value: price,
            },
            description: `Purchase of patch ${sanitizedPatchId}`
        }],
        application_context: {
            return_url: `${SERVER_BASE_URL}/paypal/success?cliSessionId=${cliSessionId}`,
            cancel_url: `${SERVER_BASE_URL}/paypal/cancel?cliSessionId=${cliSessionId}`,
            user_action: 'PAY_NOW',
        }
    };

    try {
        const accessToken = await getPayPalAccessToken();
        const response = await axios.post(`${PAYPAL_API_BASE}/v2/checkout/orders`, orderPayload, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        const order = response.data;

        db.run(`INSERT INTO purchases (id, patch_id, paypal_order_id, status, cli_session_id) VALUES (?, ?, ?, ?, ?)`,
            [purchaseId, sanitizedPatchId, order.id, 'CREATED', cliSessionId],
            function(err) {
                if (err) {
                    console.error("Error inserting purchase into the database:", err.message);
                    return res.status(500).json({ error: "Internal server error." });
                }
                const approveUrl = order.links.find(link => link.rel === 'approve').href;
                res.redirect(approveUrl);
            });
    } catch (error) {
        console.error("Error creating PayPal order:", error.response ? error.response.data : error.message);
        res.status(500).json({ error: "Error creating PayPal order." });
    }
});

// --- CORRECTED /paypal/webhook route ---
app.post('/paypal/webhook', async (req, res) => {
    try {
        const accessToken = await getPayPalAccessToken();
        const verificationResponse = await axios.post(`${PAYPAL_API_BASE}/v1/notifications/verify-webhook-signature`, {
            auth_algo: req.headers['paypal-auth-algo'],
            cert_url: req.headers['paypal-cert-url'],
            transmission_id: req.headers['paypal-transmission-id'],
            transmission_sig: req.headers['paypal-transmission-sig'],
            transmission_time: req.headers['paypal-transmission-time'],
            webhook_id: webhookId,
            webhook_event: JSON.parse(req.rawBody), // The event body needs to be an object
        }, {
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
        });

        if (verificationResponse.data.verification_status !== 'SUCCESS') {
            console.error("Webhook verification failed:", verificationResponse.data);
            return res.status(403).send("Webhook verification failed.");
        }

        const verifiedEvent = JSON.parse(req.rawBody);
        //console.log(`Webhook event verified successfully: ${verifiedEvent.event_type}`);
        
        // --- Event Handling Logic ---
        if (verifiedEvent.event_type === 'CHECKOUT.ORDER.APPROVED') {
            const orderID = verifiedEvent.resource.id;
            const purchaseToken = crypto.randomBytes(16).toString('hex');
            db.run(`UPDATE purchases SET status = 'COMPLETED', purchase_token = ? WHERE paypal_order_id = ? AND status != 'COMPLETED'`,
                [purchaseToken, orderID],
                function(updateErr) {
                    if (updateErr) {
                        console.error(`Error updating purchase status for PayPal order ${orderID}:`, updateErr.message);
                        return res.sendStatus(500);
                    }
                    //if (this.changes > 0) {
                    //    console.log(`Purchase COMPLETED and token generated for PayPal order ${orderID}.`);
                    //}
                    res.sendStatus(200);
                });
        } else {
             console.log(`Unhandled webhook event received: ${verifiedEvent.event_type}`);
             res.sendStatus(200);
        }

    } catch (err) {
        console.error("Error processing PayPal webhook:", err.response ? err.response.data : err.message);
        res.status(500).send('Error processing webhook');
    }
});

// --- Other routes ---
app.get('/paypal/success', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

app.get('/paypal/cancel', (req, res) => {
    res.send("Payment cancelled.");
});

app.get('/check-purchase/:cliSessionId', (req, res) => {
    const { cliSessionId } = req.params;
    db.get(`SELECT patch_id, purchase_token, status FROM purchases WHERE cli_session_id = ?`, [cliSessionId], (err, row) => {
        if (err) {
            console.error("Error checking purchase:", err.message);
            return res.status(500).json({ error: "Internal server error." });
        }
        if (row && row.status === 'COMPLETED') {
            res.status(200).json({ patchId: row.patch_id, purchaseToken: row.purchase_token });
        } else if (row) {
            res.status(202).json({ status: row.status, message: "Purchase pending." });
        } else {
            res.status(404).json({ message: "Purchase session not found." });
        }
    });
});

app.post('/get-patch', async (req, res) => {
    const { patchId, purchaseToken } = req.body;
    const encryptionKey = process.env.PATCH_ENCRYPTION_KEY;

    if (!patchId || !purchaseToken || !encryptionKey) {
        return res.status(400).json({ error: "Missing required parameters or server configuration." });
    }
    
    // Sanitize user input to prevent path traversal attacks.
    const sanitizedPatchId = path.basename(patchId);
    if (sanitizedPatchId !== patchId) {
        return res.status(400).json({ error: "Invalid patchId format." });
    }

    const sql = `
        UPDATE purchases
        SET token_used_at = CURRENT_TIMESTAMP
        WHERE patch_id = ?
          AND purchase_token = ?
          AND status = 'COMPLETED'
          AND token_used_at IS NULL
    `;

    // Use a standard function() callback to access `this.changes`.
    db.run(sql, [sanitizedPatchId, purchaseToken], async function(err) {
        if (err) {
            console.error("Database error during patch retrieval:", err.message);
            return res.status(500).json({ error: "Internal server error." });
        }

        // `this.changes` will be 1 if a row was updated (token was valid and unused), 0 otherwise.
        if (this.changes === 0) {
            return res.status(403).json({ error: "Invalid or already-used purchase token." });
        }

        // If we get here, the token was valid and has been consumed. Proceed to send the patch.
        const encryptedFilePath = path.join(__dirname, 'patches', `${sanitizedPatchId}.taylored.enc`);
        try {
            const encryptedContent = await fs.readFile(encryptedFilePath, 'utf-8');
            const decryptedContent = decryptAES256GCM(encryptedContent, encryptionKey);
            
            res.setHeader('Content-Type', 'text/plain');
            res.status(200).send(decryptedContent);
        } catch (fileError) {
            if (fileError.code === 'ENOENT') {
                return res.status(404).json({ error: "Patch not found." });
            }
            console.error("Error reading or decrypting patch file:", fileError);
            res.status(500).json({ error: "Could not retrieve patch." });
        }
    });
});


app.get('/', (req, res) => {
    res.send('Backend-in-a-Box is running!');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});

module.exports = { app, db };

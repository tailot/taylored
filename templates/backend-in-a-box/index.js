// index.js
const express = require('express');
const fs = require('fs').promises;
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const paypal = require('@paypal/checkout-server-sdk');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = process.env.DB_PATH || './db/taysell.sqlite';
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;

// --- Decryption Logic embedded from taysell-utils ---
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256
const PBKDF2_ITERATIONS = 100000;

/**
 * Decrypts text encrypted with AES-256-GCM.
 * @param {string} encryptedText The encrypted text in format salt:iv:authtag:ciphertext (all hex).
 * @param {string} passwordKey The password to derive the key from.
 * @returns {string} The decrypted plaintext.
 */
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

// Setup PayPal environment
const clientId = process.env.PAYPAL_CLIENT_ID;
const clientSecret = process.env.PAYPAL_CLIENT_SECRET;

if (!clientId || !clientSecret) {
    console.error("CRITICAL ERROR: PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables are not defined.");
    console.error("These variables are required for PayPal integration.");
    console.error("Without them, payment functionalities will not operate correctly.");
}

const environment = new paypal.core.SandboxEnvironment(clientId, clientSecret);
const client = new paypal.core.PayPalHttpClient(environment);

app.use(express.json());
app.use(express.static('public'));

(async () => {
    try {
        const dbDir = path.dirname(DB_PATH);
        await fs.mkdir(dbDir, { recursive: true });
        console.log(`Directory ${dbDir} created for SQLite database.`);
    } catch (error) {
        console.error("Failed to create database directory:", error);
    }
})();

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
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) {
            console.error("Error creating 'purchases' table:", err.message);
        } else {
            console.log("Table 'purchases' is ready.");
        }
    });
});

app.get('/pay/:patchId', async (req, res) => {
    const { patchId } = req.params;
    const { cliSessionId } = req.query;

    if (!patchId) {
        return res.status(400).json({ error: "patchId is required." });
    }
    if (!cliSessionId) {
        return res.status(400).json({ error: "cliSessionId is required." });
    }

    const metadataPath = path.join(__dirname, 'patches', `${patchId}.taysell`);
    let patchMetadata;
    try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8');
        patchMetadata = JSON.parse(metadataContent);
    } catch (error) {
        console.error(`Could not read or parse metadata for patchId ${patchId} at ${metadataPath}:`, error);
        return res.status(404).json({ error: "Patch metadata not found or invalid. Ensure the .taysell file was uploaded correctly." });
    }

    const { price, currency } = patchMetadata.payment || {};
    if (!price || !currency) {
        return res.status(400).json({ error: "Price or currency is missing in the patch metadata file." });
    }

    const purchaseId = crypto.randomBytes(16).toString('hex');
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            amount: {
                currency_code: currency,
                value: price,
            },
            description: `Purchase of patch ${patchId}`
        }],
        application_context: {
            return_url: `${SERVER_BASE_URL}/paypal/success?cliSessionId=${cliSessionId}`,
            cancel_url: `${SERVER_BASE_URL}/paypal/cancel?cliSessionId=${cliSessionId}`,
            user_action: 'PAY_NOW',
        }
    });

    try {
        const order = await client.execute(request);
        db.run(`INSERT INTO purchases (id, patch_id, paypal_order_id, status, cli_session_id) VALUES (?, ?, ?, ?, ?)`,
            [purchaseId, patchId, order.result.id, 'CREATED', cliSessionId],
            function(err) {
                if (err) {
                    console.error("Error inserting purchase into the database:", err.message);
                    return res.status(500).json({ error: "Internal server error." });
                }
                console.log(`New purchase inserted with ID: ${purchaseId}, PayPal Order ID: ${order.result.id}`);
                const approveUrl = order.result.links.find(link => link.rel === 'approve').href;
                res.redirect(approveUrl);
            });
    } catch (error) {
        console.error("Error creating PayPal order:", error);
        res.status(500).json({ error: "Error creating PayPal order." });
    }
});

app.post('/paypal/webhook', async (req, res) => {
    const webhookEvent = req.body;
    if (webhookEvent.event_type === 'CHECKOUT.ORDER.APPROVED' || webhookEvent.event_type === 'CHECKOUT.ORDER.COMPLETED') {
        const orderID = webhookEvent.resource.id;
        const purchaseToken = crypto.randomBytes(16).toString('hex');
        db.run(`UPDATE purchases SET status = 'COMPLETED', purchase_token = ? WHERE paypal_order_id = ?`,
            [purchaseToken, orderID],
            function(err) {
                if (err) {
                    console.error(`Error updating purchase status for PayPal order ${orderID}:`, err.message);
                    return res.sendStatus(500);
                }
                if (this.changes === 0) {
                    console.warn(`No purchase found or updated for PayPal order ${orderID}. The order may not exist or may have already been processed.`);
                    return res.sendStatus(404);
                }
                console.log(`Purchase completed and token generated for PayPal order ${orderID}. Token: ${purchaseToken}`);
                res.sendStatus(200);
            });
    } else {
        console.log(`Unhandled webhook event received: ${webhookEvent.event_type}`);
        res.sendStatus(200);
    }
});

app.get('/paypal/success', (req, res) => {
    const { cliSessionId } = req.query;
    if (!cliSessionId) {
        return res.status(400).send("Missing or invalid cliSessionId parameter.");
    }
    res.sendFile(path.join(__dirname, 'views', 'success.html'));
});

app.get('/paypal/cancel', (req, res) => {
    const { cliSessionId } = req.query;
    console.log(`Payment cancelled for session ${cliSessionId}.`);
    res.send("Payment cancelled.");
});

app.get('/check-purchase/:cliSessionId', (req, res) => {
    const { cliSessionId } = req.params;
    if (!cliSessionId) {
        return res.status(400).json({ error: "cliSessionId is required." });
    }
    db.get(`SELECT patch_id, purchase_token, status FROM purchases WHERE cli_session_id = ?`, [cliSessionId], (err, row) => {
        if (err) {
            console.error("Error checking purchase:", err.message);
            return res.status(500).json({ error: "Internal server error." });
        }
        if (!row) {
            return res.status(404).json({ message: "Purchase session not found." });
        }
        if (row.status === 'COMPLETED') {
            res.status(200).json({ patchId: row.patch_id, purchaseToken: row.purchase_token });
        } else {
            res.status(202).json({ status: row.status, message: "Purchase pending." });
        }
    });
});

app.post('/get-patch', async (req, res) => {
    const { patchId, purchaseToken } = req.body;
    const encryptionKey = process.env.PATCH_ENCRYPTION_KEY;

    if (!patchId || !purchaseToken) {
        return res.status(400).json({ error: "patchId and purchaseToken are required." });
    }
    if (!encryptionKey) {
        console.error("CRITICAL ERROR: PATCH_ENCRYPTION_KEY environment variable is not defined.");
        return res.status(500).json({ error: "Server configuration error." });
    }

    db.get(`SELECT * FROM purchases WHERE patch_id = ? AND purchase_token = ? AND status = 'COMPLETED'`,
        [patchId, purchaseToken],
        async (err, row) => {
            if (err) {
                console.error("Error verifying purchase token:", err.message);
                return res.status(500).json({ error: "Internal server error." });
            }
            if (!row) {
                return res.status(401).json({ error: "Invalid or unauthorized purchase token." });
            }

            const encryptedFilePath = path.join(__dirname, 'patches', `${patchId}.taylored.enc`);
            try {
                const encryptedContent = await fs.readFile(encryptedFilePath, 'utf-8');
                const decryptedContent = decryptAES256GCM(encryptedContent, encryptionKey);
                res.setHeader('Content-Type', 'text/plain');
                res.status(200).send(decryptedContent);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.error(`Encrypted patch file not found at: ${encryptedFilePath}`, error);
                    res.status(404).json({ error: "Patch file not found." });
                } else {
                    console.error("Error decrypting patch:", error);
                    res.status(500).json({ error: "Could not decrypt patch." });
                }
            }
        });
});

app.get('/', (req, res) => {
    res.send('Backend-in-a-Box is running!');
});

app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Server base URL: ${SERVER_BASE_URL}`);
    if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
        console.warn("WARNING: PAYPAL_CLIENT_ID or PAYPAL_CLIENT_SECRET are not set. PayPal functionality will be unavailable.");
    }
});

module.exports = { app, db };
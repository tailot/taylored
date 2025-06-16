// Taysell Backend-in-a-Box - Basic Placeholder
// Taysell Backend-in-a-Box - Basic Placeholder
const express = require('express');
const path = require('path');
const fs = require('fs').promises; // Using fs.promises for async file operations
const fsSync = require('fs');
const sqlite3 = require('sqlite3').verbose();
const axios = require('axios');
const paypal = require('@paypal/checkout-server-sdk');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Environment Variables ---
// Essential for database, PayPal integration, server URLs, and encryption
const DB_PATH = process.env.DB_PATH || './db/taysell.sqlite';
const PAYPAL_ENVIRONMENT = process.env.PAYPAL_ENVIRONMENT || 'sandbox'; // 'sandbox' or 'live'
const PAYPAL_CLIENT_ID = process.env.PAYPAL_CLIENT_ID;
const PAYPAL_CLIENT_SECRET = process.env.PAYPAL_CLIENT_SECRET;
const SERVER_BASE_URL = process.env.SERVER_BASE_URL || `http://localhost:${PORT}`;
const PATCH_ENCRYPTION_KEY = process.env.PATCH_ENCRYPTION_KEY; // Must be a 32-byte hex string for AES-256
const WEBHOOK_ID = process.env.WEBHOOK_ID || "YOUR_PAYPAL_WEBHOOK_ID_HERE"; // Replace with your actual Webhook ID

// --- PayPal SDK Configuration ---
// Sets up the PayPal environment (sandbox or live) and credentials.
// Exits if critical PayPal credentials are not provided.
if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
    console.error('FATAL ERROR: PayPal Client ID or Secret not configured. Please set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET environment variables.');
    process.exit(1);
}
const environment = PAYPAL_ENVIRONMENT === 'live'
    ? new paypal.core.LiveEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET)
    : new paypal.core.SandboxEnvironment(PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET);
const client = new paypal.core.PayPalHttpClient(environment);

// --- Application Constants ---
const PATCHES_DIR = './patches'; // Directory where patch files are stored

// --- Cryptography Constants for AES-256-GCM ---
// These are standard lengths and parameters for robust encryption
const ALGORITHM = 'aes-256-gcm'; // AES with Galois/Counter Mode
const IV_LENGTH = 12;             // Bytes for Initialization Vector (IV) - GCM standard
const SALT_LENGTH = 16;           // Bytes for salt in key derivation
const TAG_LENGTH = 16;            // Bytes for GCM authentication tag
const KEY_LENGTH = 32;            // Bytes for AES-256 key
const PBKDF2_ITERATIONS = 100000; // Iterations for PBKDF2 key derivation - security best practice

// Middleware for parsing JSON and URL-encoded data.
// The `verify` option in `express.json` is crucial for PayPal webhook validation,
// as it allows us to access the raw request body.
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf.toString();
    }
}));
app.use(express.urlencoded({ extended: true })); // For parsing application/x-www-form-urlencoded

// --- Utility Functions ---

/**
 * Decrypts an AES-256-GCM encrypted string.
 * @param {string} encryptedDataHex Hex-encoded string containing salt, IV, auth tag, and ciphertext.
 * @param {string} password The password used for encryption.
 * @returns {Promise<string>} The decrypted plaintext string.
 * @throws {Error} If decryption fails or parameters are invalid.
 */
async function decryptAES256GCM(encryptedDataHex, password) {
    if (!encryptedDataHex || !password) {
        throw new Error("Encrypted data and password are required.");
    }
    if (!PATCH_ENCRYPTION_KEY) {
        console.error("PATCH_ENCRYPTION_KEY is not set. Cannot perform decryption.");
        throw new Error("Server configuration error: Encryption key not set.");
    }

    try {
        const encryptedBuffer = Buffer.from(encryptedDataHex, 'hex');

        const salt = encryptedBuffer.subarray(0, SALT_LENGTH);
        const iv = encryptedBuffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
        const tag = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
        const ciphertext = encryptedBuffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

        const key = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

        const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
        decipher.setAuthTag(tag);

        let decrypted = decipher.update(ciphertext, null, 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error("Decryption failed:", error);
        throw new Error("Decryption failed. The data may be corrupt or the key incorrect.");
    }
}

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fsSync.existsSync(dbDir)) {
    fsSync.mkdirSync(dbDir, { recursive: true });
}

// Connect to SQLite database
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('Error opening database', err.message);
    } else {
        console.log('Connected to the SQLite database.');
        // Create purchases table if it doesn't exist
        db.serialize(() => {
            db.run(`CREATE TABLE IF NOT EXISTS purchases (
                id TEXT PRIMARY KEY,
                patch_id TEXT NOT NULL,
                purchase_token TEXT UNIQUE NOT NULL,
                paypal_order_id TEXT UNIQUE,
                status TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`);
            console.log('Database schema checked/created.');
        });
    }
});

// --- API Endpoints ---

// Endpoint to initiate payment for a patch
app.get('/pay/:patchId', async (req, res) => {
    const { patchId } = req.params;
    const purchaseId = crypto.randomBytes(16).toString('hex'); // Unique ID for this purchase attempt

    // TODO: In a real scenario, you might want to fetch patch details (like price) from a database or config
    // For now, we assume a fixed price or that price is handled entirely by PayPal setup.
    // We also assume patchId is validated to exist.

    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
        intent: 'CAPTURE',
        purchase_units: [{
            reference_id: `${patchId}|${purchaseId}`, // Store patchId and our purchaseId
            amount: {
                currency_code: 'USD', // Or your desired currency
                value: '1.00'         // Example price, adjust as needed
            },
            description: `Patch ${patchId}`
        }],
        application_context: {
            return_url: `${SERVER_BASE_URL}/paypal/success`,
            cancel_url: `${SERVER_BASE_URL}/paypal/cancel`,
            brand_name: 'Taysell',
            shipping_preference: 'NO_SHIPPING',
            user_action: 'PAY_NOW'
        }
    });

    try {
        const order = await client.execute(request);
        // Save initial purchase attempt to DB
        db.run(
            `INSERT INTO purchases (id, patch_id, paypal_order_id, status) VALUES (?, ?, ?, ?)`,
            [purchaseId, patchId, order.result.id, 'CREATED'],
            (err) => {
                if (err) {
                    console.error("Error saving initial purchase to DB:", err.message);
                    return res.status(500).send("Error initiating payment.");
                }
                // Redirect user to PayPal approval link
                const approvalLink = order.result.links.find(link => link.rel === 'approve');
                if (approvalLink) {
                    res.redirect(approvalLink.href);
                } else {
                    res.status(500).send("Could not retrieve PayPal approval link.");
                }
            }
        );
    } catch (err) {
        console.error("PayPal Order Creation Error:", err.message || err);
        res.status(500).send("Error creating PayPal order.");
    }
});

// PayPal Webhook Handler
app.post('/paypal/webhook', async (req, res) => {
    if (!WEBHOOK_ID) {
        console.error("FATAL: PayPal Webhook ID is not configured.");
        return res.status(500).send("Webhook configuration error.");
    }
    if (!req.rawBody) {
        console.error("Webhook Error: Raw body not available. Ensure express.json middleware with verify is used correctly.");
        return res.status(400).send("Webhook error: Missing raw body.");
    }

    const request = new paypal.webhooks.WebhooksVerifySignatureRequest(
        req.headers['paypal-transmission-id'],
        req.headers['paypal-transmission-time'],
        WEBHOOK_ID, // Your webhook ID from PayPal developer portal
        req.rawBody,
        req.headers['paypal-transmission-sig'],
        req.headers['paypal-auth-algo']
    );

    try {
        const verification = await client.execute(request);
        if (verification.result.verification_status === 'SUCCESS') {
            const event = req.body;
            if (event.event_type === 'CHECKOUT.ORDER.APPROVED' || event.event_type === 'CHECKOUT.ORDER.COMPLETED') {
                const orderId = event.resource.id;
                const purchaseUnit = event.resource.purchase_units[0];
                const [patchId, purchaseId] = purchaseUnit.reference_id.split('|');

                // Generate a unique, secure purchase token
                const purchaseToken = crypto.randomBytes(32).toString('hex');

                // Update database record with purchase token and status
                db.run(
                    `UPDATE purchases SET status = 'COMPLETED', purchase_token = ? WHERE paypal_order_id = ? AND patch_id = ? AND id = ?`,
                    [purchaseToken, orderId, patchId, purchaseId],
                    function(err) {
                        if (err) {
                            console.error("DB Error updating purchase for webhook:", err.message);
                            // Don't send 500 to PayPal, as it might retry. Log error and send 200.
                            return res.status(200).send("DB Error processing event.");
                        }
                        if (this.changes === 0) {
                            console.warn(`Webhook: No matching purchase found for orderId ${orderId}, patchId ${patchId}, purchaseId ${purchaseId}. May be a duplicate event or manual payment.`);
                        } else {
                            console.log(`Purchase ${purchaseId} for patch ${patchId} (Order ID: ${orderId}) completed. Token: ${purchaseToken}`);
                        }
                        res.sendStatus(200); // Important to send 200 to PayPal
                    }
                );
            } else {
                console.log(`Received non-actionable PayPal event: ${event.event_type}`);
                res.sendStatus(200);
            }
        } else {
            console.warn('PayPal Webhook verification failed:', verification.result);
            res.sendStatus(403); // Forbidden
        }
    } catch (err) {
        console.error('Error processing PayPal webhook:', err.message || err);
        res.sendStatus(500);
    }
});

// PayPal Success Redirect
app.get('/paypal/success', (req, res) => {
    // User is redirected here after successful payment approval on PayPal's side.
    // The actual fulfillment should be triggered by the webhook.
    // This page can inform the user that the payment is being processed.
    // You might want to include `token` (PayPal's order ID) and `PayerID` from query params for logging.
    console.log('PayPal success redirect:', req.query);
    res.send('Payment approved! Please wait for processing. You will receive your patch details shortly if the transaction completes successfully.');
});

// PayPal Cancel Redirect
app.get('/paypal/cancel', (req, res) => {
    // User is redirected here if they cancel the payment on PayPal's side.
    console.log('PayPal cancel redirect:', req.query);
    res.send('Payment cancelled. If this was a mistake, please try again.');
});

// Endpoint to retrieve a patch using a valid purchase token
app.post('/get-patch', async (req, res) => {
    const { patchId, purchaseToken } = req.body;

    if (!patchId || !purchaseToken) {
        return res.status(400).json({ error: 'Patch ID and purchase token are required.' });
    }
    if (!PATCH_ENCRYPTION_KEY) {
        console.error("FATAL ERROR: PATCH_ENCRYPTION_KEY is not set. Cannot deliver patches.");
        return res.status(500).json({ error: 'Server configuration error preventing patch delivery.' });
    }

    db.get(
        `SELECT * FROM purchases WHERE patch_id = ? AND purchase_token = ? AND status = 'COMPLETED'`,
        [patchId, purchaseToken],
        async (err, row) => {
            if (err) {
                console.error("DB Error retrieving purchase for get-patch:", err.message);
                return res.status(500).json({ error: 'Error validating purchase.' });
            }
            if (!row) {
                return res.status(403).json({ error: 'Invalid patch ID or purchase token, or purchase not completed.' });
            }

            // Valid token, proceed to deliver patch
            const patchFilePath = path.join(PATCHES_DIR, `${patchId}.patch.enc`);
            try {
                const encryptedPatchDataHex = await fs.readFile(patchFilePath, 'utf8');
                const decryptedPatch = await decryptAES256GCM(encryptedPatchDataHex, PATCH_ENCRYPTION_KEY);
                res.type('text/plain').send(decryptedPatch);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    console.error(`Patch file not found for patchId: ${patchId} at ${patchFilePath}`);
                    return res.status(404).json({ error: 'Patch file not found.' });
                }
                console.error(`Error delivering patch ${patchId}:`, error.message);
                return res.status(500).json({ error: 'Error retrieving or decrypting patch.' });
            }
        }
    );
});


// --- Server Initialization ---
app.listen(PORT, () => {
    console.log(`Taysell backend listening on port ${PORT}`);
    console.log(`Database path: ${DB_PATH}`);
    console.log(`Patches directory: ${PATCHES_DIR}`);
    console.log(`Server Base URL: ${SERVER_BASE_URL}`);
    console.log(`PayPal Environment: ${PAYPAL_ENVIRONMENT}`);
    if (!PAYPAL_CLIENT_ID || !PAYPAL_CLIENT_SECRET) {
        console.warn("Warning: PayPal Client ID or Secret is not set. Payment processing will fail.");
    }
    if (!PATCH_ENCRYPTION_KEY) {
        console.warn("Warning: PATCH_ENCRYPTION_KEY is not set. Patch delivery will fail.");
    }
     if (WEBHOOK_ID === "YOUR_PAYPAL_WEBHOOK_ID_HERE") {
        console.warn("Warning: PayPal WEBHOOK_ID is set to placeholder. Webhook verification will fail.");
    }
});
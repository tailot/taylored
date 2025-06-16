// Taysell Backend-in-a-Box - Basic Placeholder
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 80; // Docker exposes 80, host maps to it
const DB_PATH = process.env.DB_PATH || './db/taysell.sqlite';

app.use(express.json());

// Ensure db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

// Placeholder for GET /pay/:patchId (redirects to PayPal)
app.get('/pay/:patchId', (req, res) => {
    const { patchId } = req.params;
    // In a real scenario, you'd generate a PayPal payment link here
    // using details from .env and patchId.
    // For now, just a placeholder response.
    res.send(`Payment initiation for patch ${patchId} (Connect to PayPal - ${process.env.PAYPAL_ENVIRONMENT} mode)`);
});

// Placeholder for POST /paypal/webhook (handles PayPal notifications)
app.post('/paypal/webhook', (req, res) => {
    // In a real scenario, verify webhook, save purchase token to SQLite
    console.log('PayPal webhook received:', req.body);
    const purchaseToken = 'dummy-purchase-token-' + Date.now();
    res.send(`Webhook processed. Your purchase token: ${purchaseToken}`);
});

// Placeholder for POST /get-patch (delivers the patch)
app.post('/get-patch', (req, res) => {
    const { patchId, purchaseToken } = req.body;
    // In a real scenario, validate token, decrypt and send patch
    if (purchaseToken && purchaseToken.startsWith('dummy-purchase-token')) {
        res.type('text/plain').send(`Decrypted content of patch ${patchId}`);
    } else {
        res.status(401).json({ error: 'Invalid or missing purchase token' });
    }
});

app.listen(PORT, () => {
    console.log(`Taysell backend listening on port ${PORT}`);
    console.log(`Database path: ${DB_PATH}`);
    console.log(`PayPal environment: ${process.env.PAYPAL_ENVIRONMENT}`);
});

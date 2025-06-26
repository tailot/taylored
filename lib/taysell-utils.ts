// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// lib/taysell-utils.ts
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // AES-256-GCM uses a 12-byte IV typically, but Node's crypto.randomBytes(16) is a common default if not specified for createCipheriv. Let's stick to 12 for GCM best practice.
const SALT_LENGTH = 16;
const TAG_LENGTH = 16; // GCM standard authentication tag length
const KEY_LENGTH = 32; // For AES-256
const PBKDF2_ITERATIONS = 310000; // OWASP recommended minimum for PBKDF2-HMAC-SHA512

/**
 * Encrypts a given plaintext string using AES-256-GCM.
 *
 * A unique salt and Initialization Vector (IV) are generated for each encryption operation.
 * The encryption key is derived from the provided `passwordKey` and the generated salt
 * using PBKDF2 with SHA512.
 *
 * The output is a colon-separated string containing the hex-encoded salt, IV,
 * authentication tag, and ciphertext, in that order: `salt:iv:authtag:ciphertext`.
 *
 * @param {string} text - The plaintext string to encrypt.
 * @param {string} passwordKey - The password from which the encryption key will be derived.
 * @returns {string} A string representing the encrypted data, formatted as
 *                   `salt:iv:authtag:ciphertext` (all parts hex-encoded).
 */
export function encryptAES256GCM(text: string, passwordKey: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    // For GCM, a 12-byte IV is standard and recommended for uniqueness.
    // Node's createCipheriv for 'aes-256-gcm' will internally use a 12-byte IV if a 16-byte one is passed,
    // or one can explicitly generate a 12-byte IV. Let's use 12 bytes directly.
    const iv = crypto.randomBytes(12);

    const key = crypto.pbkdf2Sync(passwordKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag(); // Should be 16 bytes for GCM

    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts a string previously encrypted with `encryptAES256GCM`.
 *
 * The function expects the `encryptedText` to be in the format
 * `salt:iv:authtag:ciphertext` (all parts hex-encoded). It uses the salt and IV
 * from the input, along with the provided `passwordKey`, to derive the decryption key
 * via PBKDF2. The authentication tag is used to verify the integrity and authenticity
 * of the ciphertext before decryption.
 *
 * @param {string} encryptedText - The encrypted text string, formatted as
 *                                 `salt:iv:authtag:ciphertext` (hex-encoded).
 * @param {string} passwordKey - The password used for the original encryption.
 * @returns {string} The decrypted plaintext string.
 * @throws {Error} If the encrypted text format is invalid, or if decryption fails
 *                 (e.g., due to an incorrect password, tampered data, or corrupted ciphertext).
 */
export function decryptAES256GCM(encryptedText: string, passwordKey: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted text format. Expected salt:iv:authtag:ciphertext (hex encoded).');
    }
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];

    if (iv.length !== 12) {
        // GCM standard IV length is 12 bytes.
        // While createCipheriv might be lenient, it's good practice to validate.
        // However, if the encryption side used 16, this check might need adjustment
        // or the encryption side fixed. Assuming 12 based on GCM best practice.
        console.warn(`Warning: IV length is ${iv.length} bytes, GCM typically uses 12 bytes. Decryption will proceed.`);
    }
    if (tag.length !== TAG_LENGTH) {
        throw new Error(`Invalid authTag length. Expected ${TAG_LENGTH} bytes, got ${tag.length}.`);
    }


    const key = crypto.pbkdf2Sync(passwordKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag); // Important: Set the auth tag before updating/finalizing

    try {
        let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
        decrypted += decipher.final('utf8'); // This will throw if authentication fails
        return decrypted;
    } catch (error: any) {
        // More specific error handling can be added here if needed
        throw new Error(`Decryption failed: ${error.message}. This could be due to an incorrect password, tampered data, or other issues.`);
    }
}

// TODO: Add other Taysell related utility functions here later (e.g., .taysell file validation enhancements)

/**
 * Defines the structure for seller information within a `.taysell` file.
 */
export interface SellerInfo {
    /** The name of the seller or organization. */
    name: string;
    /** The official website of the seller. Should be a valid URL. */
    website: string;
    /** Contact information for the seller, typically an email address. */
    contact: string;
}

/**
 * Defines the structure for patch metadata within a `.taysell` file.
 */
export interface PatchMetadata {
    /** The user-friendly name of the patch. */
    name:string;
    /** A brief description of what the patch does. */
    description: string;
    /** The version of the Taylored CLI tool that this patch is compatible with or was created by. (e.g., "1.2.0") */
    tayloredVersion: string;
}

/**
 * Defines the structure for API endpoint URLs used in the Taysell process.
 */
export interface Endpoints {
    /** The URL to initiate the payment process for acquiring the patch. Must be HTTPS. */
    initiatePaymentUrl: string;
    /** The URL from which the encrypted patch file can be downloaded after successful payment. Must be HTTPS. */
    getPatchUrl: string;
}

/**
 * Defines the structure for payment information within a `.taysell` file.
 */
export interface PaymentInfo {
    /** The price of the patch, represented as a string (e.g., "9.99"). */
    price: string;
    /** The 3-letter ISO currency code for the price (e.g., "USD", "EUR"). */
    currency: string;
}

/**
 * Represents the complete structure of a parsed `.taysell` file.
 * This interface defines all the expected top-level and nested properties.
 */
export interface TaysellFile {
    /** The version of the Taysell file format (e.g., "1.0-decentralized"). */
    taysellVersion: string;
    /** A unique identifier for this patch, typically a UUID. */
    patchId: string;
    /** Information about the seller of the patch. */
    sellerInfo: SellerInfo;
    /** Metadata describing the patch. */
    metadata: PatchMetadata;
    /** API endpoints required for the purchase and download process. */
    endpoints: Endpoints;
    /** Payment details for the patch. */
    payment: PaymentInfo;
}

/**
 * Validates the structure and essential content of a parsed `.taysell` file object.
 *
 * This function checks for the presence of required fields, correct data types for some fields,
 * and basic format validation for URLs and currency codes. It ensures that the `.taysell`
 * file adheres to the expected schema.
 *
 * @param {any} data - The parsed JSON object from a `.taysell` file.
 * @returns {TaysellFile} The validated `TaysellFile` data, cast to the interface.
 * @throws {Error} If validation fails at any point (e.g., missing fields, incorrect types,
 *                 invalid URL formats, or unsupported `taysellVersion`). The error message
 *                 will indicate the specific validation failure.
 */
export function validateTaysellFileContent(data: any): TaysellFile {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid .taysell file: content is not an object or is null.');
    }

    const requiredFields: Array<keyof TaysellFile> = ['taysellVersion', 'patchId', 'sellerInfo', 'metadata', 'endpoints', 'payment'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new Error(`Invalid .taysell file: missing required field "${field}".`);
        }
    }

    if (typeof data.taysellVersion !== 'string' || data.taysellVersion !== '1.0-decentralized') {
        throw new Error(`Invalid .taysell file: unsupported taysellVersion "${data.taysellVersion}". Expected "1.0-decentralized".`);
    }
    if (typeof data.patchId !== 'string' || !data.patchId.trim()) {
        throw new Error('Invalid .taysell file: patchId must be a non-empty string.');
    }

    // SellerInfo validation
    if (typeof data.sellerInfo !== 'object' || !data.sellerInfo.name || typeof data.sellerInfo.name !== 'string') {
        throw new Error('Invalid .taysell file: sellerInfo.name is missing or not a string.');
    }
    // Add more checks for sellerInfo.website (URL format), sellerInfo.contact (email format) if desired

    // Metadata validation
    if (typeof data.metadata !== 'object' || !data.metadata.name || typeof data.metadata.name !== 'string') {
        throw new Error('Invalid .taysell file: metadata.name is missing or not a string.');
    }
    // Add more checks for metadata.description, metadata.tayloredVersion (semver format)

    // Endpoints validation
    if (typeof data.endpoints !== 'object' ||
        !data.endpoints.initiatePaymentUrl || typeof data.endpoints.initiatePaymentUrl !== 'string' ||
        !data.endpoints.getPatchUrl || typeof data.endpoints.getPatchUrl !== 'string') {
        throw new Error('Invalid .taysell file: endpoints.initiatePaymentUrl and endpoints.getPatchUrl must be non-empty strings.');
    }
    try {
        new URL(data.endpoints.initiatePaymentUrl); // Validate URL format
        const getPatchUrlObj = new URL(data.endpoints.getPatchUrl); // Validate URL format
        if (getPatchUrlObj.protocol !== 'https:') {
             throw new Error('Invalid .taysell file: endpoints.getPatchUrl must use HTTPS.');
        }
    } catch (e: any) {
        throw new Error(`Invalid .taysell file: one of the endpoint URLs is invalid. ${e.message}`);
    }


    // Payment validation
    if (typeof data.payment !== 'object' ||
        !data.payment.price || typeof data.payment.price !== 'string' || // Assuming price as string e.g. "9.99"
        !data.payment.currency || typeof data.payment.currency !== 'string' || data.payment.currency.length !== 3) {
        throw new Error('Invalid .taysell file: payment.price must be a string and payment.currency must be a 3-letter string.');
    }

    return data as TaysellFile; // If all checks pass, cast and return
}

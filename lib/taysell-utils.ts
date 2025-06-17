// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// lib/taysell-utils.ts
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // For GCM, 12 is recommended, but 16 is also common. Node uses 16 by default for IV generation if not specified.
const SALT_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // AES-256
const PBKDF2_ITERATIONS = 100000; // OWASP recommended minimum

/**
 * Encrypts text using AES-256-GCM.
 * A random salt and IV are generated for each encryption.
 * The salt, IV, and auth tag are prepended to the ciphertext.
 * Key is derived from the password using PBKDF2.
 * @param text The plaintext to encrypt.
 * @param passwordKey The password to derive the key from.
 * @returns A string in the format: salt:iv:authtag:ciphertext (all hex encoded).
 */
export function encryptAES256GCM(text: string, passwordKey: string): string {
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(passwordKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const tag = cipher.getAuthTag();

    return `${salt.toString('hex')}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypts text encrypted with AES-256-GCM.
 * Assumes salt, IV, and auth tag are prepended to the ciphertext.
 * @param encryptedText The encrypted text in format salt:iv:authtag:ciphertext (all hex).
 * @param passwordKey The password to derive the key from.
 * @returns The decrypted plaintext.
 * @throws Error if decryption fails (e.g., wrong key, tampered data).
 */
export function decryptAES256GCM(encryptedText: string, passwordKey: string): string {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) {
        throw new Error('Invalid encrypted text format. Expected salt:iv:authtag:ciphertext');
    }
    const salt = Buffer.from(parts[0], 'hex');
    const iv = Buffer.from(parts[1], 'hex');
    const tag = Buffer.from(parts[2], 'hex');
    const ciphertext = parts[3];

    // Derive key using PBKDF2
    const key = crypto.pbkdf2Sync(passwordKey, salt, PBKDF2_ITERATIONS, KEY_LENGTH, 'sha512');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}

// Add other Taysell related utility functions here later (e.g., .taysell file validation)

// Define interfaces for .taysell file structure (can be shared or defined here)
export interface SellerInfo {
    name: string;
    website: string;
    contact: string;
}

export interface PatchMetadata {
    name: string;
    description: string;
    tayloredVersion: string;
}

export interface Endpoints {
    initiatePaymentUrl: string;
    getPatchUrl: string;
}

export interface PaymentInfo {
    price: string;
    currency: string;
}

export interface TaysellFile {
    taysellVersion: string;
    patchId: string;
    sellerInfo: SellerInfo;
    metadata: PatchMetadata;
    endpoints: Endpoints;
    payment: PaymentInfo;
}

/**
 * Validates the structure and content of a parsed .taysell file object.
 * @param data The parsed JSON object from a .taysell file.
 * @returns The validated TaysellFile data.
 * @throws Error if validation fails.
 */
export function validateTaysellFileContent(data: any): TaysellFile {
    if (!data || typeof data !== 'object') {
        throw new Error('Invalid .taysell file: content is not an object.');
    }

    const requiredFields = ['taysellVersion', 'patchId', 'sellerInfo', 'metadata', 'endpoints', 'payment'];
    for (const field of requiredFields) {
        if (!data[field]) {
            throw new Error(`Invalid .taysell file: missing required field "${field}".`);
        }
    }

    if (typeof data.taysellVersion !== 'string' || data.taysellVersion !== '1.0-decentralized') {
        throw new Error(
            `Invalid .taysell file: unsupported taysellVersion "${data.taysellVersion}". Expected "1.0-decentralized".`
        );
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
    if (
        typeof data.endpoints !== 'object' ||
        !data.endpoints.initiatePaymentUrl ||
        typeof data.endpoints.initiatePaymentUrl !== 'string' ||
        !data.endpoints.getPatchUrl ||
        typeof data.endpoints.getPatchUrl !== 'string'
    ) {
        throw new Error(
            'Invalid .taysell file: endpoints.initiatePaymentUrl and endpoints.getPatchUrl must be non-empty strings.'
        );
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
    if (
        typeof data.payment !== 'object' ||
        !data.payment.price ||
        typeof data.payment.price !== 'string' || // Assuming price as string e.g. "9.99"
        !data.payment.currency ||
        typeof data.payment.currency !== 'string' ||
        data.payment.currency.length !== 3
    ) {
        throw new Error(
            'Invalid .taysell file: payment.price must be a string and payment.currency must be a 3-letter string.'
        );
    }

    return data as TaysellFile; // If all checks pass, cast and return
}

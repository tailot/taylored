// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// tests/unit/taysell-utils.test.ts
import {
    encryptAES256GCM,
    decryptAES256GCM,
    validateTaysellFileContent,
    TaysellFile, // Import the interface for test data
} from '../../lib/taysell-utils'; // Adjust path as needed

describe('AES Encryption/Decryption', () => {
    const testPassword = 'strongTestPassword123!';
    const plainText = 'This is a secret message for Taysell.';

    it('should encrypt and decrypt a string successfully', () => {
        const encrypted = encryptAES256GCM(plainText, testPassword);
        expect(encrypted).not.toEqual(plainText);
        const decrypted = decryptAES256GCM(encrypted, testPassword);
        expect(decrypted).toEqual(plainText);
    });

    it('should fail decryption with a wrong password', () => {
        const encrypted = encryptAES256GCM(plainText, testPassword);
        expect(() => decryptAES256GCM(encrypted, 'wrongPassword')).toThrow();
    });

    it('should fail decryption if ciphertext is tampered', () => {
        let encrypted = encryptAES256GCM(plainText, testPassword);
        // Tamper: change a character in the ciphertext part
        const parts = encrypted.split(':');
        parts[3] = parts[3].slice(0, -1) + (parts[3].endsWith('a') ? 'b' : 'a');
        encrypted = parts.join(':');
        expect(() => decryptAES256GCM(encrypted, testPassword)).toThrow(); // Typically "Unsupported state or unable to authenticate data"
    });

    it('should fail decryption if auth tag is tampered', () => {
        let encrypted = encryptAES256GCM(plainText, testPassword);
        const parts = encrypted.split(':');
        parts[2] = parts[2].slice(0, -1) + (parts[2].endsWith('a') ? 'b' : 'a'); // Tamper auth tag
        encrypted = parts.join(':');
        expect(() => decryptAES256GCM(encrypted, testPassword)).toThrow();
    });

    it('should fail decryption if IV is tampered', () => {
        let encrypted = encryptAES256GCM(plainText, testPassword);
        const parts = encrypted.split(':');
        parts[1] = parts[1].slice(0, -1) + (parts[1].endsWith('a') ? 'b' : 'a'); // Tamper IV
        encrypted = parts.join(':');
        expect(() => decryptAES256GCM(encrypted, testPassword)).toThrow();
    });
});

describe('validateTaysellFileContent', () => {
    const validTaysellData: TaysellFile = {
        taysellVersion: '1.0-decentralized',
        patchId: 'test-patch-123',
        sellerInfo: { name: 'Test Seller', website: 'https://example.com', contact: 'seller@example.com' },
        metadata: { name: 'Test Patch', description: 'A great patch', tayloredVersion: '>=1.0.0' },
        endpoints: {
            initiatePaymentUrl: 'https://example.com/pay/test-patch-123',
            getPatchUrl: 'https://example.com/api/get-patch',
        },
        payment: { price: '9.99', currency: 'USD' },
    };

    it('should validate correct .taysell data successfully', () => {
        expect(() => validateTaysellFileContent(validTaysellData)).not.toThrow();
        const validatedData = validateTaysellFileContent(validTaysellData);
        expect(validatedData).toEqual(validTaysellData);
    });

    it('should throw if data is not an object', () => {
        expect(() => validateTaysellFileContent('not-an-object')).toThrow(
            'Invalid .taysell file: content is not an object.'
        );
    });

    const requiredFields = ['taysellVersion', 'patchId', 'sellerInfo', 'metadata', 'endpoints', 'payment'];
    requiredFields.forEach((field) => {
        it(`should throw if required field "${field}" is missing`, () => {
            const data = { ...validTaysellData };
            delete (data as any)[field];
            expect(() => validateTaysellFileContent(data)).toThrow(
                `Invalid .taysell file: missing required field "${field}".`
            );
        });
    });

    it('should throw for incorrect taysellVersion', () => {
        const data = { ...validTaysellData, taysellVersion: '0.9-beta' };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: unsupported taysellVersion "0.9-beta". Expected "1.0-decentralized".'
        );
    });

    it('should throw for empty patchId', () => {
        const data = { ...validTaysellData, patchId: ' ' };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: patchId must be a non-empty string.'
        );
    });

    it('should throw if sellerInfo.name is missing', () => {
        const data = { ...validTaysellData, sellerInfo: { ...validTaysellData.sellerInfo, name: undefined as any } };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: sellerInfo.name is missing or not a string.'
        );
    });

    it('should throw if metadata.name is missing', () => {
        const data = { ...validTaysellData, metadata: { ...validTaysellData.metadata, name: undefined as any } };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: metadata.name is missing or not a string.'
        );
    });

    it('should throw if endpoints.getPatchUrl is not HTTPS', () => {
        const data = {
            ...validTaysellData,
            endpoints: { ...validTaysellData.endpoints, getPatchUrl: 'http://example.com/api/get-patch' },
        };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: endpoints.getPatchUrl must use HTTPS.'
        );
    });

    it('should throw if endpoints.initiatePaymentUrl is an invalid URL', () => {
        const data = {
            ...validTaysellData,
            endpoints: { ...validTaysellData.endpoints, initiatePaymentUrl: 'not-a-url' },
        };
        expect(() => validateTaysellFileContent(data)).toThrow(/one of the endpoint URLs is invalid/);
    });

    it('should throw if endpoints.getPatchUrl is an invalid URL', () => {
        const data = { ...validTaysellData, endpoints: { ...validTaysellData.endpoints, getPatchUrl: 'not-a-url' } };
        expect(() => validateTaysellFileContent(data)).toThrow(/one of the endpoint URLs is invalid/);
    });

    it('should throw for invalid payment.currency format', () => {
        const data = { ...validTaysellData, payment: { ...validTaysellData.payment, currency: 'USDOLLARS' } };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: payment.price must be a string and payment.currency must be a 3-letter string.'
        );
    });

    it('should throw if payment.price is missing', () => {
        const data = { ...validTaysellData, payment: { ...validTaysellData.payment, price: undefined as any } };
        expect(() => validateTaysellFileContent(data)).toThrow(
            'Invalid .taysell file: payment.price must be a string and payment.currency must be a 3-letter string.'
        );
    });
});

import * as fs from 'fs';
import * as path from 'path';
import {
    initializeTestEnvironment,
    cleanupTestEnvironment,
    normalizeLineEndings,
    TEST_DIR_FULL_PATH,
    PLUGIN_DELETIONS_FULL_PATH,
    INITIAL_FILE1_CONTENT
} from './setup';

describe('Initial Setup Verification', () => {
    beforeAll(async () => {
        await initializeTestEnvironment();
    });

    afterAll(async () => {
        await cleanupTestEnvironment();
    });

    test('initial setup correctly created files and patch', () => {
        expect(normalizeLineEndings(fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'))).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
        expect(fs.existsSync(PLUGIN_DELETIONS_FULL_PATH)).toBe(true);
    });
});

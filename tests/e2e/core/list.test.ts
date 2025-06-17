import {
    initializeTestEnvironment,
    cleanupTestEnvironment,
    resetToInitialState,
    TAYLORED_CMD_BASE,
    execOptions,
    PLUGIN_DELETIONS_NAME,
} from './setup';
import { execSync } from 'child_process';

describe('Core CLI Tests - List', () => {
    beforeAll(async () => {
        await initializeTestEnvironment();
    });

    afterAll(async () => {
        await cleanupTestEnvironment();
    });

    beforeEach(async () => {
        await resetToInitialState();
    });

    test('taylored --list: lists saved patch files', () => {
        const output = execSync(`${TAYLORED_CMD_BASE} --list`, execOptions).toString();
        expect(output).toContain(PLUGIN_DELETIONS_NAME);
    });
});

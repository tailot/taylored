import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  resetToInitialState,
  applyDeletionsPatch,
  normalizeLineEndings,
  TAYLORED_CMD_BASE,
  execOptions,
  PLUGIN_DELETIONS_NAME,
  PLUGIN_DELETIONS_NO_EXT,
  MODIFIED_FILE1_DELETIONS_CONTENT,
  TEST_DIR_FULL_PATH,
} from './setup';

describe('Core CLI Tests - Verify Remove', () => {
  beforeAll(async () => {
    await initializeTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    await resetToInitialState();
    applyDeletionsPatch(); // Apply patch before each verify-remove test
  });

  describe('taylored --verify-remove (deletions patch)', () => {
    test('verifies patch removal (with .taylored extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --verify-remove ${PLUGIN_DELETIONS_NAME}`,
        execOptions,
      );
      // Verify that the files are still in the patched state
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
      expect(
        fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
      ).toBe(false);
    });
    test('verifies patch removal (without .taylored extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --verify-remove ${PLUGIN_DELETIONS_NO_EXT}`,
        execOptions,
      );
      // Verify that the files are still in the patched state
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(MODIFIED_FILE1_DELETIONS_CONTENT));
      expect(
        fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
      ).toBe(false);
    });
  });
});

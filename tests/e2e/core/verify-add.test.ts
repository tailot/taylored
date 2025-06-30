import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import {
  initializeTestEnvironment,
  cleanupTestEnvironment,
  resetToInitialState,
  normalizeLineEndings,
  TAYLORED_CMD_BASE,
  execOptions,
  PLUGIN_DELETIONS_NAME,
  PLUGIN_DELETIONS_NO_EXT,
  INITIAL_FILE1_CONTENT,
  TEST_DIR_FULL_PATH,
} from './setup';

describe('Core CLI Tests - Verify Add', () => {
  beforeAll(async () => {
    await initializeTestEnvironment();
  });

  afterAll(async () => {
    await cleanupTestEnvironment();
  });

  beforeEach(async () => {
    await resetToInitialState();
  });

  describe('taylored --verify-add (deletions patch)', () => {
    test('verifies patch addition (with .taylored extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --verify-add ${PLUGIN_DELETIONS_NAME}`,
        execOptions,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
      expect(
        fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
      ).toBe(true);
    });
    test('verifies patch addition (without .taylored extension)', () => {
      execSync(
        `${TAYLORED_CMD_BASE} --verify-add ${PLUGIN_DELETIONS_NO_EXT}`,
        execOptions,
      );
      expect(
        normalizeLineEndings(
          fs.readFileSync(path.join(TEST_DIR_FULL_PATH, 'file1.txt'), 'utf8'),
        ),
      ).toBe(normalizeLineEndings(INITIAL_FILE1_CONTENT));
      expect(
        fs.existsSync(path.join(TEST_DIR_FULL_PATH, 'file_to_delete.txt')),
      ).toBe(true);
    });
  });
});

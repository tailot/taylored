// tests/e2e/automatic-compute.test.ts
import { handleAutomaticOperation } from '../../lib/handlers/automatic-handler';
import * as fs from 'fs/promises';
import * as path from 'path';

const CWD = process.cwd();
const tayloredTestDir = path.join(CWD, '.taylored-test');

import { simpleGit, SimpleGit } from 'simple-git';

describe('Minimal Automatic Compute Test', () => {
  let git: SimpleGit;

  beforeAll(async () => {
    await fs.mkdir(tayloredTestDir, { recursive: true });
    git = simpleGit(tayloredTestDir);
    await git.init();
    await fs.copyFile(
      path.join(CWD, 'tests/e2e/test-compute.txt'),
      path.join(tayloredTestDir, 'test-compute.txt')
    );
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    await git.add('.');
    await git.commit('Initial commit');
    await git.checkoutLocalBranch('test-branch');
  });

  afterAll(async () => {
    await fs.rm(tayloredTestDir, { recursive: true, force: true });
  });

  it('should correctly process a taylored block with a compute attribute', async () => {
    await handleAutomaticOperation('txt', 'test-branch', tayloredTestDir);

    const tayloredFilePath = path.join(tayloredTestDir, '.taylored', '1.taylored');
    expect(await fs.stat(tayloredFilePath)).toBeTruthy();

    const tayloredFileContent = await fs.readFile(tayloredFilePath, 'utf-8');
    const expectedHunk = `
 This is a test file.
-<taylored 1 compute="console.log('Computed output');">
-console.log('Computed output');
-</taylored>
+Computed output
 This is the end of the test file.
`;
    // Normalize line endings for comparison
    expect(tayloredFileContent.replace(/\r\n/g, '\n')).toContain(expectedHunk.replace(/\r\n/g, '\n'));
  });

  it('should pass a basic truthiness test', () => {
    expect(true).toBe(true);
  });
});

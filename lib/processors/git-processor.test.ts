// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { GitProcessor } from './git-processor';
import { ParsedBlock, BlockAttributes } from '../parsers/block-parser';
import { GitOperationError } from '../errors';
import { TAYLORED_DIR_NAME } from '../constants';

// Mock child_process.execSync
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  execSync: jest.fn(),
}));

// Mock fs/promises
jest.mock('fs/promises', () => ({
  readFile: jest.fn(),
  writeFile: jest.fn(),
  appendFile: jest.fn(),
}));

describe('GitProcessor', () => {
  const mockCwd = '/test/repo';
  const mockOriginalBranch = 'main';
  let gitProcessor: GitProcessor;
  let mockExecSync: jest.MockedFunction<typeof execSync>;
  let mockFsReadFile: jest.MockedFunction<typeof fs.readFile>;
  let mockFsWriteFile: jest.MockedFunction<typeof fs.writeFile>;
  let mockFsAppendFile: jest.MockedFunction<typeof fs.appendFile>;

  const mockXmlBlock: ParsedBlock = {
    type: 'xml',
    attributes: { number: 1, async: false, disabled: false },
    fullMatch: '<taylored number="1">static content</taylored>',
    content: 'static content',
    filePath: `${mockCwd}/src/file1.ts`,
    startLine: 5,
    startIndex: 100,
  };

  const mockJsonComputeBlock: ParsedBlock = {
    type: 'json',
    attributes: { number: 2, compute: 'js', async: false, disabled: false },
    fullMatch: '{"taylored": 2, "compute": "js", "content": "return 1+1"}',
    content: 'return 1+1',
    filePath: `${mockCwd}/src/file2.js`,
    startLine: 10,
    startIndex: 200,
  };

  const mockExecSyncDefaultBehavior = (command: string, options?: ExecSyncOptionsWithStringEncoding): Buffer | string => {
      if (command.startsWith('git diff --exit-code')) {
        // Simulate diff by throwing an error with stdout for diff content
        const err = new Error('Diff found') as any;
        err.status = 1; // Git diff exits with 1 if there are differences
        err.stdout = `diff --git a/file b/file\nindex 123..456 100644\n--- a/file\n+++ b/file\n@@ -1 +1 @@\n-old\n+new\n`;
        err.stderr = '';
        throw err;
      }
      if (command.startsWith('git rev-parse --abbrev-ref HEAD')) {
        return mockOriginalBranch;
      }
      return ''; // Default for other commands like checkout, commit, add, branch -D
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockExecSync = execSync as jest.MockedFunction<typeof execSync>;
    mockFsReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;
    mockFsWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
    mockFsAppendFile = fs.appendFile as jest.MockedFunction<typeof fs.appendFile>;

    gitProcessor = new GitProcessor(mockCwd, mockOriginalBranch);

    // Default mock implementations
    mockExecSync.mockImplementation(mockExecSyncDefaultBehavior);
    mockFsReadFile.mockResolvedValue('initial file content'); // Default for readFile
    mockFsWriteFile.mockResolvedValue(undefined); // Default for writeFile
    mockFsAppendFile.mockResolvedValue(undefined);
  });

  describe('createStaticPatch', () => {
    it('should execute correct git commands and return patch content', async () => {
      mockFsReadFile.mockResolvedValueOnce('Original content with <taylored number="1">static content</taylored> block');

      const patch = await gitProcessor.createStaticPatch(mockXmlBlock);

      expect(patch).toContain('+static content');
      expect(mockExecSync).toHaveBeenCalledWith(`git checkout -b "temp-taylored-static-1-${expect.any(Number)}" "${mockOriginalBranch}"`, expect.any(Object));
      expect(mockFsWriteFile).toHaveBeenCalledWith(path.join(mockCwd, '.gitignore'), TAYLORED_DIR_NAME + '/\n');
      expect(mockExecSync).toHaveBeenCalledWith('git add .gitignore', expect.any(Object));
      expect(mockFsWriteFile).toHaveBeenCalledWith(mockXmlBlock.filePath, 'Original content with  block'); // Content removed
      expect(mockExecSync).toHaveBeenCalledWith(`git add "${path.relative(mockCwd, mockXmlBlock.filePath)}"`, expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('AUTO: Temp remove static block 1'), expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining(`git diff --exit-code "${mockOriginalBranch}" HEAD -- "${path.relative(mockCwd, mockXmlBlock.filePath)}"`), expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(`git checkout -q "${mockOriginalBranch}"`, expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining('git branch -q -D "temp-taylored-static-1-'), expect.any(Object));
    });

    it('should throw GitOperationError if a git command fails', async () => {
      mockExecSync.mockImplementation((command: string) => {
        if (command.startsWith('git commit')) {
          const err = new Error('Commit failed') as any;
          err.status = 128;
          err.stderr = 'fatal: cannot commit';
          throw err;
        }
        return mockExecSyncDefaultBehavior(command);
      });

      await expect(gitProcessor.createStaticPatch(mockXmlBlock)).rejects.toThrow(GitOperationError);
      await expect(gitProcessor.createStaticPatch(mockXmlBlock)).rejects.toThrow(/Failed to commit removal of block 1/);
    });
  });

  describe('createComputedPatch', () => {
    const computedContent = 'console.log("new content");';
    const targetBranch = 'develop';

    it('should execute correct git commands and return patch content for computed block', async () => {
      mockFsReadFile.mockResolvedValueOnce(`Some code\n${mockJsonComputeBlock.fullMatch}\nMore code`);

      const patch = await gitProcessor.createComputedPatch(mockJsonComputeBlock, computedContent, targetBranch);

      expect(patch).toContain('+' + computedContent); // Simplified check
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining(`temp-taylored-computed-${mockJsonComputeBlock.attributes.number}-`), expect.any(Object));
      expect(mockFsWriteFile).toHaveBeenCalledWith(path.join(mockCwd, '.gitignore'), TAYLORED_DIR_NAME + '/\n');
      expect(mockExecSync).toHaveBeenCalledWith('git add .gitignore', expect.any(Object));
      expect(mockFsWriteFile).toHaveBeenCalledWith(mockJsonComputeBlock.filePath, `Some code\n${computedContent}\nMore code`);
      expect(mockExecSync).toHaveBeenCalledWith(`git add "${path.relative(mockCwd, mockJsonComputeBlock.filePath)}"`, expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining(`AUTO: Apply computed block ${mockJsonComputeBlock.attributes.number}`), expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining(`git diff --exit-code "${targetBranch}" HEAD -- "${path.relative(mockCwd, mockJsonComputeBlock.filePath)}"`), expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(`git checkout -q "${mockOriginalBranch}"`, expect.any(Object));
      expect(mockExecSync).toHaveBeenCalledWith(expect.stringContaining(`git branch -q -D "temp-taylored-computed-${mockJsonComputeBlock.attributes.number}-`), expect.any(Object));
    });

    it('should return empty string if git diff shows no changes for computed patch', async () => {
        mockExecSync.mockImplementation((command: string) => {
            if (command.startsWith('git diff --exit-code')) {
              return ''; // Simulate no diff
            }
            return mockExecSyncDefaultBehavior(command);
          });
        const patch = await gitProcessor.createComputedPatch(mockJsonComputeBlock, "identical content", targetBranch);
        expect(patch).toBe("");
    });
  });

  describe('Git Cleanup', () => {
    it('should attempt to checkout original branch and delete temp branch even if operations fail mid-way (static)', async () => {
        mockExecSync.mockImplementation((command: string) => {
            if (command.includes("git commit")) { // Fail on commit
                const err = new Error('Commit failed') as any;
                err.status = 1;
                err.stderr = 'commit error';
                throw err;
            }
            return mockExecSyncDefaultBehavior(command);
        });

        await expect(gitProcessor.createStaticPatch(mockXmlBlock)).rejects.toThrow(GitOperationError);

        // Check that cleanup was still attempted
        expect(mockExecSync).toHaveBeenCalledWith(expect.stringMatching(/^git checkout -q "main"/), expect.any(Object));
        expect(mockExecSync).toHaveBeenCalledWith(expect.stringMatching(/^git branch -q -D "temp-taylored-static-1-/), expect.any(Object));
    });

    it('should attempt to checkout original branch and delete temp branch even if operations fail mid-way (computed)', async () => {
        mockExecSync.mockImplementation((command: string) => {
            if (command.includes("git commit")) { // Fail on commit
                const err = new Error('Commit failed') as any;
                err.status = 1;
                err.stderr = 'commit error';
                throw err;
            }
            return mockExecSyncDefaultBehavior(command);
        });

        await expect(gitProcessor.createComputedPatch(mockJsonComputeBlock, "content", "dev")).rejects.toThrow(GitOperationError);

        expect(mockExecSync).toHaveBeenCalledWith(expect.stringMatching(/^git checkout -q "main"/), expect.any(Object));
        expect(mockExecSync).toHaveBeenCalledWith(expect.stringMatching(/^git branch -q -D "temp-taylored-computed-2-/), expect.any(Object));
    });

     it('should log warning if deleting temp branch fails', async () => {
        const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
        mockExecSync.mockImplementation((command: string) => {
            if (command.startsWith('git branch -q -D')) {
                throw new Error('Failed to delete branch');
            }
            return mockExecSyncDefaultBehavior(command);
        });

        await gitProcessor.createStaticPatch(mockXmlBlock); // Let it run to completion (or as far as it can)
        expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Warning: Failed to delete temporary branch'));
        consoleWarnSpy.mockRestore();
    });
  });
});

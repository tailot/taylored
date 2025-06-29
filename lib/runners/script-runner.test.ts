// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { executeScript } from './script-runner';
import { ScriptExecutionError } from '../errors';
import { spawn } from 'child_process';

// Mock child_process.spawn
jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'), // Import and retain default behavior
  spawn: jest.fn(), // Mock spawn
}));

// Mock fs.promises
jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  writeFile: jest.fn(),
  chmod: jest.fn(),
  unlink: jest.fn(),
}));

describe('executeScript', () => {
  const mockCwd = '/test/cwd';
  const mockScriptContent = '#!/bin/bash\necho "hello world"';
  let mockSpawn: jest.MockedFunction<typeof spawn>;
  let mockFsWriteFile: jest.MockedFunction<typeof fs.writeFile>;
  let mockFsChmod: jest.MockedFunction<typeof fs.chmod>;
  let mockFsUnlink: jest.MockedFunction<typeof fs.unlink>;

  beforeEach(() => {
    jest.clearAllMocks();
    // Type assertion for the mocked spawn
    mockSpawn = spawn as jest.MockedFunction<typeof spawn>;
    mockFsWriteFile = fs.writeFile as jest.MockedFunction<typeof fs.writeFile>;
    mockFsChmod = fs.chmod as jest.MockedFunction<typeof fs.chmod>;
    mockFsUnlink = fs.unlink as jest.MockedFunction<typeof fs.unlink>;

    // Default successful mocks
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsChmod.mockResolvedValue(undefined);
    mockFsUnlink.mockResolvedValue(undefined);
  });

  const mockChildProcess = (
    stdout: string,
    stderr: string,
    exitCode: number,
    spawnError?: Error
  ) => {
    const child: any = new (require('events').EventEmitter)();
    child.stdout = new (require('stream').Readable)({ read() {} });
    child.stderr = new (require('stream').Readable)({ read() {} });

    mockSpawn.mockImplementation(() => {
      if (spawnError) {
        // Delay emitting error to allow on('error') to be set up
        process.nextTick(() => child.emit('error', spawnError));
        return child;
      }

      process.nextTick(() => {
        if (stdout) child.stdout.push(stdout);
        if (stderr) child.stderr.push(stderr);
        child.stdout.push(null); // End stream
        child.stderr.push(null); // End stream
        child.emit('close', exitCode);
      });
      return child;
    });
    return child; // Return for further event Emitter manipulation if needed in tests
  };


  it('should execute a script successfully and return stdout', async () => {
    mockChildProcess('hello world', '', 0);

    const result = await executeScript(mockScriptContent, mockCwd);

    expect(mockFsWriteFile).toHaveBeenCalledWith(expect.stringContaining('taylored-temp-script-'), mockScriptContent);
    expect(mockFsChmod).toHaveBeenCalledWith(expect.stringContaining('taylored-temp-script-'), 0o755);
    expect(mockSpawn).toHaveBeenCalledWith(expect.stringContaining('taylored-temp-script-'), [], { cwd: mockCwd, stdio: 'pipe', shell: true });
    expect(result).toBe('hello world');
    expect(mockFsUnlink).toHaveBeenCalledWith(expect.stringContaining('taylored-temp-script-'));
  });

  it('should throw ScriptExecutionError if script exits with non-zero code', async () => {
    mockChildProcess('output', 'error details', 1);

    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toThrow(ScriptExecutionError);
    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toMatchObject({
      message: 'Script exited with code 1.',
      stdout: 'output',
      stderr: 'error details',
      exitCode: 1,
    });
    expect(mockFsUnlink).toHaveBeenCalledTimes(2); // Called in both reject paths
  });

  it('should throw ScriptExecutionError if spawn emits an error (e.g., command not found)', async () => {
    const spawnErr = new Error('spawn ENOENT');
    mockChildProcess('', '', 0, spawnErr); // exitCode here is not used as spawnError takes precedence

    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toThrow(ScriptExecutionError);
    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toMatchObject({
        message: `Failed to start script: ${spawnErr.message}`,
    });
    expect(mockFsUnlink).toHaveBeenCalledTimes(2);
  });

  it('should throw ScriptExecutionError if fs.writeFile fails', async () => {
    const writeError = new Error('Disk full');
    mockFsWriteFile.mockRejectedValue(writeError);
    mockChildProcess('', '', 0); // Mock spawn, though it shouldn't be called

    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toThrow(ScriptExecutionError);
    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toThrow(`An unexpected error occurred during script execution or temp file management: ${writeError.message}`);
    expect(mockFsChmod).not.toHaveBeenCalled();
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockFsUnlink).toHaveBeenCalledTimes(2); // unlink is in finally
  });

  it('should throw ScriptExecutionError if fs.chmod fails', async () => {
    const chmodError = new Error('Permission denied');
    mockFsChmod.mockRejectedValue(chmodError);
    mockChildProcess('', '', 0); // Mock spawn, though it shouldn't be called

    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toThrow(ScriptExecutionError);
    await expect(executeScript(mockScriptContent, mockCwd)).rejects.toThrow(`An unexpected error occurred during script execution or temp file management: ${chmodError.message}`);
    expect(mockSpawn).not.toHaveBeenCalled();
    expect(mockFsUnlink).toHaveBeenCalledTimes(2); // unlink is in finally
  });

  it('should still attempt to unlink temp file even if script execution fails', async () => {
    mockChildProcess('', 'script error', 1); // Script fails

    try {
      await executeScript(mockScriptContent, mockCwd);
    } catch (e) {
      // Expected error
    }
    expect(mockFsUnlink).toHaveBeenCalledWith(expect.stringContaining('taylored-temp-script-'));
  });

  it('should log a warning if unlinking the temp file fails', async () => {
    const unlinkError = new Error('Cannot delete file');
    mockFsUnlink.mockRejectedValue(unlinkError);
    mockChildProcess('output', '', 0); // Script succeeds
    const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

    await executeScript(mockScriptContent, mockCwd);

    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(`Warning: Failed to delete temporary script file`));
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining(unlinkError.message));
    consoleWarnSpy.mockRestore();
  });
});

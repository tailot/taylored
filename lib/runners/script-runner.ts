// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { spawn } from 'child_process';
import { ScriptExecutionError } from '../errors';

/**
 * Executes a given script content in a temporary file.
 *
 * @param scriptContent The content of the script to execute.
 * @param cwd The current working directory where the script should be executed.
 * @returns A promise that resolves with the stdout of the script if successful.
 * @throws {ScriptExecutionError} If script execution fails or if there are issues
 *         with temporary file management.
 */
export async function executeScript(scriptContent: string, cwd: string): Promise<string> {
  const tempScriptName = `taylored-temp-script-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const tempScriptPath = path.join(cwd, tempScriptName);

  try {
    await fs.writeFile(tempScriptPath, scriptContent);
    await fs.chmod(tempScriptPath, 0o755); // rwxr-xr-x

    return await new Promise<string>((resolve, reject) => {
      const child = spawn(tempScriptPath, [], { cwd, stdio: 'pipe', shell: true });

      let stdoutData = '';
      let stderrData = '';

      if (child.stdout) {
        child.stdout.on('data', (data) => {
          stdoutData += data.toString();
          process.stdout.write(data); // Also pipe to main process stdout for visibility
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (data) => {
          stderrData += data.toString();
          process.stderr.write(data); // Also pipe to main process stderr for visibility
        });
      }

      child.on('error', (err) => {
        // This 'error' event is for errors in spawning the process itself (e.g., command not found)
        reject(new ScriptExecutionError(`Failed to start script: ${err.message}`, stdoutData, stderrData, child.exitCode));
      });

      child.on('close', (code) => {
        if (code === 0) {
          resolve(stdoutData);
        } else {
          reject(new ScriptExecutionError(
            `Script exited with code ${code}.`,
            stdoutData,
            stderrData,
            code
          ));
        }
      });
    });
  } catch (error: any) {
    // Catch errors from fs operations or if the promise from spawn was rejected early by 'error' event
    if (error instanceof ScriptExecutionError) {
      throw error; // Re-throw if it's already our custom error
    }
    // Wrap other errors (e.g., fs errors) in ScriptExecutionError
    throw new ScriptExecutionError(
      `An unexpected error occurred during script execution or temp file management: ${error.message}`,
      error.stdout, // Include if available from a caught spawn error
      error.stderr, // Include if available from a caught spawn error
      error.status // Include if available from a caught spawn error
    );
  } finally {
    try {
      await fs.unlink(tempScriptPath);
    } catch (unlinkError: any) {
      // Log a warning if the temporary file cannot be deleted, but don't fail the whole operation
      console.warn(`Warning: Failed to delete temporary script file '${tempScriptPath}'. Details: ${unlinkError.message}`);
    }
  }
}

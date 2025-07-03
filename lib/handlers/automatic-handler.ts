// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import {
  execSync,
  ExecSyncOptionsWithStringEncoding,
  spawn,
} from 'child_process';
import { TAYLORED_DIR_NAME, TAYLORED_FILE_EXTENSION } from '../constants';
import { analyzeDiffContent } from '../utils'; // Changed from handleSaveOperation

const execOpts: ExecSyncOptionsWithStringEncoding = {
  encoding: 'utf8',
  stdio: 'pipe',
};

interface BlockMatch {
  type: 'xml' | 'json';
  match: RegExpMatchArray;
  index: number;
}

/**
 * Recursively finds files with a specific extension within a directory, respecting exclusions.
 *
 * It traverses the directory structure starting from `dir`.
 * Directories named ".git" or ".taylored" are always excluded.
 * Additional directories can be excluded via the `excludeDirs` parameter.
 *
 * @async
 * @param {string} dir - The starting directory for the recursive search.
 * @param {string} ext - The file extension to search for (e.g., ".js", ".ts").
 * @param {string[]} allFiles - An accumulator array holding the paths of found files.
 * Typically initialized as an empty array by the caller.
 * @param {string[]} [excludeDirs] - An optional array of directory names or relative paths
 * (from CWD) to exclude from the search.
 * @param {string} [CWD_ABS] - The absolute path to the current working directory (CWD).
 * Used to correctly resolve relative paths for `excludeDirs`.
 * @returns {Promise<string[]>} A promise that resolves to an array of absolute file paths
 * matching the extension and exclusion criteria.
 */
async function findFilesRecursive(
  dir: string,
  ext: string,
  allFiles: string[] = [],
  excludeDirs?: string[],
  CWD_ABS?: string, // Absolute path to CWD for reliable relative path checking
): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const relativePath = CWD_ABS
        ? path.relative(CWD_ABS, fullPath)
        : entry.name;
      if (
        entry.name !== '.git' &&
        entry.name !== TAYLORED_DIR_NAME &&
        (!excludeDirs ||
          !excludeDirs.some(
            (excludedDir) =>
              relativePath === excludedDir ||
              relativePath.startsWith(excludedDir + path.sep),
          ))
      ) {
        await findFilesRecursive(fullPath, ext, allFiles, excludeDirs, CWD_ABS);
      }
    } else if (entry.isFile() && entry.name.endsWith(ext)) {
      allFiles.push(fullPath);
    }
  }
  return allFiles;
}

/**
 * Handles the `taylored --automatic` command, automating the discovery and
 * extraction of Taylored blocks from source files into individual .taylored patch files.
 *
 * This function orchestrates a complex Git workflow for each discovered block:
 * 1. Scans files matching specified `extensionsInput` within the `CWD`, respecting `excludeDirs`.
 * 2. For each file, it searches for Taylored blocks using a regex.
 * The marker syntax is: `<taylored number="N" [disabled="true|false"] [compute="STRIP_CHARS"] [async="true|false"]>...content...</taylored>`
 * - `number="N"`: (Required) Specifies the output file number (e.g., N.taylored).
 * - `disabled="true|false"`: (Optional) If "true", the block is completely ignored by the `--automatic` process. If "false" or absent, the block is processed normally. Takes precedence over `compute` and `async`.
 * - `compute="STRIP_CHARS"`: (Optional) If present, the block's content is treated as a script.
 * `STRIP_CHARS` is a comma-separated list of patterns to remove from the script
 * before execution (e.g., comment markers like "/*,*"/""). The script's stdout
 * becomes the content of the patch.
 * - `async="true|false"`: (Optional, for `compute` blocks) If "true", the compute script
 * is executed asynchronously. Defaults to "false" (synchronous).
 * 3. **Git Workflow (for each block):**
 * - **Static Blocks (no `compute`):**
 * a. A temporary branch is created from the current branch (`originalBranchName`).
 * b. On this temp branch, the Taylored block is removed from the source file, and the change is committed.
 * c. A diff is generated between this temporary commit (block removed) and `originalBranchName` (block present).
 * This diff, representing the addition of the block, is saved as `N.taylored`.
 * d. The temporary branch is deleted, and the original branch is restored.
 * - **Compute Blocks:**
 * a. The script within the block is executed (stdout captured).
 * b. A temporary branch is created from `originalBranchName`.
 * c. On this temp branch, the original Taylored block markers are replaced with the script's stdout
 * in the source file, and this change is committed.
 * d. A diff is generated between this temporary commit and the target `branchName` (specified by user).
 * This diff, representing the changes needed to apply the computed content to `branchName`,
 * is saved as `N.taylored`.
 * e. The temporary branch is deleted, and `originalBranchName` is restored.
 * 4. Ensures the repository is clean (no uncommitted changes) and not in a detached HEAD state before starting.
 * 5. Handles errors gracefully, attempts to clean up temporary branches, and logs progress.
 *
 * For comprehensive details on the `taylored --automatic` command, its features, and marker syntax,
 * refer to the `DOCUMENTATION.md` file.
 *
 * @async
 * @param {string} extensionsInput - A comma-separated string of file extensions to scan
 * (e.g., "ts,js,py").
 * @param {string} branchName - The target Git branch against which computed blocks are diffed.
 * For static blocks, the current branch is implicitly the target for comparison.
 * @param {string} CWD - The current working directory, expected to be the root of the Git repository.
 * @param {string[]} [excludeDirs] - An optional array of directory names or relative paths
 * (from CWD) to exclude from scanning.
 * @returns {Promise<void>} A promise that resolves when all blocks have been processed.
 * @throws {Error} If critical pre-checks fail (e.g., dirty Git repository, detached HEAD state),
 * or if Git operations (checkout, commit, diff), file system operations (read,
 * write, unlink), or script execution (for compute blocks) encounter errors
 * during processing. Errors typically lead to the skipping of the problematic
 * block or premature termination of the command.
 */
export async function handleAutomaticOperation(
  extensionsInput: string,
  branchName: string,
  CWD: string,
  excludeDirs?: string[],
): Promise<void> {
  let originalBranchName: string;
  try {
    originalBranchName = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: CWD,
      ...execOpts,
    }).trim();
    if (originalBranchName === 'HEAD') {
      const errorMessage =
        'CRITICAL ERROR: Repository is in a detached HEAD state. Please checkout a branch.';
      console.error(errorMessage);
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    const errorMessage = `CRITICAL ERROR: Failed to get current Git branch. Details: ${error.message}`;
    console.error(errorMessage);
    if (error.stderr) console.error('STDERR:\n' + error.stderr);
    if (error.stdout) console.error('STDOUT:\n' + error.stdout);
    throw new Error(errorMessage);
  }

  try {
    const gitStatus = execSync('git status --porcelain', {
      cwd: CWD,
      ...execOpts,
    }).trim();
    if (gitStatus) {
      const errorMessage =
        'CRITICAL ERROR: Uncommitted changes or untracked files in the repository. Please commit or stash them before running --automatic.';
      console.error(errorMessage);
      console.error('Details:\n' + gitStatus);
      throw new Error(errorMessage);
    }
  } catch (error: any) {
    const errorMessage = `CRITICAL ERROR: Failed to check Git status. Details: ${error.message}`;
    console.error(errorMessage);
    if (error.stderr) console.error('STDERR:\n' + error.stderr);
    if (error.stdout) console.error('STDOUT:\n' + error.stdout);
    throw new Error(errorMessage);
  }

  console.log(
    `Starting automatic taylored block extraction for extensions '${extensionsInput}' in directory '${CWD}'. Original branch: '${originalBranchName}'`,
  );

  const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
  try {
    await fs.mkdir(tayloredDir, { recursive: true });
  } catch (error: any) {
    const errorMessage = `CRITICAL ERROR: Could not create directory '${tayloredDir}'. Details: ${error.message}`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }

  const extensions = extensionsInput.split(',').map((ext) => ext.trim());
  const allFilesToScan: string[] = [];
  const CWD_ABS = path.resolve(CWD); // Resolve CWD to an absolute path

  for (const ext of extensions) {
    const normalizedExtension = ext.startsWith('.') ? ext : `.${ext}`;
    try {
      // Pass excludeDirs and CWD_ABS to findFilesRecursive
      const filesForExtension = await findFilesRecursive(
        CWD_ABS,
        normalizedExtension,
        [],
        excludeDirs,
        CWD_ABS,
      );
      allFilesToScan.push(...filesForExtension);
    } catch (error: any) {
      console.error(
        `Error while searching for files with extension '${normalizedExtension}': ${error.message}`,
      );
      // Decide if you want to continue with other extensions or return
    }
  }

  if (allFilesToScan.length === 0) {
    console.log(`No files found with specified extensions: ${extensionsInput}`);
    return;
  }

  console.log(
    `Found ${allFilesToScan.length} file(s) with specified extensions. Processing...`,
  );

  // Corrected regex to properly capture number, other attributes, and content
  const blockRegex =
    /[^\n]*?<taylored\s+number="(\d+)"([^>]*)>([\s\S]*?)[^\n]*?<\/taylored>/g;
  const jsonBlockRegex =
    /(?:const\s+\w+\s*=\s*)?({(?:[^{}]|{[^{}]*})*?"taylored"\s*:\s*(\d+)(?:[^{}]|{[^{}]*})*?});?/g;
  let totalBlocksProcessed = 0;
  const asyncScriptPromises: Promise<void>[] = [];

  for (const originalFilePath of allFilesToScan) {
    let fileContent: string;
    try {
      fileContent = await fs.readFile(originalFilePath, 'utf-8');
    } catch (readError: any) {
      console.warn(
        `Warning: Error reading file '${originalFilePath}': ${readError.message}. Skipping this file.`,
      );
      continue;
    }

    // const matches = Array.from(fileContent.matchAll(blockRegex));
    // if (matches.length === 0) {
    //     continue;
    // }
    const xmlMatchesRaw = Array.from(fileContent.matchAll(blockRegex));
    const jsonMatchesRaw = Array.from(fileContent.matchAll(jsonBlockRegex));

    const allMatches: BlockMatch[] = [];

    for (const match of xmlMatchesRaw) {
      if (match.index !== undefined) {
        allMatches.push({ type: 'xml', match, index: match.index });
      }
    }
    for (const match of jsonMatchesRaw) {
      if (match.index !== undefined) {
        allMatches.push({ type: 'json', match, index: match.index });
      }
    }

    allMatches.sort((a, b) => a.index - b.index);

    if (allMatches.length === 0) {
      continue;
    }

    for (const matchInfo of allMatches) {
      let numero: string;
      let attributesString: string | undefined; // Only for XML
      let scriptContent: string;
      let scriptContentWithTags: string; // Full matched block
      let computeCharsToStrip: string | undefined;
      let asyncFlag: boolean = false; // Default to false
      let isDisabled: boolean = false; // Default to false

      if (matchInfo.type === 'xml') {
        const match = matchInfo.match;
        numero = match[1];
        attributesString = match[2];
        scriptContentWithTags = match[0];
        scriptContent = match[3];

        const computeMatch = attributesString.match(/compute=["']([^"']*)["']/);
        computeCharsToStrip = computeMatch ? computeMatch[1] : undefined;

        const asyncMatch = attributesString.match(/async=["'](true|false)["']/);
        asyncFlag = asyncMatch ? asyncMatch[1] === 'true' : false;

        const disabledMatch = attributesString.match(
          /disabled=["'](true|false)["']/,
        );
        isDisabled = disabledMatch ? disabledMatch[1] === 'true' : false;
      } else {
        // type === 'json'
        scriptContentWithTags = matchInfo.match[0]; // For la sostituzione, usiamo ancora la corrispondenza completa (es. "chiave": {...})
        const jsonBlockText = matchInfo.match[1]; // Per il parsing, usiamo il 1° gruppo di cattura (es. {...})
        numero = matchInfo.match[2]; // Il numero è già disponibile nel 2° gruppo di cattura

        try {
          // Rimuove le righe di commento prima del parsing JSON
          const cleanedJsonText = jsonBlockText.replace(/\/\/.*$/gm, '');
          const parsedJson = JSON.parse(cleanedJsonText);

          if (typeof parsedJson.content !== 'string') {
            console.warn(
              `Warning: JSON block ${numero} in ${originalFilePath} has invalid or missing 'content' string. Skipping.`,
            );
            continue;
          }
          scriptContent = parsedJson.content;
          computeCharsToStrip =
            typeof parsedJson.compute === 'string'
              ? parsedJson.compute
              : undefined;
          asyncFlag = parsedJson.async === true;
          isDisabled = parsedJson.disabled === true;
        } catch (e: any) {
          console.warn(
            `Warning: Parsing of JSON block in ${originalFilePath} ... Skipping.`,
          );
          continue;
        }
      }

      if (isDisabled) {
        console.log(
          `Skipping disabled block ${numero} from ${originalFilePath}.`,
        );
        continue;
      }

      const targetTayloredFileName = `${numero}${TAYLORED_FILE_EXTENSION}`;
      const targetTayloredFilePath = path.join(
        tayloredDir,
        targetTayloredFileName,
      );
      const intermediateMainTayloredPath = path.join(
        tayloredDir,
        `main${TAYLORED_FILE_EXTENSION}`,
      );

      console.log(`Processing block ${numero} from ${originalFilePath}...`);

      if (computeCharsToStrip !== undefined) {
        const processComputeBlock = async (
          currentNumero: string,
          currentOriginalFilePath: string,
          currentScriptContent: string,
          currentComputeCharsToStrip: string,
          currentScriptContentWithTags: string,
          currentCWD: string,
          currentBranchName: string,
          currentOriginalBranchName: string,
          currentTargetTayloredFilePath: string,
        ): Promise<void> => {
          console.log(
            `Asynchronously processing computed block ${currentNumero} from ${currentOriginalFilePath}...`,
          );
          // Ensure targetTayloredFilePath does not exist before processing
          try {
            await fs.access(currentTargetTayloredFilePath);
            const message = `CRITICAL ERROR: Target file ${currentTargetTayloredFilePath} for computed block already exists. Please remove or rename it.`;
            console.error(message);
            throw new Error(message);
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              // If it's any error other than "file not found", re-throw.
              throw error;
            }
          }
          // Ensure intermediateMainTayloredPath does not exist for compute, as it's not used.
          try {
            await fs.access(intermediateMainTayloredPath);
            // istanbul ignore next
            const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} exists for a compute block. This file should not be present. Please remove or rename it.`;
            console.error(message);
            throw new Error(message);
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              // If it's any error other than "file not found", re-throw.
              throw error;
            }
          }

          let actualScriptContent: string;
          if (currentComputeCharsToStrip.length > 0) {
            let processedContent = currentScriptContent.trim();
            const patterns = currentComputeCharsToStrip.split(',');
            for (const pattern of patterns) {
              const trimmedPattern = pattern.trim();
              if (trimmedPattern.length > 0) {
                processedContent = processedContent.replaceAll(
                  trimmedPattern,
                  '',
                );
              }
            }
            actualScriptContent = processedContent.trim();
          } else {
            actualScriptContent = currentScriptContent.trim();
          }

          const tempScriptPath = path.join(
            currentCWD,
            `taylored-temp-script-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          );
          await fs.writeFile(tempScriptPath, actualScriptContent);

          let scriptResult = '';
          try {
            await fs.chmod(tempScriptPath, 0o755);
            scriptResult = await new Promise<string>((resolve, reject) => {
              const child = spawn(tempScriptPath, [], {
                cwd: currentCWD,
                stdio: 'pipe',
                shell: true,
              });
              let scriptOutput = '';
              let scriptErrorOutput = '';
              child.stdout.on('data', (data) => {
                scriptOutput += data.toString();
                process.stdout.write(data);
              });
              child.stderr.on('data', (data) => {
                scriptErrorOutput += data.toString();
                process.stderr.write(data);
              });
              child.on('error', reject);
              child.on('close', (code) => {
                if (code === 0) {
                  resolve(scriptOutput);
                } else {
                  const error = new Error(
                    `Script failed with code ${code}`,
                  ) as any;
                  error.status = code;
                  error.stdout = scriptOutput;
                  error.stderr = scriptErrorOutput;
                  reject(error);
                }
              });
            });
          } catch (error: any) {
            // istanbul ignore next
            if (
              error.status !== undefined ||
              error.stderr !== undefined ||
              error.stdout !== undefined
            ) {
              // istanbul ignore next
              console.error(
                `ERROR: Script execution failed for block ${currentNumero} in ${currentOriginalFilePath}. Error: ${error.message}`,
              );
              if (error.stderr) console.error('STDERR:\n' + error.stderr);
              if (error.stdout) console.error('STDOUT:\n' + error.stdout);
            } else {
              console.error(
                `ERROR: Failed to set execute permissions or other FS issue on temporary script file '${tempScriptPath}'. Details: ${error.message}`,
              );
            }
            throw error;
          } finally {
            try {
              await fs.unlink(tempScriptPath);
            } catch (unlinkError: any) {
              // istanbul ignore next
              console.warn(
                `Warning: Failed to delete temporary script file '${tempScriptPath}' during cleanup. Details: ${unlinkError.message}`,
              );
            }
          }

          const relativeOriginalFilePath = path.relative(
            currentCWD,
            currentOriginalFilePath,
          );
          const tempComputeBranchName = `temp-taylored-compute-${currentNumero}-${Date.now()}`;

          try {
            execSync(
              `git checkout -b "${tempComputeBranchName}" "${currentOriginalBranchName}"`,
              { cwd: currentCWD, ...execOpts },
            );

            // Create and add .gitignore to the temporary compute branch
            const gitignorePath = path.join(currentCWD, '.gitignore');
            await fs.writeFile(gitignorePath, TAYLORED_DIR_NAME + '\n');
            execSync(`git add .gitignore`, { cwd: currentCWD, ...execOpts });

            const contentOnTempBranch = await fs.readFile(
              currentOriginalFilePath,
              'utf-8',
            );
            const contentWithScriptResult = contentOnTempBranch.replace(
              currentScriptContentWithTags,
              scriptResult,
            );
            await fs.writeFile(
              currentOriginalFilePath,
              contentWithScriptResult,
            );
            execSync(`git add "${relativeOriginalFilePath}"`, {
              cwd: currentCWD,
              ...execOpts,
            });
            execSync(
              `git commit --no-verify -m "AUTO: Apply computed block ${currentNumero} for ${path.basename(currentOriginalFilePath)}"`,
              { cwd: currentCWD, ...execOpts },
            );

            const diffAgainstBranchCommand = `git diff --exit-code "${currentBranchName}" HEAD -- "${relativeOriginalFilePath}"`;
            try {
              execSync(diffAgainstBranchCommand, {
                cwd: currentCWD,
                encoding: 'utf8',
                stdio: 'pipe',
              });
              await fs.writeFile(currentTargetTayloredFilePath, '');
              console.log(
                `No difference found for computed block ${currentNumero} from ${currentOriginalFilePath} when compared against branch '${currentBranchName}'. Empty taylored file created: ${currentTargetTayloredFilePath}`,
              );
            } catch (e: any) {
              if (e.status === 1 && typeof e.stdout === 'string') {
                await fs.writeFile(currentTargetTayloredFilePath, e.stdout);
                console.log(
                  `Successfully created ${currentTargetTayloredFilePath} for computed block ${currentNumero} from ${currentOriginalFilePath} (using branch diff against '${currentBranchName}')`,
                );
              } else {
                // istanbul ignore next
                console.error(
                  `CRITICAL ERROR: Failed to generate diff for computed block ${currentNumero} from ${currentOriginalFilePath} against branch '${currentBranchName}'.`,
                );
                if (e.message) console.error(`  Error message: ${e.message}`);
                if (e.stderr)
                  console.error('  STDERR:\n' + e.stderr.toString().trim());
                if (e.stdout)
                  console.error('  STDOUT:\n' + e.stdout.toString().trim());
                throw e;
              }
            }
            // totalBlocksProcessed will be incremented after Promise.allSettled for async blocks
          } catch (error: any) {
            // istanbul ignore next
            console.error(
              `CRITICAL ERROR: Failed to process computed block ${currentNumero} from ${currentOriginalFilePath} using branch diff method.`,
            );
            if (error.message)
              console.error(`  Error message: ${error.message}`);
            if (error.stderr)
              console.error('  STDERR:\n' + error.stderr.toString().trim());
            if (error.stdout)
              console.error('  STDOUT:\n' + error.stdout.toString().trim());
            throw error;
          } finally {
            const currentBranchAfterOps = execSync(
              'git rev-parse --abbrev-ref HEAD',
              { cwd: currentCWD, ...execOpts },
            ).trim();
            if (currentBranchAfterOps === tempComputeBranchName) {
              execSync(`git checkout -q "${currentOriginalBranchName}"`, {
                cwd: currentCWD,
                stdio: 'ignore',
              });
            } else if (currentBranchAfterOps !== currentOriginalBranchName) {
              // istanbul ignore next
              console.warn(
                `Warning: Unexpected current branch '${currentBranchAfterOps}' during cleanup for computed block. Attempting to return to '${currentOriginalBranchName}'.`,
              );
              try {
                execSync(`git checkout -q "${currentOriginalBranchName}"`, {
                  cwd: currentCWD,
                  stdio: 'ignore',
                });
              } catch (coErr: any) {
                console.warn(
                  `Warning: Failed to checkout original branch '${currentOriginalBranchName}' during cleanup. Current branch: ${currentBranchAfterOps}. Error: ${coErr.message}`,
                );
              }
            }
            try {
              const branchesRaw = execSync('git branch', {
                cwd: currentCWD,
                ...execOpts,
              });
              const branchesList = branchesRaw
                .split('\n')
                .map((b) => b.trim().replace(/^\* /, ''));
              if (branchesList.includes(tempComputeBranchName)) {
                execSync(`git branch -q -D "${tempComputeBranchName}"`, {
                  cwd: currentCWD,
                  stdio: 'ignore',
                });
              }
            } catch (deleteBranchError: any) {
              // istanbul ignore next
              console.warn(
                `Warning: Failed to delete temporary branch '${tempComputeBranchName}' during cleanup for computed block. May require manual cleanup. ${deleteBranchError.message}`,
              );
            }
          }
        };

        if (asyncFlag) {
          asyncScriptPromises.push(
            processComputeBlock(
              numero,
              originalFilePath,
              scriptContent,
              computeCharsToStrip,
              scriptContentWithTags,
              CWD,
              branchName,
              originalBranchName,
              targetTayloredFilePath,
            ),
          );
          totalBlocksProcessed++; // Increment when task is initiated for async
        } else {
          // Synchronous execution path (existing logic)
          // Ensure targetTayloredFilePath does not exist before processing
          try {
            await fs.access(targetTayloredFilePath);
            const message = `CRITICAL ERROR: Target file ${targetTayloredFilePath} for computed block already exists. Please remove or rename it.`;
            console.error(message);
            throw new Error(message);
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              // If it's any error other than "file not found", re-throw.
              throw error;
            }
          }
          // Ensure intermediateMainTayloredPath does not exist for compute, as it's not used.
          try {
            await fs.access(intermediateMainTayloredPath);
            // istanbul ignore next
            const message = `CRITICAL ERROR: Intermediate file ${intermediateMainTayloredPath} exists for a compute block. This file should not be present. Please remove or rename it.`;
            console.error(message);
            throw new Error(message);
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              // If it's any error other than "file not found", re-throw.
              throw error;
            }
          }

          let actualScriptContent: string;
          if (
            computeCharsToStrip !== undefined &&
            computeCharsToStrip.length > 0
          ) {
            // Modified compute logic:
            // Removes all occurrences of each pattern specified in 'computeCharsToStrip'.
            let processedContent = scriptContent.trim(); // Start by trimming the block content
            const patterns = computeCharsToStrip.split(',');

            for (const pattern of patterns) {
              const trimmedPattern = pattern.trim(); // Trim the pattern itself to remove any surrounding whitespace
              if (trimmedPattern.length > 0) {
                // Removes all occurrences of the trimmedPattern.
                // String.prototype.replaceAll() is available in Node.js v15.0.0+.
                // If compatibility with older versions is required, you could use:
                // processedContent = processedContent.split(trimmedPattern).join('');
                processedContent = processedContent.replaceAll(
                  trimmedPattern,
                  '',
                );
              }
            }
            actualScriptContent = processedContent.trim(); // Trim the final result
          } else {
            // No compute or empty compute: use the content of the block, trimmed.
            actualScriptContent = scriptContent.trim();
          }

          // Create temp script file without extension, relying on shebang
          const tempScriptPath = path.join(
            CWD,
            `taylored-temp-script-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
          );
          await fs.writeFile(tempScriptPath, actualScriptContent);

          let scriptResult = '';
          try {
            // Add execute permission to the temporary script file before execution
            await fs.chmod(tempScriptPath, 0o755); // rwxr-xr-x

            // Execute the temporary script directly, relying on its shebang
            scriptResult = await new Promise<string>((resolve, reject) => {
              const child = spawn(tempScriptPath, [], {
                cwd: CWD,
                stdio: 'pipe',
                shell: true,
              });
              let scriptOutput = '';
              let scriptErrorOutput = '';

              child.stdout.on('data', (data) => {
                scriptOutput += data.toString();
                process.stdout.write(data);
              });

              child.stderr.on('data', (data) => {
                scriptErrorOutput += data.toString();
                process.stderr.write(data);
              });

              child.on('error', (err) => {
                reject(err);
              });

              child.on('close', (code) => {
                if (code === 0) {
                  resolve(scriptOutput);
                } else {
                  const error = new Error(
                    `Script failed with code ${code}`,
                  ) as any;
                  error.status = code;
                  error.stdout = scriptOutput;
                  error.stderr = scriptErrorOutput;
                  reject(error);
                }
              });
            });
          } catch (error: any) {
            // Differentiate error source for better logging
            // istanbul ignore next
            if (
              error.status !== undefined ||
              error.stderr !== undefined ||
              error.stdout !== undefined
            ) {
              // This is likely an error from the script execution (spawn)
              // istanbul ignore next
              console.error(
                `ERROR: Script execution failed for block ${numero} in ${originalFilePath}. Error: ${error.message}`,
              );
              if (error.stderr) console.error('STDERR:\n' + error.stderr);
              if (error.stdout) console.error('STDOUT:\n' + error.stdout);
            } else {
              // This is likely an error from fs.chmod or other fs operations
              console.error(
                `ERROR: Failed to set execute permissions or other FS issue on temporary script file '${tempScriptPath}'. Details: ${error.message}`,
              );
            }
            throw error; // Re-throw the error to stop processing for this block
          } finally {
            // Clean up temp script file, regardless of success or failure of the try block
            try {
              await fs.unlink(tempScriptPath);
            } catch (unlinkError: any) {
              // istanbul ignore next
              console.warn(
                `Warning: Failed to delete temporary script file '${tempScriptPath}' during cleanup. Details: ${unlinkError.message}`,
              );
            }
          }

          // New git-based diffing logic for compute blocks
          const relativeOriginalFilePath = path.relative(CWD, originalFilePath);
          const tempComputeBranchName = `temp-taylored-compute-${numero}-${Date.now()}`;

          try {
            // 1. Create a temporary branch from the current originalBranchName
            execSync(
              `git checkout -b "${tempComputeBranchName}" "${originalBranchName}"`,
              { cwd: CWD, ...execOpts },
            );

            // Create and add .gitignore to the temporary compute branch (sync)
            const gitignorePath = path.join(CWD, '.gitignore');
            await fs.writeFile(gitignorePath, TAYLORED_DIR_NAME + '\n');
            execSync(`git add .gitignore`, { cwd: CWD, ...execOpts });

            // 2. On this temporary branch, modify the file:
            const contentOnTempBranch = await fs.readFile(
              originalFilePath,
              'utf-8',
            );
            const contentWithScriptResult = contentOnTempBranch.replace(
              scriptContentWithTags,
              scriptResult,
            );
            await fs.writeFile(originalFilePath, contentWithScriptResult);

            // 3. Commit this change on the temporary branch
            execSync(`git add "${relativeOriginalFilePath}"`, {
              cwd: CWD,
              ...execOpts,
            });
            execSync(
              `git commit --no-verify -m "AUTO: Apply computed block ${numero} for ${path.basename(originalFilePath)}"`,
              { cwd: CWD, ...execOpts },
            );

            // 4. Generate the diff between the target branchName and HEAD of our temporary branch
            const diffAgainstBranchCommand = `git diff --exit-code "${branchName}" HEAD -- "${relativeOriginalFilePath}"`;
            let diffOutputCommandResult: string;

            try {
              diffOutputCommandResult = execSync(diffAgainstBranchCommand, {
                cwd: CWD,
                encoding: 'utf8',
                stdio: 'pipe',
              });
              // No differences found if execSync doesn't throw
              await fs.writeFile(targetTayloredFilePath, '');
              console.log(
                `No difference found for computed block ${numero} from ${originalFilePath} when compared against branch '${branchName}'. Empty taylored file created: ${targetTayloredFilePath}`,
              );
            } catch (e: any) {
              // If git diff finds differences, it exits with 1, execSync throws.
              if (e.status === 1 && typeof e.stdout === 'string') {
                diffOutputCommandResult = e.stdout;
                await fs.writeFile(
                  targetTayloredFilePath,
                  diffOutputCommandResult,
                );
                console.log(
                  `Successfully created ${targetTayloredFilePath} for computed block ${numero} from ${originalFilePath} (using branch diff against '${branchName}')`,
                );
              } else {
                // Actual error from git diff
                // istanbul ignore next
                console.error(
                  `CRITICAL ERROR: Failed to generate diff for computed block ${numero} from ${originalFilePath} against branch '${branchName}'.`,
                );
                if (e.message) console.error(`  Error message: ${e.message}`);
                if (e.stderr)
                  console.error('  STDERR:\n' + e.stderr.toString().trim());
                if (e.stdout)
                  console.error('  STDOUT:\n' + e.stdout.toString().trim());
                throw e; // Re-throw the actual error
              }
            }
            totalBlocksProcessed++;
          } catch (error: any) {
            // istanbul ignore next
            console.error(
              `CRITICAL ERROR: Failed to process computed block ${numero} from ${originalFilePath} using branch diff method.`,
            );
            if (error.message)
              console.error(`  Error message: ${error.message}`);
            if (error.stderr)
              console.error('  STDERR:\n' + error.stderr.toString().trim());
            if (error.stdout)
              console.error('  STDOUT:\n' + error.stdout.toString().trim());
            throw error; // Propagate error to stop processing for this block/file
          } finally {
            // Clean up: switch back to original branch and delete temporary branch
            const currentBranchAfterOps = execSync(
              'git rev-parse --abbrev-ref HEAD',
              { cwd: CWD, ...execOpts },
            ).trim();
            if (currentBranchAfterOps === tempComputeBranchName) {
              execSync(`git checkout -q "${originalBranchName}"`, {
                cwd: CWD,
                stdio: 'ignore',
              });
            } else if (currentBranchAfterOps !== originalBranchName) {
              // istanbul ignore next
              console.warn(
                `Warning: Unexpected current branch '${currentBranchAfterOps}' during cleanup for computed block. Attempting to return to '${originalBranchName}'.`,
              );
              try {
                execSync(`git checkout -q "${originalBranchName}"`, {
                  cwd: CWD,
                  stdio: 'ignore',
                });
              } catch (coErr: any) {
                console.warn(
                  `Warning: Failed to checkout original branch '${originalBranchName}' during cleanup. Current branch: ${currentBranchAfterOps}. Error: ${coErr.message}`,
                );
              }
            }
            try {
              const branchesRaw = execSync('git branch', {
                cwd: CWD,
                ...execOpts,
              });
              const branchesList = branchesRaw
                .split('\n')
                .map((b) => b.trim().replace(/^\* /, ''));
              if (branchesList.includes(tempComputeBranchName)) {
                execSync(`git branch -q -D "${tempComputeBranchName}"`, {
                  cwd: CWD,
                  stdio: 'ignore',
                });
              }
            } catch (deleteBranchError: any) {
              // istanbul ignore next
              console.warn(
                `Warning: Failed to delete temporary branch '${tempComputeBranchName}' during cleanup for computed block. May require manual cleanup. ${deleteBranchError.message}`,
              );
            }
          }
        }
      } else {
        // Existing non-compute logic - wrapped correctly now
        const actualIntermediateFileName = `${branchName.replace(/[/\\]/g, '-')}${TAYLORED_FILE_EXTENSION}`;
        const actualIntermediateFilePath = path.join(
          tayloredDir,
          actualIntermediateFileName,
        );

        // Pre-check 1: Ensure the intermediate file that handleSaveOperation WILL create/overwrite doesn't exist unexpectedly.
        try {
          await fs.access(actualIntermediateFilePath);
          const message = `CRITICAL ERROR: Intermediate file ${actualIntermediateFilePath} (derived from branch name '${branchName}') already exists. 'handleSaveOperation' would overwrite this file. Please remove or rename it to ensure a clean state.`;
          console.error(message);
          throw new Error(message);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            // If any error other than "file not found", re-throw.
            throw error;
          }
          // ENOENT is good, means it's clean.
        }

        // Pre-check 2: Ensure the final target file doesn't exist (this was already correctly in place)
        try {
          await fs.access(targetTayloredFilePath);
          const message = `CRITICAL ERROR: Target file ${targetTayloredFilePath} already exists. Please remove or rename it.`;
          console.error(message);
          throw new Error(message);
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            throw error;
          }
        }

        // const fileLines = fileContent.split('\n');
        // Use matchInfo.index directly as it's populated for both XML and JSON types
        const contentUpToMatch = fileContent.substring(0, matchInfo.index);
        const startLineNum = contentUpToMatch.split('\n').length;
        const matchLinesCount = scriptContentWithTags.split('\n').length; // Use scriptContentWithTags here
        const tempBranchName = `temp-taylored-${numero}-${Date.now()}`;

        try {
          execSync(`git checkout -b ${tempBranchName}`, {
            cwd: CWD,
            ...execOpts,
          });

          // Create and add .gitignore to the temporary non-compute branch
          const gitignorePath = path.join(CWD, '.gitignore');
          await fs.writeFile(gitignorePath, TAYLORED_DIR_NAME + '\n');
          execSync(`git add .gitignore`, { cwd: CWD, ...execOpts });

          const currentFileLines = (
            await fs.readFile(originalFilePath, 'utf-8')
          ).split('\n');
          currentFileLines.splice(startLineNum - 1, matchLinesCount);
          await fs.writeFile(originalFilePath, currentFileLines.join('\n'));
          execSync(`git add "${originalFilePath}"`, { cwd: CWD, ...execOpts });
          execSync(
            `git commit -m "Temporary: Remove block ${numero} from ${path.basename(originalFilePath)}"`,
            { cwd: CWD, ...execOpts },
          );

          // Generate diff against originalBranchName for non-compute blocks
          const relativeOriginalFilePath = path.relative(CWD, originalFilePath);
          const diffCommand = `git diff --exit-code "${originalBranchName}" HEAD -- "${relativeOriginalFilePath}"`;
          let diffContentForFile = ''; // Default to empty if no diff

          try {
            execSync(diffCommand, {
              cwd: CWD,
              encoding: 'utf8',
              stdio: 'pipe',
            });
            // No diff found (exit code 0)
          } catch (e: any) {
            if (e.status === 1 && typeof e.stdout === 'string') {
              diffContentForFile = e.stdout; // Differences found
            } else {
              console.error(
                `CRITICAL ERROR: Failed to generate diff for non-compute block ${numero} (removal vs original branch '${originalBranchName}').`,
              );
              if (e.message) console.error(`  Error message: ${e.message}`);
              if (e.stderr)
                console.error('  STDERR:\n' + e.stderr.toString().trim());
              if (e.stdout)
                console.error('  STDOUT:\n' + e.stdout.toString().trim());
              throw e;
            }
          }

          const analysis = analyzeDiffContent(diffContentForFile);
          if (!analysis.success) {
            console.error(
              `CRITICAL ERROR: Failed to analyze diff content for non-compute block ${numero}. ${analysis.errorMessage}`,
            );
            throw new Error(
              `Diff analysis failed for non-compute block ${numero}.`,
            );
          }

          if (
            analysis.isPure &&
            analysis.deletions > 0 &&
            analysis.additions === 0
          ) {
            await fs.writeFile(targetTayloredFilePath, diffContentForFile);
            console.log(
              `Successfully created ${targetTayloredFilePath} for block ${numero} from ${originalFilePath} (block removal vs original branch '${originalBranchName}')`,
            );
          } else if (
            analysis.isPure &&
            analysis.additions === 0 &&
            analysis.deletions === 0
          ) {
            await fs.writeFile(targetTayloredFilePath, '');
            console.log(
              `Block removal for ${numero} in ${originalFilePath} resulted in no textual changes against original branch '${originalBranchName}'. Empty taylored file created: ${targetTayloredFilePath}`,
            );
          } else {
            console.error(
              `CRITICAL ERROR: Diff for non-compute block ${numero} (removal vs original branch '${originalBranchName}') was not as expected (purely deletions or no change).`,
            );
            console.error(
              `  Additions: ${analysis.additions}, Deletions: ${analysis.deletions}, IsPure: ${analysis.isPure}`,
            );
            // Avoid printing huge diffs to console
            const maxDiffPreviewLength = 1000;
            const diffPreview =
              diffContentForFile.length > maxDiffPreviewLength
                ? diffContentForFile.substring(0, maxDiffPreviewLength) +
                  '\n... (diff truncated)'
                : diffContentForFile;
            if (diffContentForFile.trim())
              console.error(`  Diff content:\n${diffPreview}`);
            throw new Error(
              `Unexpected diff characteristics for non-compute block ${numero}.`,
            );
          }
          totalBlocksProcessed++;
        } catch (error: any) {
          console.error(
            `CRITICAL ERROR: Failed to process block ${numero} from ${originalFilePath}.`,
          );
          if (
            error.message &&
            !error.message.includes('Unexpected diff characteristics')
          )
            console.error(`Error message: ${error.message}`); // Avoid duplicate message
          // STDERR/STDOUT might be from a command that failed before diffing
          throw error;
        } finally {
          try {
            execSync(`git checkout "${originalBranchName}"`, {
              cwd: CWD,
              stdio: 'ignore',
            });
          } catch (checkoutError: any) {
            console.warn(
              `Warning: Failed to checkout original branch '${originalBranchName}' during cleanup. May require manual cleanup. ${checkoutError.message}`,
            );
          }
          try {
            execSync(`git branch -D "${tempBranchName}"`, {
              cwd: CWD,
              stdio: 'ignore',
            });
          } catch (deleteBranchError: any) {
            console.warn(
              `Warning: Failed to delete temporary branch '${tempBranchName}' during cleanup. May require manual cleanup. ${deleteBranchError.message}`,
            );
          }
        }
      } // This closes the `if (computeCharsToStrip !== undefined)` block, NOT the `else` for non-compute
    }
  }

  if (asyncScriptPromises.length > 0) {
    console.log(
      `Executing ${asyncScriptPromises.length} asynchronous compute block(s) in parallel...`,
    );
    const results = await Promise.allSettled(asyncScriptPromises);
    let succeededCount = 0;
    let failedCount = 0;
    results.forEach((result, index) => {
      // Construct a more informative block identifier if possible.
      // This requires access to 'numero' which is not directly in scope here.
      // For now, using index.
      const blockIdentifier = `async block (index ${index})`; // Placeholder
      if (result.status === 'fulfilled') {
        console.log(
          `Asynchronous task for ${blockIdentifier} completed successfully.`,
        );
        succeededCount++;
      } else {
        console.error(
          `Asynchronous task for ${blockIdentifier} failed: ${result.reason}`,
        );
        failedCount++;
      }
    });
    console.log(
      `All asynchronous tasks have completed. Succeeded: ${succeededCount}, Failed: ${failedCount}.`,
    );
  }

  if (totalBlocksProcessed === 0) {
    console.log(
      'No taylored blocks found matching the criteria in any of the scanned files.',
    );
  } else {
    if (asyncScriptPromises.length > 0) {
      // Message when async operations were involved
      console.log(
        `Finished processing. Initiated ${totalBlocksProcessed} taylored block(s). See async summary for completion details.`,
      );
    } else {
      // Original message for purely synchronous operations
      console.log(
        `Finished processing. Successfully created ${totalBlocksProcessed} taylored file(s).`,
      );
    }
  }
}

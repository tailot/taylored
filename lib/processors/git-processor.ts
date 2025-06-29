// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import * as fs from 'fs/promises';
import * as path from 'path';
import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { ParsedBlock } from '../parsers/block-parser';
import { GitOperationError } from '../errors';
import { TAYLORED_DIR_NAME } from '../constants'; // For .gitignore content

const execOpts: ExecSyncOptionsWithStringEncoding = { encoding: 'utf8', stdio: 'pipe' };

export class GitProcessor {
  private cwd: string;
  private originalBranchName: string;

  constructor(cwd: string, originalBranchName: string) {
    this.cwd = cwd;
    this.originalBranchName = originalBranchName;
  }

  private runGitCommand(command: string, errorMessagePrefix: string): string {
    try {
      return execSync(command, { cwd: this.cwd, ...execOpts });
    } catch (error: any) {
      const stderr = error.stderr ? error.stderr.toString().trim() : 'N/A';
      const stdout = error.stdout ? error.stdout.toString().trim() : 'N/A';
      const fullMessage = `${errorMessagePrefix}: ${error.message}. Command: "${command}". Stderr: ${stderr}. Stdout: ${stdout}`;
      // console.error(fullMessage); // Logging can be done by the caller or a higher-level error handler
      throw new GitOperationError(fullMessage, command, stderr);
    }
  }

  private async ensureGitignore(): Promise<void> {
    const gitignorePath = path.join(this.cwd, '.gitignore');
    let gitignoreContent = '';
    try {
        gitignoreContent = await fs.readFile(gitignorePath, 'utf-8');
    } catch (e:any) {
        if (e.code !== 'ENOENT') throw e; // re-throw if not a "file not found" error
    }

    if (!gitignoreContent.includes(TAYLORED_DIR_NAME)) {
        await fs.appendFile(gitignorePath, `\n# Taylored directory\n${TAYLORED_DIR_NAME}/\n`);
        this.runGitCommand(`git add .gitignore`, 'Failed to stage .gitignore');
        // Committing .gitignore here might be too broad if other changes are staged.
        // The original code added .gitignore on the temp branch and committed it there.
        // This approach modifies .gitignore on the originalBranchName if not already configured.
        // For now, let's stick to adding it, the commit will happen on the temp branch.
    }
  }


  /**
   * Creates a patch for a static Taylored block.
   * The patch represents the addition of the block to the original branch.
   * Workflow:
   * 1. Create a temporary branch from the current original branch.
   * 2. On this temp branch, remove the Taylored block from the source file.
   * 3. Commit this removal.
   * 4. Generate a diff between this temporary commit (block removed) and the original branch (block present).
   *    This diff effectively shows the "addition" of the block.
   * @param block The parsed static block.
   * @returns The content of the generated patch.
   */
  public async createStaticPatch(block: ParsedBlock): Promise<string> {
    const blockNumber = block.attributes.number;
    const relativeFilePath = path.relative(this.cwd, block.filePath);
    const tempBranchName = `temp-taylored-static-${blockNumber}-${Date.now()}`;

    try {
      this.runGitCommand(`git checkout -b "${tempBranchName}" "${this.originalBranchName}"`, `Failed to create temporary branch ${tempBranchName}`);

      // Ensure .taylored is in .gitignore on the temp branch
      const gitignorePath = path.join(this.cwd, '.gitignore');
      await fs.writeFile(gitignorePath, TAYLORED_DIR_NAME + '/\n'); // Overwrite/create for simplicity on temp branch
      this.runGitCommand(`git add .gitignore`, `Failed to stage .gitignore on ${tempBranchName}`);

      const fileContentOnTempBranch = await fs.readFile(block.filePath, 'utf-8');
      const contentWithoutBlock = fileContentOnTempBranch.replace(block.fullMatch, '');
      await fs.writeFile(block.filePath, contentWithoutBlock);

      this.runGitCommand(`git add "${relativeFilePath}"`, `Failed to stage file changes for block ${blockNumber} on ${tempBranchName}`);
      this.runGitCommand(`git commit -m "AUTO: Temp remove static block ${blockNumber} for diff generation from ${path.basename(block.filePath)}"`, `Failed to commit removal of block ${blockNumber} on ${tempBranchName}`);

      // Diff HEAD (block removed) against originalBranchName (block present)
      // This will show the block as an ADDITION, which is what we want for the patch.
      const diffCommand = `git diff --exit-code "${this.originalBranchName}" HEAD -- "${relativeFilePath}"`;
      let patchContent = "";
      try {
        this.runGitCommand(diffCommand, `Diff command itself failed unexpectedly for static block ${blockNumber}`);
        // If runGitCommand doesn't throw, it means no diff, which is unusual but possible if block.fullMatch was empty or somehow already not there.
      } catch (error: any) {
        if (error instanceof GitOperationError && error.message.includes('exited with code 1')) { // Expected for diffs
           patchContent = error.stdout || ""; // error.stdout should contain the diff
           if (!patchContent && error.message.includes('exited with code 1')) {
             // This case might happen if git diff exits 1 but stdout is empty.
             // However, execSync with stdio:pipe should capture stdout.
             // If truly empty, it means no textual changes.
           }
        } else {
          throw error; // Re-throw unexpected GitOperationError or other errors
        }
      }
      return patchContent;
    } finally {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.cwd, ...execOpts }).trim();
      if (currentBranch === tempBranchName) {
        this.runGitCommand(`git checkout -q "${this.originalBranchName}"`, `Failed to checkout original branch during cleanup of ${tempBranchName}`);
      }
      try {
        this.runGitCommand(`git branch -q -D "${tempBranchName}"`, `Failed to delete temporary branch ${tempBranchName}`);
      } catch (e: any) {
        // Log and ignore if deletion fails, as checkout to original is more critical
        console.warn(`Warning: Failed to delete temporary branch '${tempBranchName}' during cleanup. May require manual cleanup. Error: ${e.message}`);
      }
    }
  }

  /**
   * Creates a patch for a computed Taylored block.
   * The patch represents the changes needed to apply the computed content to a target branch.
   * Workflow:
   * 1. Create a temporary branch from the original branch.
   * 2. On this temp branch, replace the Taylored block with the computed content.
   * 3. Commit this replacement.
   * 4. Generate a diff between this temporary commit and the specified target branch.
   * @param block The parsed computed block.
   * @param computedContent The result of the script execution.
   * @param targetBranch The branch against which to diff the computed changes.
   * @returns The content of the generated patch.
   */
  public async createComputedPatch(block: ParsedBlock, computedContent: string, targetBranch: string): Promise<string> {
    const blockNumber = block.attributes.number;
    const relativeFilePath = path.relative(this.cwd, block.filePath);
    const tempBranchName = `temp-taylored-computed-${blockNumber}-${Date.now()}`;

    try {
      this.runGitCommand(`git checkout -b "${tempBranchName}" "${this.originalBranchName}"`, `Failed to create temporary branch ${tempBranchName} for computed block`);

      const gitignorePath = path.join(this.cwd, '.gitignore');
      await fs.writeFile(gitignorePath, TAYLORED_DIR_NAME + '/\n');
      this.runGitCommand(`git add .gitignore`, `Failed to stage .gitignore on ${tempBranchName}`);

      const fileContentOnTempBranch = await fs.readFile(block.filePath, 'utf-8');
      const contentWithComputedResult = fileContentOnTempBranch.replace(block.fullMatch, computedContent);
      await fs.writeFile(block.filePath, contentWithComputedResult);

      this.runGitCommand(`git add "${relativeFilePath}"`, `Failed to stage file changes for computed block ${blockNumber} on ${tempBranchName}`);
      this.runGitCommand(`git commit --no-verify -m "AUTO: Apply computed block ${blockNumber} for ${path.basename(block.filePath)}"`, `Failed to commit application of computed block ${blockNumber} on ${tempBranchName}`);

      const diffCommand = `git diff --exit-code "${targetBranch}" HEAD -- "${relativeFilePath}"`;
      let patchContent = "";
      try {
        // If no diff, execSync will complete normally, and stdout will be empty.
        const diffOutput = this.runGitCommand(diffCommand, `Diff command itself failed unexpectedly for computed block ${blockNumber}`);
        patchContent = diffOutput; // This will be empty if no diff
        if (!patchContent) {
             console.log(`No difference found for computed block ${blockNumber} from ${block.filePath} when compared against branch '${targetBranch}'. Empty patch content generated.`);
        }
      } catch (error: any) {
         if (error instanceof GitOperationError && error.message.includes('exited with code 1')) { // Expected for diffs
           patchContent = error.stdout || "";
         } else {
          throw error;
        }
      }
      return patchContent;
    } finally {
      const currentBranch = execSync('git rev-parse --abbrev-ref HEAD', { cwd: this.cwd, ...execOpts }).trim();
      if (currentBranch === tempBranchName) {
        this.runGitCommand(`git checkout -q "${this.originalBranchName}"`, `Failed to checkout original branch during cleanup of ${tempBranchName}`);
      }
      try {
        this.runGitCommand(`git branch -q -D "${tempBranchName}"`, `Failed to delete temporary branch ${tempBranchName}`);
      } catch (e: any) {
        console.warn(`Warning: Failed to delete temporary branch '${tempBranchName}' during cleanup. May require manual cleanup. Error: ${e.message}`);
      }
    }
  }
}

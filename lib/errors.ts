// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

/**
 * Custom error for issues encountered during script execution.
 */
export class ScriptExecutionError extends Error {
  public stdout?: string;
  public stderr?: string;
  public exitCode?: number | null;

  constructor(message: string, stdout?: string, stderr?: string, exitCode?: number | null) {
    super(message);
    this.name = 'ScriptExecutionError';
    this.stdout = stdout;
    this.stderr = stderr;
    this.exitCode = exitCode;
    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ScriptExecutionError.prototype);
  }
}

/**
 * Custom error for CLI usage issues.
 */
export class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CliUsageError';
    Object.setPrototypeOf(this, CliUsageError.prototype);
  }
}

/**
 * Custom error for patch purity issues (mixed additions/deletions).
 */
export class PatchPurityError extends Error {
  public details: { additions: number; deletions: number };
  constructor(message: string, details: { additions: number; deletions: number }) {
    super(message);
    this.name = 'PatchPurityError';
    this.details = details;
    Object.setPrototypeOf(this, PatchPurityError.prototype);
  }
}

/**
 * Custom error for file not found issues.
 */
export class FileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FileNotFoundError';
    Object.setPrototypeOf(this, FileNotFoundError.prototype);
  }
}

/**
 * Custom error for backend setup issues.
 */
export class BackendSetupError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'BackendSetupError';
        Object.setPrototypeOf(this, BackendSetupError.prototype);
    }
}

/**
 * Custom error for issues encountered during the purchase process.
 */
export class PurchaseError extends Error {
    public assistanceMessage: string;
    constructor(message: string, assistanceMessage: string) {
        super(message);
        this.name = 'PurchaseError';
        this.assistanceMessage = assistanceMessage;
        Object.setPrototypeOf(this, PurchaseError.prototype);
    }
}

// Other error classes will be added here as per the plan.

/**
 * Custom error for issues encountered during Git operations.
 */
export class GitOperationError extends Error {
  public command?: string;
  public stderr?: string; // Ensure stderr is part of the constructor and properties

  constructor(message: string, command?: string, stderr?: string) {
    super(message);
    this.name = 'GitOperationError';
    this.command = command;
    this.stderr = stderr;
    Object.setPrototypeOf(this, GitOperationError.prototype);
  }
}

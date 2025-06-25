// lib/handlers/upgrade-handler.ts
// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

import { upgradePatch } from '../git-patch-upgrader';
import { resolveTayloredFileName } from '../utils';
import { TAYLORED_FILE_EXTENSION } from '../constants';

export async function handleUpgradeCommand(
    userInputFileName: string, // Can be with or without .taylored extension
    CWD: string,
    branchName?: string
): Promise<void> {
    // Ensure the resolved name is just the filename, not a path,
    // as upgradePatch will construct the full path.
    let resolvedTayloredFileName = resolveTayloredFileName(userInputFileName);
    if (resolvedTayloredFileName.includes('/') || resolvedTayloredFileName.includes('\\')) {
        // This case should ideally be caught by index.ts, but as a safeguard:
        console.error(`CRITICAL ERROR: Invalid taylored file name '${userInputFileName}'. It must be a simple filename.`);
        process.exit(1);
    }

    // The `patchFileName` argument for `upgradePatch` expects just the name like "my_patch.taylored"
    // and it will construct the path within TAYLORED_DIR_NAME itself.

    try {
        const result = await upgradePatch(resolvedTayloredFileName, CWD, branchName);

        if (result.upgraded) {
            console.log(result.message); // e.g., "Patch 'file.taylored' has been surgically updated."
        } else {
            // Handle cases where it wasn't upgraded but also not a critical file system error
            if (result.message.startsWith('CRITICAL ERROR:')) {
                console.error(`\n${result.message}`);
                // console.error(`  Failed to process upgrade for '${resolvedTayloredFileName}'.`); // Message from upgradePatch is usually sufficient
                process.exit(1);
            } else {
                 console.log(result.message); // e.g., "Patch 'file.taylored' is already up-to-date..."
            }
        }
    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: Failed to process upgrade for '${resolvedTayloredFileName}'.`);
        // Check if error is an object and has a message property
        const errorMessage = (typeof error === 'object' && error !== null && 'message' in error)
            ? String(error.message)
            : String(error);
        console.error(`  Error: ${errorMessage}`);
        if (typeof error === 'object' && error !== null && 'stack' in error && typeof error.stack === 'string') {
            // console.error(`  Stack: ${error.stack}`); // Optional: for more detailed debugging
        }
        process.exit(1);
    }
}

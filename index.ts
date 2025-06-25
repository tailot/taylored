import * as fs from 'fs-extra';
import * as path from 'path';
import { TAYLORED_DIR_NAME, VERSION } from './lib/constants';
import { applyPatch, applyAllPatches } from './lib/apply-logic'; // These will be implemented in apply-logic.ts
import { handleSaveOperation } from './lib/handlers/save-handler';
import { handleListOperation } from './lib/handlers/list-handler';
import { handleOffsetCommand } from './lib/handlers/offset-handler';
import { handleAutomaticCommand } from './lib/handlers/automatic-handler';
import { handleCreateTaysell as handleCreateTaysellCommand } from './lib/handlers/create-taysell-handler';
import { handleBuyCommand } from './lib/handlers/buy-handler';
import { handleSetupBackend as handleSetupBackendCommand } from './lib/handlers/setup-backend-handler';
import { handleUpgradeCommand } from './lib/handlers/upgrade-handler';

function printUsageAndExit(error?: string): void {
    if (error) {
        console.error(`\n${error}`);
    }
    console.log(`
    Usage: taylored <command> [options]

    Commands:
      --add <taylored_file_name>...   Applies one or more taylored patches.
      --remove <taylored_file_name>... Reverts one or more taylored patches.
      --save <branch_name>            Saves changes from a branch into a .taylored file.
      --list                          Lists all available .taylored files.
      --offset <taylored_file_name>   Updates patch file to match current code shifts.
      --upgrade <taylored_file_name> [base_branch]
                                      Upgrades a pure patch with new content, preserving its structure.
      --automatic [base_branch]       Analyzes the repo and suggests actions.
      --version                       Displays the current version.
      --help                          Displays this help message.

    Examples:
      taylored --add feature-x.taylored
      taylored --save new-feature-branch
      taylored --upgrade old-config.taylored main
    `);
    process.exit(1);
}

async function main(): Promise<void> {
    const CWD = process.cwd();
    const args = process.argv.slice(2);
    const rawArgs = process.argv.slice(2);

    if (rawArgs.includes('--version')) {
        console.log(`taylored version: ${VERSION}`);
        return;
    }
    if (rawArgs.includes('--help') || rawArgs.length === 0) {
        printUsageAndExit();
    }

    const tayloredDir = path.join(CWD, TAYLORED_DIR_NAME);
    if (!fs.existsSync(tayloredDir) && args[0] !== '--init' && args[0] !== '--setup-backend') {
        console.error('CRITICAL ERROR: .taylored directory not found. Please run "taylored --init" in the root of your git repository.');
        process.exit(1);
    }

    let mode = args.shift() || 'add';
    let argument: string | undefined;
    let branchName: string | undefined;
    
    try {
        if (mode === '--save') {
            if (rawArgs.length < 2) {
                printUsageAndExit("CRITICAL ERROR: --save option requires a <branch_name> argument.");
            }
            argument = rawArgs[1];
            await handleSaveOperation(argument, CWD);
        }
        else if (mode === '--offset') {
            if (rawArgs.length < 2) {
                printUsageAndExit("CRITICAL ERROR: --offset option requires a <taylored_file_name> argument.");
            }
            argument = rawArgs[1];
            await handleOffsetCommand(argument, CWD);
        }
        else if (mode === '--list') {
            await handleListOperation(CWD);
        }
        else if (mode === '--automatic') {
            branchName = rawArgs.length > 1 && !rawArgs[1].startsWith('--') ? rawArgs[1] : undefined;
            await handleAutomaticCommand(CWD, branchName);
        }
        else if (mode === '--upgrade') {
            if (rawArgs.length < 2) {
                printUsageAndExit("CRITICAL ERROR: --upgrade option requires at least one <taylored_file_name> argument.");
            }
            argument = rawArgs[1];
            if (argument.startsWith('--')) {
                printUsageAndExit(`CRITICAL ERROR: Invalid taylored file name '${argument}' for --upgrade.`);
            }
            
            branchName = undefined;
            if (rawArgs.length > 2 && !rawArgs[2].startsWith('--')) {
                branchName = rawArgs[2];
            }
            
            await handleUpgradeCommand(argument, CWD, branchName);
        }
        else {
            const isAddMode = mode === '--add' || ![ '--remove'].includes(mode);
            const patchFiles = args.filter(arg => !arg.startsWith('--'));
             if (patchFiles.length === 0 && mode !== 'add' && mode !=='--add') {
                 printUsageAndExit(`CRITICAL ERROR: Command ${mode} requires at least one <taylored_file_name> argument.`);
            }

            if (patchFiles.length > 0) {
                await applyPatch(patchFiles, CWD, isAddMode);
            } else {
                 await applyAllPatches(CWD, true); 
            }
        }
    } catch (error: any) {
        console.error(`\nCRITICAL ERROR: ${error.message}`);
        if (error.stack) {
            console.error(error.stack);
        }
        process.exit(1);
    }
}

main();

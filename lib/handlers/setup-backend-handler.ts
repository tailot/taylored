// lib/handlers/setup-backend-handler.ts
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
// import inquirer from 'inquirer'; // No longer directly needed
import { promptOrUseDefaults } from '../utils'; // Import the new helper

/**
 * Handles the 'setup-backend' command.
 * This function sets up the Taysell "Backend-in-a-Box" by:
 * 1. Checking if the destination directory ('taysell-server') exists. If so, it prompts
 *    the user for confirmation to overwrite (unless in a test environment, where it overwrites).
 * 2. Copying the backend template files from the 'templates/backend-in-a-box' directory
 *    to the 'taysell-server' directory in the current working directory.
 * 3. Interactively prompting the user for essential configuration details (PayPal credentials,
 *    server URL, encryption key, port). In a test environment, it uses predefined default values.
 * 4. Generating a .env file in the 'taysell-server' directory with the collected configuration.
 * 5. Printing instructions for the user on how to build and run the backend server,
 *    unless in a test environment.
 *
 * @param {string} cwd - The current working directory where the 'taysell-server' will be created.
 */
export async function handleSetupBackend(cwd: string): Promise<void> {
    console.log('Starting Taysell backend setup...');

    const backendDestPath = path.join(cwd, 'taysell-server');
    const overwriteQuestion = [
        {
            type: 'confirm',
            name: 'overwrite',
            message: `The directory ${backendDestPath} already exists. Do you want to overwrite its contents?`,
            default: false,
        },
    ];
    const defaultOverwriteAnswers = { overwrite: true }; // In test, always overwrite

    // 2. Copy "Backend-in-a-Box" template files
    try {
        const templateSourcePath = path.resolve(__dirname, '../../templates/backend-in-a-box');

        if (!(await fs.pathExists(templateSourcePath))) {
            console.error(`CRITICAL ERROR: Backend template source directory not found at ${templateSourcePath}`);
            process.exit(1);
        }

        if (await fs.pathExists(backendDestPath)) {
            const { overwrite } = await promptOrUseDefaults(overwriteQuestion, defaultOverwriteAnswers);
            if (!overwrite) {
                console.log('Backend setup aborted by user.');
                return;
            }
            await fs.emptyDir(backendDestPath);
        } else {
            await fs.ensureDir(backendDestPath);
        }

        await fs.copy(templateSourcePath, backendDestPath);
        console.log(`Backend template files copied to ${backendDestPath}`);
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Could not copy backend template files. Details: ${error.message}`);
        process.exit(1);
    }

    // 3. Interactive wizard for configuration
    const questions = [
        {
            type: 'list',
            name: 'paypalEnv',
            message: 'Select PayPal environment:',
            choices: ['sandbox', 'production'],
        },
        {
            type: 'input',
            name: 'paypalClientId',
            message: 'Enter your PayPal Client ID:',
            validate: (input: string) => input.trim() !== '' || 'Client ID cannot be empty.',
        },
        {
            type: 'password',
            name: 'paypalClientSecret',
            message: 'Enter your PayPal Client Secret:',
            validate: (input: string) => input.trim() !== '' || 'Client Secret cannot be empty.',
        },
        {
            type: 'input',
            name: 'serverPublicUrl',
            message: 'Enter the public URL of your server (e.g., https://example.com):',
            validate: (input: string) => {
                if (input.trim() === '') return 'Server URL cannot be empty.';
                try {
                    const url = new URL(input);
                    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
                        return 'URL must start with http:// or https://';
                    }
                    return true;
                } catch (_) {
                    return 'Invalid URL format.';
                }
            },
        },
        {
            type: 'password',
            name: 'patchEncryptionKey',
            message: 'Enter a strong encryption key for your patches (at least 32 characters):',
            validate: (input: string) =>
                input.trim().length >= 32 || 'Encryption key must be at least 32 characters long.',
        },
        {
            type: 'input',
            name: 'serverPort',
            message: 'Enter the local port the backend server should run on (e.g., 3000):',
            default: '3000',
            validate: (input: string) => {
                const port = parseInt(input, 10);
                return (port > 0 && port < 65536) || 'Invalid port number.';
            },
        },
    ];

    const defaultAnswers = {
        paypalEnv: 'sandbox',
        paypalClientId: 'test-client-id',
        paypalClientSecret: 'test-client-secret',
        serverPublicUrl: 'https://test.example.com',
        patchEncryptionKey: 'test-encryption-key-that-is-32-characters-long',
        serverPort: '3001',
    };

    const answers = await promptOrUseDefaults(questions, defaultAnswers);

    // 4. Write to .env file
    const envContent = `
# Node.js Environment
NODE_ENV=production

# Server Configuration
SERVER_BASE_URL=${answers.serverPublicUrl}
PORT=${answers.serverPort}

# PayPal Configuration
PAYPAL_ENVIRONMENT=${answers.paypalEnv}
PAYPAL_CLIENT_ID=${answers.paypalClientId}
PAYPAL_CLIENT_SECRET=${answers.paypalClientSecret}

# Patch Encryption
PATCH_ENCRYPTION_KEY=${answers.patchEncryptionKey}

# Database Configuration (SQLite)
DB_PATH=./db/taysell.sqlite
`;
    const envPath = path.join(backendDestPath, '.env');
    try {
        await fs.writeFile(envPath, envContent.trim());
        console.log(`Successfully created .env file at ${envPath}`);
    } catch (error: any) {
        console.error(`CRITICAL ERROR: Could not write .env file at ${envPath}. Details: ${error.message}`);
        process.exit(1);
    }

    // 5. Provide deployment instructions
    if (!process.env.JEST_WORKER_ID) {
        console.log('\n--- Backend Setup Complete ---');
        console.log(`Configuration written to ${envPath}`);
        console.log(`Backend server files are in: ${backendDestPath}`);
        console.log('\nNext Steps:');
        console.log('1. Navigate to the backend directory:');
        console.log(`     cd ${path.relative(cwd, backendDestPath) || '.'}`);
        console.log('2. Build and run the backend using Docker Compose (recommended) or manually:');
        console.log('     docker-compose up --build -d  (for Docker)');
        console.log(
            `3. Your Taysell backend should be running and accessible via ${answers.serverPublicUrl} (if it maps to localhost:${answers.serverPort} or your server setup).`
        );
        console.log('   Check Docker logs if you encounter issues: docker-compose logs -f');
        console.log('\nFor more details, refer to the "Backend-in-a-Box" documentation (included in taysell-server).');
    }
}

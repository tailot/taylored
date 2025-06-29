// lib/handlers/setup-backend-handler.ts
// import * as child_process from 'child_process'; // Not used directly
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer'; // Importa inquirer
import { BackendSetupError, FileNotFoundError } from '../errors'; // Import custom errors

/**
 * Implements the `taylored setup-backend` command functionality.
 *
 * This function guides the user through setting up the "Backend-in-a-Box" server,
 * which is used for Taysell, the commercial patch distribution system. The setup
 * process involves:
 *
 * 1. **Template Copying**: Locates the `backend-in-a-box` template within the Taylored
 *    installation and copies it to a new `taysell-server/` directory in the current
 *    working directory (`CWD`). If `taysell-server/` already exists, it prompts the
 *    user for confirmation to overwrite (unless in a test environment).
 * 2. **Interactive Configuration (via Inquirer)**: Prompts the user for essential
 *    configuration details required for the backend server. These include:
 *    - PayPal environment (`sandbox` or `production`).
 *    - PayPal Client ID.
 *    - PayPal Client Secret.
 *    - PayPal Webhook ID.
 *    - The public URL where the Taysell server will be accessible.
 *    - A strong encryption key (at least 32 characters) for securing patches.
 *    - The local port number for the backend server.
 *    In test environments (when `process.env.JEST_WORKER_ID` is set), it bypasses
 *    prompts and uses predefined test values.
 * 3. **.env File Generation**: Creates a `.env` file in the `taysell-server/` directory,
 *    populating it with the configuration values collected from the user (or test defaults).
 *    This file is used by Docker Compose and the Node.js server to configure the backend.
 * 4. **User Instructions**: Prints instructions to the console on how to build and run
 *    the newly configured backend server using Docker Compose (recommended) and provides
 *    guidance for next steps.
 *
 * For more details on the `taylored setup-backend` command and the "Backend-in-a-Box"
 * features, refer to `DOCUMENTATION.md`.
 *
 * @async
 * @param {string} cwd - The current working directory where the `taysell-server/`
 *                       directory will be created.
 * @returns {Promise<void>} A promise that resolves when the setup process is complete
 *                          or if the user aborts the setup.
 * @throws {BackendSetupError | FileNotFoundError} Throws custom errors on failure.
 */
export async function handleSetupBackend(cwd: string): Promise<void> {
    console.log('Starting Taysell backend setup...');

    const backendDestPath = path.join(cwd, 'taysell-server');
    const templateSourcePath = path.resolve(
        __dirname,
        '../../templates/backend-in-a-box'
    );

    if (!await fs.pathExists(templateSourcePath)) {
        throw new FileNotFoundError(`Backend template source directory not found at ${templateSourcePath}`);
    }

    try {
        if (await fs.pathExists(backendDestPath)) {
            if (!process.env.JEST_WORKER_ID) { // Bypass prompt in test environment
                const { overwrite } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'overwrite',
                    message: `The directory ${backendDestPath} already exists. Do you want to overwrite its contents?`,
                    default: false,
                }]);
                if (!overwrite) {
                    console.log('Backend setup aborted by user.');
                    // This is a user choice, not an error, so we just return.
                    // The main handler in index.ts will simply exit cleanly.
                    return;
                }
            }
            // If overwrite is true or in test env, empty the directory
            await fs.emptyDir(backendDestPath);
        } else {
            // If directory doesn't exist, ensure it's created
            await fs.ensureDir(backendDestPath);
        }

        await fs.copy(templateSourcePath, backendDestPath);
        console.log(`Backend template files copied to ${backendDestPath}`);

    } catch (error: any) {
        // Catch errors from fs.emptyDir, fs.ensureDir, or fs.copy
        throw new BackendSetupError(`Could not prepare backend destination directory or copy template files. Details: ${error.message}`);
    }

    let answers;

    // Interactive configuration wizard
    if (process.env.JEST_WORKER_ID) {
        console.log('Running in test environment, using default config for .env');
        answers = {
            paypalEnv: 'sandbox',
            paypalClientId: 'test-client-id',
            paypalClientSecret: 'test-client-secret',
            paypalWebhookId: 'test-webhook-id',
            serverPublicUrl: 'https://test.example.com',
            patchEncryptionKey: 'test-encryption-key-that-is-32-characters-long',
            serverPort: '3001',
        };
    } else {
        try {
            answers = await inquirer.prompt([
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
                validate: input => input.trim() !== '' || 'Client ID cannot be empty.',
            },
            {
                type: 'password',
                name: 'paypalClientSecret',
                message: 'Enter your PayPal Client Secret:',
                validate: input => input.trim() !== '' || 'Client Secret cannot be empty.',
            },
            // Added prompt for Webhook ID
            {
                type: 'password',
                name: 'paypalWebhookId',
                message: 'Enter your PayPal Webhook ID:',
                validate: input => input.trim() !== '' || 'Webhook ID cannot be empty.',
            },
            {
                type: 'input',
                name: 'serverPublicUrl',
                message: 'Enter the public URL of your server (e.g., https://example.com):',
                validate: input => {
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
                validate: input => input.trim().length >= 32 || 'Encryption key must be at least 32 characters long.',
            },
            {
                type: 'input',
                name: 'serverPort',
                message: 'Enter the local port the backend server should run on (e.g., 3000):',
                default: '3000',
                validate: input => {
                    const port = parseInt(input, 10);
                    return port > 0 && port < 65536 || 'Invalid port number.';
                }
            }
        ]);
    }

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
PAYPAL_WEBHOOK_ID=${answers.paypalWebhookId}

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
        console.log('\\n--- Backend Setup Complete ---');
        console.log(`Configuration written to ${envPath}`);
        console.log(`Backend server files are in: ${backendDestPath}`);
        console.log('\\nNext Steps:');
        console.log('1. Navigate to the backend directory:');
        console.log(`     cd ${path.relative(cwd, backendDestPath) || '.'}`);
        console.log('2. Build and run the backend using Docker Compose (recommended) or manually:');
        console.log('     docker-compose up --build -d  (for Docker)');
        console.log(`3. Your Taysell backend should be running and accessible via ${answers.serverPublicUrl} (if it maps to localhost:${answers.serverPort} or your server setup).`);
        console.log('   Check Docker logs if you encounter issues: docker-compose logs -f');
        console.log('\\nFor more details, refer to the "Backend-in-a-Box" documentation (included in taysell-server).');
    }
}
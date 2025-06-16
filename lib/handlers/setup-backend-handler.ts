// Copyright (c) 2025 tailot@gmail.com
// SPDX-License-Identifier: MIT

// lib/handlers/setup-backend-handler.ts
import * as child_process from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import inquirer from 'inquirer'; // Import inquirer

export async function handleSetupBackend(cwd: string): Promise<void> {
    console.log('Starting Taysell backend setup...');

    // 1. Check for Docker installation (already implemented)
    try {
        child_process.execSync('docker --version', { stdio: 'ignore' });
        console.log('Docker is installed.');
    } catch (error) {
        console.error('CRITICAL ERROR: Docker is not installed. Please install Docker and try again.');
        process.exit(1);
    }

    const backendDestPath = path.join(cwd, 'taysell-server');

    // 2. Copy "Backend-in-a-Box" template files
    try {
        // Determine the source path of the templates
        // This needs to work both in development (ts-node) and in production (dist/)
        const isDev = __filename.endsWith('.ts');
        const templateSourcePath = path.resolve(
            __dirname, // For 'dist/lib/handlers' or 'lib/handlers'
            isDev ? '../../templates/backend-in-a-box' : '../../../templates/backend-in-a-box'
        );

        if (!await fs.pathExists(templateSourcePath)) {
            console.error(`CRITICAL ERROR: Backend template source directory not found at ${templateSourcePath}`);
            process.exit(1);
        }

        if (await fs.pathExists(backendDestPath)) {
            const { overwrite } = await inquirer.prompt([{
                type: 'confirm',
                name: 'overwrite',
                message: `The directory ${backendDestPath} already exists. Do you want to overwrite its contents?`,
                default: false,
            }]);
            if (!overwrite) {
                console.log('Backend setup aborted by user.');
                return;
            }
            // Optionally, add a backup mechanism here before removing
            await fs.emptyDir(backendDestPath); // Clear directory if user confirms overwrite
        } else {
            await fs.ensureDir(backendDestPath);
        }

        await fs.copy(templateSourcePath, backendDestPath);
        console.log(`Backend template files copied to ${backendDestPath}`);

    } catch (error: any) {
        console.error(`CRITICAL ERROR: Could not copy backend template files. Details: ${error.message}`);
        process.exit(1);
    }

    // 3. Interactive wizard for configuration (already implemented and refined)
    const answers = await inquirer.prompt([
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

    // 4. Write to .env file (already implemented and refined)
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

    // 5. Provide deployment instructions (already implemented and refined)
    console.log('\n--- Backend Setup Complete ---');
    console.log(`Configuration written to ${envPath}`);
    console.log(`Backend server files are in: ${backendDestPath}`);
    console.log('\nNext Steps:');
    console.log('1. Navigate to the backend directory:');
    console.log(`     cd ${path.relative(cwd, backendDestPath) || '.'}`);
    console.log('2. Build and run the backend using Docker Compose:');
    console.log('     docker-compose up --build -d');
    console.log(`3. Your Taysell backend should be running and accessible via ${answers.serverPublicUrl} (if it maps to localhost:${answers.serverPort} or your server setup).`);
    console.log('   Check Docker logs if you encounter issues: docker-compose logs -f');
    console.log('\nFor more details, refer to the "Backend-in-a-Box" documentation (included in taysell-server).');
}

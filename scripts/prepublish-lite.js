#!/usr/bin/env node
// scripts/prepublish-lite.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running pre-publish steps for lite version...');

const commands = [
  'npx ts-node index.ts --automatic ts main --exclude tests,node_modules',
  'npx ts-node index.ts --add 9002',
  'npx ts-node index.ts --add 9003',
  'npx ts-node index.ts --add 9001',
  'npx ts-node index.ts --remove filesell',
  'npx ts-node index.ts --remove scripts',
  'npx ts-node index.ts --remove lite',
  'tsc'
];

try {
  commands.forEach(cmd => {
    console.log(`Executing: ${cmd}`);
    execSync(cmd, { stdio: 'inherit' });
  });
} catch (error) {
  console.error('A command failed during the pre-publish process. Aborting.');
  process.exit(1);
}


console.log('Modifying package.json for lite publish...');
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Modifica il nome e il binario per la versione lite
pkg.name = 'taylo';
pkg.bin = { 'taylo': 'dist/index.js' };

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));

console.log('Pre-publish for lite complete. package.json has been updated for "taylo".');

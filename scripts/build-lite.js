#!/usr/bin/env node
// scripts/build-lite.js
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('Running TypeScript compiler for lite build...');
try {
  execSync('tsc', { stdio: 'inherit' });
} catch (error) {
  console.error('TypeScript compilation failed. Aborting lite build.');
  process.exit(1);
}


console.log('Cleaning up files for lite distribution...');
const filesToRemove = [
  'dist/templates',
  'dist/lib/handlers/setup-backend-handler.js',
  'dist/lib/handlers/setup-backend-handler.d.ts',
  'dist/lib/handlers/create-taysell-handler.js',
  'dist/lib/handlers/create-taysell-handler.d.ts',
  'dist/lib/handlers/buy-handler.js',
  'dist/lib/handlers/buy-handler.d.ts',
  'dist/lib/taysell-utils.js',
  'dist/lib/taysell-utils.d.ts'
];

filesToRemove.forEach(p => {
  const fullPath = path.resolve(__dirname, '..', p);
  if (fs.existsSync(fullPath)) {
    try {
      fs.rmSync(fullPath, { recursive: true, force: true });
      console.log(`Removed: ${p}`);
    } catch (e) {
      console.error(`Error removing ${p}:`, e);
    }
  } else {
    console.log(`Path not found, skipping removal: ${p}`);
  }
});

console.log('Lite build cleanup complete.');

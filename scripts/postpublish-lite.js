#!/usr/bin/env node
// scripts/postpublish-lite.js
const fs = require('fs');
const path = require('path');

console.log('Reverting package.json after lite publish...');
const packageJsonPath = path.resolve(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

// Ripristina il nome e il binario originali
pkg.name = 'taylored';
pkg.bin = { 'taylored': 'dist/index.js' };

fs.writeFileSync(packageJsonPath, JSON.stringify(pkg, null, 2));
console.log('package.json has been reverted to its original state for "taylored".');

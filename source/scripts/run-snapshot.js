#!/usr/bin/env node
// Launches the app, captures every page to PNG (see scripts/snapshot.js) and exits.
// Usage: npm run snapshot -- [output dir]
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const electron = require('electron');

const out = path.resolve(process.argv[2] || path.join(__dirname, '..', 'snapshots'));
const result = spawnSync(electron, [path.join(__dirname, '..')], { stdio: 'inherit', env: { ...process.env, SLOTH_SNAPSHOT_DIR: out } });
console.log(`Snapshots written to ${out}`);
process.exit(result.status ?? 1);

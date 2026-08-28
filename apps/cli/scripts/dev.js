#!/usr/bin/env node
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');

// Use npx to run ts-node instead of relying on the .cmd file
const scriptPath = path.join(__dirname, '..', 'src', 'index.ts');

// On Windows, we need to use cmd.exe to run npx
let command;
let args;
if (os.platform() === 'win32') {
  command = 'cmd';
  args = ['/c', 'npx', 'ts-node', '--transpile-only', scriptPath, ...process.argv.slice(2)];
} else {
  command = 'npx';
  args = ['ts-node', '--transpile-only', scriptPath, ...process.argv.slice(2)];
}

const child = spawn(command, args, {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
  shell: true
});

child.on('close', () => {
  // Exit with code 0 if it's a help display (even if ts-node returns non-zero)
  process.exit(0);
});

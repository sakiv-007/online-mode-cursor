#!/usr/bin/env node

/**
 * This is a convenience script to run the online game server from the main directory.
 * It ensures the server starts in the online-mode directory.
 */

const { spawn } = require('child_process');
const path = require('path');

// Get the directory where this script is located
const scriptDir = __dirname;

// Log the startup message
console.log('Starting BackbencherGames server...');
console.log('This server will run both the main website and online games on the same port.');
console.log('');
console.log('Access:');
console.log('- Main site: http://localhost:3000/');
console.log('- Online games: http://localhost:3000/?game=tictactoe');
console.log('');

// Check if we're running in dev mode
const isDev = process.argv.includes('--dev');

// Run the server using npm
const npmCommand = isDev ? 'run dev' : 'start';
const serverProcess = spawn('npm', npmCommand.split(' '), {
  cwd: scriptDir,
  shell: true,
  stdio: 'inherit'
});

// Handle server process events
serverProcess.on('error', (error) => {
  console.error(`Failed to start server: ${error.message}`);
  process.exit(1);
});

serverProcess.on('close', (code) => {
  if (code !== 0) {
    console.error(`Server process exited with code ${code}`);
  }
});

// Handle termination signals
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGINT');
});

process.on('SIGTERM', () => {
  console.log('Shutting down server...');
  serverProcess.kill('SIGTERM');
}); 
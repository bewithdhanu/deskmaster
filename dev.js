const { spawn } = require('child_process');
const path = require('path');

console.log('Starting development mode...');

// Start webpack in watch mode
const webpack = spawn('webpack', ['--mode', 'development', '--watch'], {
  stdio: 'inherit',
  cwd: __dirname
});

// Start electron in development mode
const electron = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  cwd: __dirname
});

// Handle process cleanup
process.on('SIGINT', () => {
  console.log('\nShutting down development servers...');
  webpack.kill();
  electron.kill();
  process.exit(0);
});

webpack.on('close', (code) => {
  console.log(`Webpack process exited with code ${code}`);
});

electron.on('close', (code) => {
  console.log(`Electron process exited with code ${code}`);
});

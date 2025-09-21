const { spawn } = require('child_process');
const path = require('path');

console.log('Testing System Monitor Pro React Application...');

// Start the application
const electron = spawn('npm', ['start'], {
  stdio: 'inherit',
  cwd: __dirname
});

// Wait a bit for the app to start
setTimeout(() => {
  console.log('✅ Application should be running now!');
  console.log('📱 Check for:');
  console.log('   - Main window with React UI');
  console.log('   - Tray icon with live stats');
  console.log('   - System statistics display');
  console.log('   - Timezone functionality');
  console.log('');
  console.log('Press Ctrl+C to stop the application');
}, 3000);

// Handle process cleanup
process.on('SIGINT', () => {
  console.log('\n🛑 Stopping application...');
  electron.kill();
  process.exit(0);
});

electron.on('close', (code) => {
  console.log(`Application exited with code ${code}`);
});

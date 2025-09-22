const { execSync } = require('child_process');
const path = require('path');

console.log('Building React applications...');

try {
  // Build the React apps (main app and tray icon)
  execSync('webpack --mode production', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('✅ React apps built successfully!');
  console.log('📁 Built files are in the dist/ folder:');
  console.log('   - main.bundle.js (main application)');
  console.log('   - tray.bundle.js (tray icon)');
  console.log('   - about.bundle.js (about window)');
  console.log('   - index.html (main app)');
  console.log('   - tray-icon.html (tray icon)');
  console.log('   - about.html (about window)');
  console.log('🚀 You can now run: npm start');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

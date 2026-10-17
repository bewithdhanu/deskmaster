const { execSync } = require('child_process');
const path = require('path');

console.log('Building React applications...');

try {
  // Native macOS tray helper (no-op off macOS; falls back to a static icon tray if swiftc is missing)
  execSync('node scripts/build-tray-helper.js', { stdio: 'inherit', cwd: __dirname });

  // Build the React apps (main app and about window)
  execSync('webpack --mode production', { 
    stdio: 'inherit',
    cwd: __dirname 
  });
  
  console.log('✅ React apps built successfully!');
  console.log('📁 Built files are in the dist/ folder:');
  console.log('   - main.bundle.js (main application)');
  console.log('   - about.bundle.js (about window)');
  console.log('   - index.html (main app)');
  console.log('   - about.html (about window)');
  console.log('🚀 You can now run: npm start');
  
} catch (error) {
  console.error('❌ Build failed:', error.message);
  process.exit(1);
}

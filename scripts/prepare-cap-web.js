const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const wwwDir = path.join(root, 'www');

const EXCLUDE_DIRS = new Set(['mac', 'mac-arm64']);
const EXCLUDE_EXT = new Set(['.dmg', '.blockmap', '.yaml', '.yml']);
const EXCLUDE_FILES = new Set([
  'tray-icon.html',
  'tray.bundle.js',
  'about.html',
  'about.bundle.js'
]);

function shouldCopy(name) {
  if (EXCLUDE_DIRS.has(name)) return false;
  if (EXCLUDE_FILES.has(name)) return false;
  if (EXCLUDE_EXT.has(path.extname(name).toLowerCase())) return false;
  return true;
}

function copyRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (!shouldCopy(entry.name)) continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

if (!fs.existsSync(distDir)) {
  console.error('Missing dist/. Run: npm run build-react');
  process.exit(1);
}

if (!fs.existsSync(path.join(distDir, 'index.html'))) {
  console.error('Missing dist/index.html. Run: npm run build-react');
  process.exit(1);
}

if (fs.existsSync(wwwDir)) {
  fs.rmSync(wwwDir, { recursive: true, force: true });
}

copyRecursive(distDir, wwwDir);
console.log('Prepared Capacitor web assets in www/');

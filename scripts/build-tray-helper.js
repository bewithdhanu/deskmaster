// Compiles native/tray/main.swift into a universal (arm64 + x86_64) macOS binary.
// Output: native/bin/deskmaster-tray (bundled via electron-builder extraResources).
// No-op off macOS. Fails soft when swiftc is missing: the app falls back to the Electron tray.
const { execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

if (process.platform !== 'darwin') process.exit(0)

const root = path.join(__dirname, '..')
const source = path.join(root, 'native', 'tray', 'main.swift')
const outDir = path.join(root, 'native', 'bin')
const output = path.join(outDir, 'deskmaster-tray')

try {
  execFileSync('swiftc', ['--version'], { stdio: 'ignore' })
} catch {
  console.warn('swiftc not found - skipping native tray helper (Electron tray will be used)')
  process.exit(0)
}

fs.mkdirSync(outDir, { recursive: true })
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'deskmaster-tray-'))
try {
  const slices = ['arm64', 'x86_64'].map((arch) => {
    const out = path.join(tmp, arch)
    execFileSync('swiftc', ['-O', '-swift-version', '5', '-target', `${arch}-apple-macos12.0`, source, '-o', out], { stdio: 'inherit' })
    return out
  })
  execFileSync('lipo', ['-create', ...slices, '-output', output])
  console.log(`Built ${path.relative(root, output)}`)
} catch (error) {
  console.error('Native tray helper build failed:', error.message)
  process.exit(1)
} finally {
  fs.rmSync(tmp, { recursive: true, force: true })
}

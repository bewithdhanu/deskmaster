

Now you can use these commands:

### For Development:
```bash
npm run dev          # Run in development mode (fixed)
npm run dev-app      # Run with webpack watch + electron
```

### For Building:
```bash
npm run build-mac-arm64      # Build for macOS ARM64 (Apple Silicon)
npm run build-mac-x64        # Build for macOS Intel x64
npm run build-mac-universal  # Build universal binary (both architectures)
npm run build                # Build for all platforms
npm run dist                 # Build and package (no publishing)
```

### For React Development:
```bash
npm run build-react  # Build React components
npm run watch        # Watch mode for React changes
```

## Current Status

- ✅ **Development mode is working** - No more crashes
- ✅ **About window is fixed** - Shows proper content
- ✅ **HTML files auto-generate** - No more missing file errors
- ✅ **Build commands added** - Ready for macOS ARM64 builds

The app should now run smoothly in development mode, and you can build for macOS ARM64 using `npm run build-mac-arm64`! 🚀
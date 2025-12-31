# Code Signing and Notarization Guide

This guide explains how to sign and notarize DeskMaster for macOS distribution.

## Prerequisites

1. **Apple Developer Account**
   - Sign up at [developer.apple.com](https://developer.apple.com)
   - Enroll in the Apple Developer Program ($99/year)

2. **Required Certificates**
   - **Developer ID Application** certificate (for distribution outside Mac App Store)
   - Download from [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)

3. **App-Specific Password**
   - Generate at [appleid.apple.com](https://appleid.apple.com)
   - Go to "Sign-In and Security" → "App-Specific Passwords"
   - Create a password for "DeskMaster Notarization"

4. **Team ID**
   - Find your Team ID in [Apple Developer Portal](https://developer.apple.com/account)
   - It's a 10-character string (e.g., `ABC123DEFG`)

## Setup Instructions

### 1. Install Certificates

1. Download your **Developer ID Application** certificate from Apple Developer Portal
2. Double-click to install it in Keychain Access
3. Verify it's installed: Open Keychain Access → "My Certificates" → Look for "Developer ID Application: [Your Name]"

### 2. Find Your Certificate Identity

Run this command to list available signing identities:

```bash
security find-identity -v -p codesigning
```

Look for a certificate that starts with `Developer ID Application:`. The identity will look like:
```
Developer ID Application: Your Name (TEAM_ID)
```

Copy the full identity string (everything after the number).

### 3. Set Environment Variables

Create a `.env` file in the project root (or set environment variables):

```bash
# Your Apple ID email
APPLE_ID=your.email@example.com

# App-specific password (generated from appleid.apple.com)
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx

# Your Team ID (10-character string)
APPLE_TEAM_ID=ABC123DEFG

# Certificate identity (from step 2)
APPLE_IDENTITY=Developer ID Application: Your Name (TEAM_ID)
```

**Important**: Add `.env` to `.gitignore` to keep credentials secure!

### 4. Build and Sign

Build the app with signing enabled:

```bash
# Build for ARM64 (Apple Silicon)
npm run build-mac-arm64

# Build for x64 (Intel)
npm run build-mac-x64

# Build universal binary
npm run build-mac-universal
```

The build process will:
1. ✅ Sign the app with your Developer ID certificate
2. ✅ Enable Hardened Runtime
3. ✅ Notarize with Apple (if credentials are provided)
4. ✅ Create a signed DMG

### 5. Verify Signing

After building, verify the app is signed:

```bash
codesign --verify --deep --strict --verbose=2 dist/mac/DeskMaster.app
```

Expected output:
```
dist/mac/DeskMaster.app: valid on disk
dist/mac/DeskMaster.app: satisfies its Designated Requirement
```

### 6. Verify Notarization

Check notarization status:

```bash
spctl --assess --verbose --type install dist/mac/DeskMaster.app
```

Or check the notarization ticket:

```bash
spctl --assess --type execute --verbose --context context:primary-signature dist/mac/DeskMaster.app
```

## Troubleshooting

### "No identity found" error

- Make sure your certificate is installed in Keychain Access
- Verify `APPLE_IDENTITY` matches exactly (use `security find-identity -v -p codesigning`)
- Ensure the certificate hasn't expired

### Notarization fails

- Verify your Apple ID has 2FA enabled
- Check that the app-specific password is correct
- Ensure Team ID is correct (10 characters)
- Check [notarization status](https://developer.apple.com/system-status/) for Apple service issues

### "Hardened Runtime" errors

- Check `build/entitlements.mac.plist` includes all required entitlements
- Some native modules may need additional entitlements

### Build works but app shows "untrusted developer"

- Ensure notarization completed successfully
- Wait a few minutes after notarization (Apple needs to propagate)
- Check notarization status: `xcrun notarytool history --apple-id YOUR_APPLE_ID --team-id YOUR_TEAM_ID --password YOUR_APP_PASSWORD`

## CI/CD Setup (GitHub Actions)

For automated signing in CI/CD, add these secrets to your GitHub repository:

1. Go to Repository → Settings → Secrets and variables → Actions
2. Add the following secrets:
   - `APPLE_ID`: Your Apple ID email
   - `APPLE_APP_SPECIFIC_PASSWORD`: App-specific password
   - `APPLE_TEAM_ID`: Your Team ID
   - `APPLE_IDENTITY`: Certificate identity
   - `APPLE_CERTIFICATE`: Base64-encoded certificate (export from Keychain)
   - `APPLE_CERTIFICATE_PASSWORD`: Certificate password (if any)

Then update your GitHub Actions workflow to import the certificate and set environment variables.

## Benefits of Signing and Notarization

✅ **No "untrusted developer" warnings**  
✅ **Gatekeeper allows installation**  
✅ **Users can open app without right-click → Open**  
✅ **Better security and trust**  
✅ **Required for distribution outside Mac App Store**

## Additional Resources

- [Apple Code Signing Guide](https://developer.apple.com/documentation/security/code_signing_services)
- [Notarization Documentation](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)


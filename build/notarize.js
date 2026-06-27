exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  
  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const missingCredentials = !process.env.APPLE_ID ||
    !process.env.APPLE_APP_SPECIFIC_PASSWORD ||
    !process.env.APPLE_TEAM_ID

  if (missingCredentials) {
    const message = 'Notarization requires APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID'
    if (process.env.CI || process.env.GITHUB_ACTIONS) {
      throw new Error(`❌ ${message}`)
    }
    console.warn('⚠️  Notarization skipped: Missing credentials')
    console.warn(`   ${message}`)
    return
  }

  // Dynamic import for ES module support
  const { notarize } = await import('@electron/notarize');

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`📦 Notarizing ${appName}...`);

  try {
    await notarize({
      appBundleId: context.packager.config.appId,
      appPath: appPath,
      appleId: process.env.APPLE_ID,
      appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
      teamId: process.env.APPLE_TEAM_ID,
      tool: 'notarytool' // Use notarytool (Xcode 13+)
    });

    console.log(`✅ Successfully notarized ${appName}`);
  } catch (error) {
    console.error('❌ Notarization failed:', error);
    throw error;
  }
};


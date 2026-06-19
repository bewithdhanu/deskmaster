import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.deskmaster.app',
  appName: 'Deskmaster',
  webDir: 'www',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Dev only: point at DeskMaster Node API on your machine (see npm run cap:serve notes).
    // url: 'http://YOUR_LAN_IP:65532',
    // cleartext: true,
  },
  android: {
    allowMixedContent: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      launchFadeOutDuration: 300,
      backgroundColor: '#1a1a1a',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER',
      showSpinner: false,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a1a',
    },
  },
};

export default config;

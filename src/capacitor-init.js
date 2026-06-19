import { Capacitor } from '@capacitor/core';

export async function initCapacitorShell() {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { SplashScreen } = await import('@capacitor/splash-screen');
    const { StatusBar, Style } = await import('@capacitor/status-bar');

    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#1a1a1a' });
    }
    await SplashScreen.hide();
  } catch (error) {
    console.warn('Capacitor shell init skipped:', error);
  }
}

import { Capacitor, registerPlugin } from '@capacitor/core';

// Opens Live Space's notification page in the system settings (local plugin
// android/app/src/main/java/com/livespace/app/settings/AppSettingsPlugin.java).
// Android only for now; elsewhere the screen shows the steps instead.

type AppSettingsPlugin = { openNotificationSettings(): Promise<void> };

const AppSettings = registerPlugin<AppSettingsPlugin>('AppSettings');

export const canOpenNotificationSettings = () =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('AppSettings');

export const openNotificationSettings = async () => {
  if (!canOpenNotificationSettings()) return false;
  try {
    await AppSettings.openNotificationSettings();
    return true;
  } catch {
    return false;
  }
};

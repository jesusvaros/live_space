import { App as CapacitorApp } from '@capacitor/app';
import { deviceContext } from '@jesusvaros/app-kit/push/supabase';
import { onBeforeSignOut } from '../../lib/signOutTasks';
import { clearLocalPrefs } from '../../shared/notifications/prefs';
import { setServerPushActive } from '../../shared/notifications/serverPush';
import { push, pushTokens } from './pushClient';

// This device's token in public.push_devices, for the signed-in person:
// - sign in (or app open signed in) with the permission granted → register
//   and save it;
// - FCM refreshes the token → save the new one, delete the old one;
// - sign out → delete the row first (it needs the session).
// Until the migration is live the RPC fails and the token is simply not saved.

let userId: string | null = null;
let savedKey: string | null = null;
let started = false;

declare const __APP_VERSION__: string | undefined;

let appVersion: Promise<string | null> | null = null;
const getAppVersion = () => {
  appVersion ??= CapacitorApp.getInfo()
    .then(info => `${info.version} (${info.build})`)
    .catch(() => (typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null));
  return appVersion;
};

const saveToken = async (token: string) => {
  const owner = userId;
  if (!owner) return;
  const key = `${owner}:${token}`;
  if (savedKey === key) return;
  try {
    await pushTokens.upsertDeviceToken({
      platform: push.platform(),
      token,
      appVersion: await getAppVersion(),
      ...deviceContext(),
    });
    if (userId === owner) {
      savedKey = key;
      // The server sender now owns the notices with a local twin.
      setServerPushActive(true);
    }
  } catch (error) {
    setServerPushActive(false);
    console.warn('[push] could not save the device token', error);
  }
};

/** Registers and saves the token when the permission is already granted. Never asks. */
export const registerIfGranted = async (): Promise<string | null> => {
  if (!userId || !push.canRegister()) return null;
  if ((await push.getPermissionState()) !== 'granted') return null;
  try {
    const token = await push.register();
    await saveToken(token);
    return token;
  } catch (error) {
    console.warn('[push] registration failed', error);
    return null;
  }
};

const start = () => {
  if (started) return;
  started = true;
  // The switches of whoever signs in next come from their own row.
  onBeforeSignOut(async () => clearLocalPrefs());
  if (!push.isSupported()) return;
  push.onToken(({ token, previous }) => {
    void saveToken(token);
    if (previous && previous !== token && userId) {
      void pushTokens.removeDeviceToken(previous).catch(() => undefined);
    }
  });
  onBeforeSignOut(async () => {
    const token = push.currentToken();
    savedKey = null;
    setServerPushActive(false);
    if (token && userId) await pushTokens.removeDeviceToken(token);
  });
};

/** Called by PushNotifications whenever the signed-in person changes. */
export const setPushUser = (nextUserId: string | null) => {
  start();
  if (nextUserId !== userId) savedKey = null;
  userId = nextUserId;
  if (userId) void registerIfGranted();
};

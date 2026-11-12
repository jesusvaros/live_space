// «Compartir cómo usas la app» (Ajustes → Privacidad): kept on the device,
// on by default. Off means nothing is queued or sent from this device.

const KEY = 'live_space.analytics_enabled';

export const getAnalyticsSharing = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(KEY) !== 'false';
  } catch {
    return true;
  }
};

export const saveAnalyticsSharing = (on: boolean) => {
  try {
    globalThis.localStorage?.setItem(KEY, on ? 'true' : 'false');
  } catch {
    // Storage blocked: the choice still applies to this run (setEnabled).
  }
};

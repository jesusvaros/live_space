import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { createAnalytics, webStorage } from '@jesusvaros/app-kit/analytics';
import { supabase, supabaseConfig } from '../../lib/supabase';
import { appScreenName } from './props';
import { getAnalyticsSharing, saveAnalyticsSharing } from './settings';

// First-party usage analytics (docs/analitica-app.md): events queue on the device
// (localStorage, like the rest of the app's device state) and go in batches to
// the track_events RPC of our own Supabase. Until that RPC exists, or while
// offline, they simply stay queued (the newest 2000).

declare const __APP_VERSION__: string | undefined;

const platform = (): string => {
  const value = Capacitor.getPlatform();
  return value === 'ios' || value === 'android' ? value : 'web';
};

export const analytics = createAnalytics({
  getSupabase: () => (supabaseConfig.isConfigured ? supabase : null),
  storage: webStorage(),
  keys: { device: 'live_space.analytics.device', queue: 'live_space.analytics.queue' },
  platform,
  getVersion: async () => {
    if (!Capacitor.isNativePlatform()) return typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : null;
    const info = await CapacitorApp.getInfo();
    return `${info.version} (${info.build})`;
  },
  getLanguage: () => (typeof navigator !== 'undefined' && navigator.language ? navigator.language.slice(0, 10) : 'es'),
  isEnabled: getAnalyticsSharing,
  // @capacitor/app also fires these on the web (page hidden / visible).
  onBackground: callback => CapacitorApp.addListener('pause', callback),
  onForeground: callback => CapacitorApp.addListener('resume', callback),
});

/** Something happened. Never throws; props must be enums, counts or sizes (see props.ts). */
export const track = (name: string, props?: Record<string, unknown>) => {
  try {
    analytics.track(name, props);
  } catch {
    // Analytics never breaks the app.
  }
};

/** The Ajustes switch: remembered on the device; off drops what was queued. */
export const setAnalyticsSharing = (on: boolean) => {
  saveAnalyticsSharing(on);
  analytics.setEnabled(on);
};

/** Sends what is queued, waiting at most `ms` (e.g. right before signing out). */
export const flushAnalytics = (ms = 1500) =>
  Promise.race([analytics.flush(), new Promise<void>(resolve => setTimeout(resolve, ms))]);

let started = false;

/** Once per launch: errors → `error` events and `app_open`. */
export const startAnalytics = () => {
  if (started) return;
  started = true;
  analytics.captureErrors({ where: () => appScreenName(window.location.pathname) });
  track('app_open');
};

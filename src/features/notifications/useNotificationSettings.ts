import { useCallback, useEffect, useRef, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import type { PushPermission } from '@jesusvaros/app-kit/push';
import { useAuth } from '../../contexts/AuthContext';
import { cached, setCached } from '../../lib/requestCache';
import { supabase } from '../../lib/supabase';
import {
  notificationsSummary,
  prefsFromRow,
  readLocalPrefs,
  rowFromPrefs,
  writeLocalPrefs,
  type NotificationPrefs,
} from '../../shared/notifications/prefs';
import { getPushPermission } from './pushClient';

// Ajustes → Notificaciones: the person's switches (server row, device copy)
// and the system permission, re-read when the app comes back from the OS
// settings.

const isMissingTable = (error: { code?: string; message?: string } | null) =>
  Boolean(error) && (error?.code === 'PGRST205' || error?.code === '42P01' || /could not find the table/i.test(error?.message ?? ''));

const cacheKey = (profileId: string) => `notification_prefs:${profileId}`;
const CACHE_MS = 5 * 60 * 1000;

// Cached a few minutes (and replaced on every save), so going back to the
// list does not read a row older than the switch just flipped.
export const fetchNotificationPrefs = (profileId: string): Promise<NotificationPrefs> =>
  cached(
    cacheKey(profileId),
    async () => {
      const { data, error } = await supabase.from('notification_preferences').select('*').eq('profile_id', profileId).maybeSingle();
      if (error) {
        if (isMissingTable(error)) return readLocalPrefs();
        throw error;
      }
      const prefs = prefsFromRow(data);
      writeLocalPrefs(prefs);
      return prefs;
    },
    { ttlMs: CACHE_MS },
  );

export const saveNotificationPrefs = async (profileId: string, prefs: NotificationPrefs) => {
  writeLocalPrefs(prefs);
  setCached(cacheKey(profileId), prefs, { ttlMs: CACHE_MS });
  const { error } = await supabase.from('notification_preferences').upsert(rowFromPrefs(prefs, profileId), { onConflict: 'profile_id' });
  if (error && !isMissingTable(error)) throw error;
};

/** System permission, re-read on every return to the app. */
export const usePushPermission = () => {
  const [permission, setPermission] = useState<PushPermission>('unavailable');
  const refresh = useCallback(() => {
    void getPushPermission().then(setPermission).catch(() => setPermission('unavailable'));
  }, []);
  useEffect(() => {
    refresh();
    if (!Capacitor.isNativePlatform()) return undefined;
    const listener = CapacitorApp.addListener('resume', refresh);
    return () => {
      void listener.then(handle => handle.remove());
    };
  }, [refresh]);
  return { permission, refresh };
};

export const useNotificationSettings = () => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [prefs, setPrefs] = useState<NotificationPrefs>(readLocalPrefs);
  const [error, setError] = useState('');
  const latest = useRef(prefs);
  latest.current = prefs;
  const { permission, refresh } = usePushPermission();

  useEffect(() => {
    if (!userId) return;
    let active = true;
    fetchNotificationPrefs(userId)
      .then(next => {
        if (active) setPrefs(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [userId]);

  const update = useCallback(
    (change: (current: NotificationPrefs) => NotificationPrefs) => {
      const previous = latest.current;
      const next = change(previous);
      setPrefs(next);
      setError('');
      if (!userId) {
        writeLocalPrefs(next);
        return;
      }
      saveNotificationPrefs(userId, next).catch(() => {
        setPrefs(previous);
        writeLocalPrefs(previous);
        setCached(`notification_prefs:${userId}`, previous, { ttlMs: CACHE_MS });
        setError('No se ha podido guardar. Inténtalo de nuevo.');
      });
    },
    [userId],
  );

  return { prefs, update, error, permission, refreshPermission: refresh, summary: notificationsSummary(prefs, permission) };
};

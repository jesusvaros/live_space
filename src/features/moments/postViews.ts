import { supabase } from '../../lib/supabase';

// Counting moment views (post_views, migration 20261110000100). The player
// calls recordPostView once a clip has really played VIEW_AFTER_MS; the
// database keeps at most one view per viewer, post and day.

const DEVICE_KEY = 'live_space.device_key';
// Once per clip per session (page lifetime): no repeat calls on replays.
const recorded = new Set<string>();
let sessionKey: string | null = null;

const randomKey = () => {
  const bytes = new Uint8Array(18);
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
};

/** Random per-device id for anonymous visitors (never tied to a person). */
export const deviceKey = () => {
  try {
    const stored = window.localStorage.getItem(DEVICE_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
    const fresh = randomKey();
    window.localStorage.setItem(DEVICE_KEY, fresh);
    return fresh;
  } catch {
    // Private mode / storage blocked: one key for this page's lifetime.
    sessionKey = sessionKey ?? randomKey();
    return sessionKey;
  }
};

/** Whether this session already counted a view of this post. */
export const viewRecorded = (postId: string) => recorded.has(postId);

/**
 * Counts a view of a moment. Fire and forget: a missing function (migration
 * not applied yet), no network or a refusal never affects playback.
 */
export const recordPostView = (postId: string) => {
  if (recorded.has(postId)) return;
  recorded.add(postId);
  void Promise.resolve(
    supabase.rpc('record_post_view', { p_post_id: postId, p_device_key: deviceKey() }),
  ).catch(() => undefined);
};

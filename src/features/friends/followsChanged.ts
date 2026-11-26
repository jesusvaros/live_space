import { invalidateQueries } from '../../lib/queryClient';

// Following or unfollowing a person anywhere in the app: Inicio's «Gente que
// sigues» drops its cached copy and, if it is on screen, reloads. Kept free of
// Supabase imports so any follow button or hook can call it.

/** Fired on window after following or unfollowing a person. */
export const FOLLOWS_CHANGED = 'live-space:follows-changed';

export const notifyFollowsChanged = () => {
  invalidateQueries('["home:friends"');
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(FOLLOWS_CHANGED));
};

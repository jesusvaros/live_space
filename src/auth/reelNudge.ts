import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { askForAccount } from './askForAccount';

// While watching moments without an account, the account sheet comes up
// once after a few of them, then again only after many more, and at most a
// couple of times a day. Closing it always works and you keep watching.

export const REEL_NUDGE = { first: 5, every: 10, maxPerDay: 2 } as const;
const KEY = 'live_space.reel_nudge';

export type ReelNudgeDay = { day: string; shown: number };

export const todayKey = (now = new Date()) => now.toISOString().slice(0, 10);

/** Whether to ask now, given the moments seen this session and today's tally. */
export const shouldNudge = (seen: number, nextAt: number, day: ReelNudgeDay, today: string) => {
  const shownToday = day.day === today ? day.shown : 0;
  return seen >= nextAt && shownToday < REEL_NUDGE.maxPerDay;
};

const readDay = (): ReelNudgeDay => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null') as ReelNudgeDay | null;
    if (saved && typeof saved.day === 'string' && typeof saved.shown === 'number') return saved;
  } catch {
    // ignore
  }
  return { day: '', shown: 0 };
};

const writeDay = (day: ReelNudgeDay) => {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(day));
  } catch {
    // ignore
  }
};

// Per app run: which moments were seen and when to ask next.
const session = { seen: new Set<string>(), nextAt: REEL_NUDGE.first as number };

/** Call with each moment that comes on screen in the feed. */
export const useReelSignInNudge = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  return useCallback(
    (postId: string) => {
      if (user || loading) return;
      session.seen.add(postId);
      const today = todayKey();
      const day = readDay();
      if (!shouldNudge(session.seen.size, session.nextAt, day, today)) return;
      session.nextAt = session.seen.size + REEL_NUDGE.every;
      writeDay({ day: today, shown: (day.day === today ? day.shown : 0) + 1 });
      askForAccount(navigate, 'Crea tu cuenta para guardar lo que te gusta y subir lo que grabes.', 'reels');
    },
    [user, loading, navigate],
  );
};

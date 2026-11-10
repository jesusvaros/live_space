// Where to go after signing in: a concert QR opens /tabs/upload?qr=… and
// the visitor has no account yet. Kept in localStorage (not router state)
// because email confirmation and Google/Apple sign-in come back through a
// deep link, sometimes into a fresh app start.

const KEY = 'live_space.return_to';
const TTL_MS = 30 * 60 * 1000;
const DEFAULT_PATH = '/tabs/events';

export const rememberReturnTo = (path: string) => {
  if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/welcome')) return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ path, at: Date.now() }));
  } catch {
    // ignore storage failures
  }
};

export const readReturnTo = () => {
  try {
    const saved = JSON.parse(window.localStorage.getItem(KEY) || 'null') as { path?: string; at?: number } | null;
    if (saved?.path && typeof saved.at === 'number' && Date.now() - saved.at < TTL_MS) return saved.path;
  } catch {
    // fall through
  }
  return DEFAULT_PATH;
};

// A deliberate exit from a protected page (the account was just deleted):
// where to land once the session is gone. Without it, the sign-out could
// commit before the navigation away (navigations are transitions) and the
// page's RequireAuth would send the person to /welcome instead.
// Only for the moment of the exit: a later visit to a protected page without
// an account still goes to /welcome.
const LEAVING_TTL_MS = 3000;
let leavingTo: { path: string; at: number } | null = null;

export const leaveProtectedPageTo = (path: string) => {
  leavingTo = { path, at: Date.now() };
};

/**
 * RequireAuth: the destination of a deliberate exit, for a few seconds. Not
 * consumed on read: React may render (and discard) RequireAuth more than once.
 */
export const readLeavingTo = () =>
  leavingTo && Date.now() - leavingTo.at < LEAVING_TTL_MS ? leavingTo.path : null;

// Called once the protected page is reached.
export const clearReturnTo = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore storage failures
  }
};

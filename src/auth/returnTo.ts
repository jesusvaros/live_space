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

// Called once the protected page is reached.
export const clearReturnTo = () => {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // ignore storage failures
  }
};

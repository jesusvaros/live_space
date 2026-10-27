import { useSyncExternalStore } from 'react';

// One shared "the app came back" counter. focus, pageshow, visibilitychange
// and Capacitor's resume all fire together when the app returns, so they
// collapse into a single tick, and only after the app was away a while.
const MIN_AWAY_MS = 30_000;

let tick = 0;
let hiddenAt: number | null = null;
const listeners = new Set<() => void>();

const bump = () => {
  tick += 1;
  listeners.forEach(listener => listener());
};

const onHide = () => {
  if (hiddenAt === null) hiddenAt = Date.now();
};

const onShow = () => {
  if (document.visibilityState && document.visibilityState !== 'visible') {
    onHide();
    return;
  }
  if (hiddenAt === null) return;
  const away = Date.now() - hiddenAt;
  hiddenAt = null;
  if (away >= MIN_AWAY_MS) bump();
};

let attached = false;
const attach = () => {
  if (attached || typeof window === 'undefined') return;
  attached = true;
  window.addEventListener('blur', onHide);
  window.addEventListener('pagehide', onHide);
  document.addEventListener('pause', onHide);
  window.addEventListener('focus', onShow);
  window.addEventListener('pageshow', onShow);
  document.addEventListener('visibilitychange', onShow);
  document.addEventListener('resume', onShow);
};

const subscribe = (listener: () => void) => {
  attach();
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => tick;

export const useAppResume = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

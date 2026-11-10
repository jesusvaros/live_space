import { useEffect } from 'react';

/**
 * Time to first content per route, for measuring (dev builds, or any build
 * with localStorage `live_space.perf` = `1`). Logs once per route per page
 * load, in ms since navigation start, and keeps the marks on
 * `window.__lsPerf` for Playwright (tests/e2e/perf-warm.spec.ts).
 */

export type PerfMark = { route: string; ms: number; fromCache: boolean };

declare global {
  interface Window {
    __lsPerf?: PerfMark[];
  }
}

const enabled = (() => {
  try {
    return Boolean(import.meta.env.DEV) || window.localStorage.getItem('live_space.perf') === '1';
  } catch {
    return false;
  }
})();

const marked = new Set<string>();

export const markFirstContent = (route: string, fromCache = false) => {
  if (!enabled || marked.has(route) || typeof performance === 'undefined') return;
  marked.add(route);
  const mark: PerfMark = { route, ms: Math.round(performance.now()), fromCache };
  (window.__lsPerf ||= []).push(mark);
  console.info(`[perf] ${route}: first content at ${mark.ms} ms${fromCache ? ' (saved copy)' : ''}`);
};

export const logPerf = (message: string) => {
  if (enabled) console.info(`[perf] ${message}`);
};

/** Marks the route the first time `ready` is true. */
export const useFirstContent = (route: string, ready: boolean, fromCache = false) => {
  useEffect(() => {
    if (ready) markFirstContent(route, fromCache);
  }, [fromCache, ready, route]);
};

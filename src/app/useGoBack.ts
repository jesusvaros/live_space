import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

// In-app history, kept by AppBackHandler (trackNavigation) from React
// Router's navigation events. history.state.idx can't be trusted for this: on
// Android's WebView it came back null after in-app navigation, so every
// «Volver» went home instead of to the previous page.
let stack: string[] = [];

export type NavigationKind = 'PUSH' | 'POP' | 'REPLACE';

/** The history stack after a navigation, as a list of location keys. */
export const nextNavigationStack = (current: string[], kind: NavigationKind, key: string): string[] => {
  if (current.length === 0) return [key];
  if (kind === 'PUSH') return current.at(-1) === key ? current : [...current, key];
  if (kind === 'REPLACE') return [...current.slice(0, -1), key];
  // POP: back (or forward) to a page we know → cut the stack there. An unknown
  // key (forward after back, or a page from before this session) goes on top.
  const at = current.lastIndexOf(key);
  return at >= 0 ? current.slice(0, at + 1) : [...current, key];
};

export const trackNavigation = (kind: NavigationKind, key: string) => {
  stack = nextNavigationStack(stack, kind, key);
};

/** Test helper. */
export const resetNavigationStack = () => {
  stack = [];
};

// True when there is an in-app page to go back to. False when the app was
// opened on this page (cold start, deep link, QR).
export const canGoBack = () => stack.length > 1;

// Back to the previous page; `fallback` only when there is none.
export const useGoBack = (fallback = '/tabs/events') => {
  const navigate = useNavigate();
  return useCallback(() => {
    if (canGoBack()) navigate(-1);
    else navigate(fallback, { replace: true });
  }, [fallback, navigate]);
};

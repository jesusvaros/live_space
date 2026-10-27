import { useEffect, useSyncExternalStore } from 'react';

// One scroll signal for the whole app (same idea and thresholds as HolyCook's
// scrollChromeStore): scrolling down compacts the bottom nav, a short gesture
// up brings it back. Pages scroll inner containers, not window, so the
// listener runs in capture on the document.

// Near the top the chrome is always expanded.
export const SCROLL_CHROME_NEAR_TOP = 24;
// Nothing collapses before scrolling this far: the first gesture keeps the bar.
export const SCROLL_CHROME_MIN_SCROLL = 72;
// Travel in one direction needed to change state; coming back is easier.
export const SCROLL_CHROME_HIDE_DISTANCE = 20;
export const SCROLL_CHROME_SHOW_DISTANCE = 12;
export const SCROLL_CHROME_DURATION_MS = 200;
export const SCROLL_CHROME_EASING = 'cubic-bezier(0.2, 0, 0, 1)';

let collapsed = false;
const listeners = new Set<() => void>();

const setCollapsed = (next: boolean) => {
  if (collapsed === next) return;
  collapsed = next;
  listeners.forEach(listener => listener());
};

export const resetScrollChrome = () => setCollapsed(false);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

const getSnapshot = () => collapsed;

const startListening = () => {
  const previousTopByScroller = new WeakMap<Element, number>();
  let direction = 0;
  let travelled = 0;

  const handleScroll = (event: Event) => {
    const rawTarget = event.target;
    const target =
      rawTarget === window || rawTarget === document ? document.scrollingElement : rawTarget;
    if (!(target instanceof Element)) return;
    // Scrolling inside a dialog or sheet is not the page's scroll.
    if (target.closest('[role="dialog"],[data-modal]')) return;

    const top = Math.max(0, target.scrollTop);
    const previousTop = previousTopByScroller.get(target);
    previousTopByScroller.set(target, top);
    // First sighting of this scroller, or a horizontal carousel: says nothing.
    if (previousTop === undefined || top === previousTop) return;

    if (top <= SCROLL_CHROME_NEAR_TOP) {
      direction = 0;
      travelled = 0;
      setCollapsed(false);
      return;
    }

    const nextDirection = top > previousTop ? 1 : -1;
    if (nextDirection !== direction) {
      direction = nextDirection;
      travelled = 0;
    }
    travelled += Math.abs(top - previousTop);

    if (nextDirection > 0) {
      if (!collapsed && top > SCROLL_CHROME_MIN_SCROLL && travelled >= SCROLL_CHROME_HIDE_DISTANCE) {
        setCollapsed(true);
        travelled = 0;
      }
      return;
    }

    if (collapsed && travelled >= SCROLL_CHROME_SHOW_DISTANCE) {
      setCollapsed(false);
      travelled = 0;
    }
  };

  document.addEventListener('scroll', handleScroll, { capture: true, passive: true });
  window.addEventListener('scroll', handleScroll, { passive: true });
  return () => {
    document.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('scroll', handleScroll);
  };
};

let subscribers = 0;
let stopListening: (() => void) | null = null;

// The listener is shared: mounted with the first user, removed with the last.
export const useScrollChromeCollapsed = () => {
  useEffect(() => {
    subscribers += 1;
    if (subscribers === 1) stopListening = startListening();
    return () => {
      subscribers -= 1;
      if (subscribers > 0) return;
      stopListening?.();
      stopListening = null;
      resetScrollChrome();
    };
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { PullGesture } from './pullGesture';

// Pull-to-refresh on any scroller of the app (the WebView of Android and iOS
// included): pull down from the very top and let go to reload.
//
// - The listeners are native and sit on the scroller itself, so sheets and
//   dialogs (rendered in a portal, outside it in the DOM) never trigger it,
//   and their own swipe-down-to-close keeps working.
// - Only from scrollTop 0, the scroller and whatever scrollable box is under
//   the finger: a list scrolled inside the page scrolls back up first.
// - Horizontal rows (carousels, tabs) are swipes, not pulls.
// - Nothing moves but the indicator: the content stays put, so full-screen
//   snap lists (Momentos) and one-scroll pages (the concert) are not shifted.

const MIN_SPIN_MS = 450;
const MAX_SPIN_MS = 15_000;

const scrolledBetween = (target: EventTarget | null, root: HTMLElement) => {
  for (let node = target as HTMLElement | null; node && node !== root; node = node.parentElement) {
    if (node.scrollTop > 0) return true;
  }
  return root.scrollTop > 0;
};

export type PullToRefreshState = {
  /** How far the indicator is pulled down, in px (0 at rest). */
  distance: number;
  refreshing: boolean;
};

export const usePullToRefresh = (
  scrollRef: RefObject<HTMLElement | null>,
  onRefresh: () => unknown,
  options: { enabled?: boolean } = {},
): PullToRefreshState => {
  const enabled = options.enabled ?? true;
  const [distance, setDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const refreshingRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The scroller can mount after the hook (a list shown once loaded).
  const [element, setElement] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (scrollRef.current !== element) setElement(scrollRef.current);
  });

  useEffect(() => {
    if (!enabled || !element) return undefined;
    const gesture = new PullGesture();

    const onStart = (event: TouchEvent) => {
      if (refreshingRef.current || event.touches.length !== 1) return;
      const touch = event.touches[0];
      gesture.start(touch.clientX, touch.clientY, !scrolledBetween(event.target, element));
    };
    const onMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      const move = gesture.move(touch.clientX, touch.clientY, !scrolledBetween(event.target, element));
      if (move.preventDefault && event.cancelable) event.preventDefault();
      if (gesture.pulling) setDistance(move.distance);
    };
    const onEnd = () => {
      const refresh = gesture.end();
      setDistance(0);
      if (!refresh || refreshingRef.current) return;
      refreshingRef.current = true;
      setRefreshing(true);
      const started = Date.now();
      const work = Promise.resolve()
        .then(() => onRefreshRef.current())
        .catch(() => undefined);
      const cap = new Promise(resolve => window.setTimeout(resolve, MAX_SPIN_MS));
      void Promise.race([work, cap]).then(() => {
        const wait = Math.max(0, MIN_SPIN_MS - (Date.now() - started));
        window.setTimeout(() => {
          refreshingRef.current = false;
          if (mountedRef.current) setRefreshing(false);
        }, wait);
      });
    };

    element.addEventListener('touchstart', onStart, { passive: true });
    // Not passive: a pull stops the WebView from scrolling or bouncing.
    element.addEventListener('touchmove', onMove, { passive: false });
    element.addEventListener('touchend', onEnd);
    element.addEventListener('touchcancel', onEnd);
    return () => {
      element.removeEventListener('touchstart', onStart);
      element.removeEventListener('touchmove', onMove);
      element.removeEventListener('touchend', onEnd);
      element.removeEventListener('touchcancel', onEnd);
    };
  }, [element, enabled]);

  return { distance, refreshing };
};

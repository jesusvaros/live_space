// The concert page's hero scrolls at half speed while the full-screen stage
// slides over it. Pure, so the math is tested apart from the DOM.

export const HERO_PARALLAX_FACTOR = 0.5;

/**
 * translateY (px) for the hero at a given scroll of the page. 0 above the
 * top (overscroll) and with reduced motion; stops changing once the hero is
 * long gone (scrolled past twice its height), so far-down scrolling does no
 * work.
 */
export const heroParallaxOffset = (
  scrollTop: number,
  heroHeight: number,
  options: { reducedMotion?: boolean; factor?: number } = {},
) => {
  const { reducedMotion = false, factor = HERO_PARALLAX_FACTOR } = options;
  if (reducedMotion || !Number.isFinite(scrollTop) || heroHeight <= 0) return 0;
  const clamped = Math.min(Math.max(scrollTop, 0), heroHeight * 2);
  return Math.round(clamped * factor * 10) / 10;
};

/** The stage counts as "in view" (autoplay, overlay header) from this share on. */
export const STAGE_VISIBLE_RATIO = 0.6;

export const stageIsMostlyVisible = (ratio: number) => ratio >= STAGE_VISIBLE_RATIO;

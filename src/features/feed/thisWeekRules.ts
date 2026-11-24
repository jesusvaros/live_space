// While there are fewer public moments than this, «Momentos» shows the
// week's concerts instead of a thin feed.
export const FEED_MIN_MOMENTS = 30;

export const showThisWeek = (publicMoments: number | null) => publicMoments !== null && publicMoments < FEED_MIN_MOMENTS;

const LOOKBACK_MS = 4 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX = 40;

/** Concerts from tonight (a few hours after doors) to 7 days ahead, soonest first. */
export const thisWeekEvents = <T extends { starts_at: string }>(events: T[], now: number): T[] =>
  events
    .filter(event => {
      const at = Date.parse(event.starts_at);
      return at >= now - LOOKBACK_MS && at <= now + WEEK_MS;
    })
    .sort((left, right) => left.starts_at.localeCompare(right.starts_at));

/** How many posters the page draws at most. */
export const THIS_WEEK_MAX_POSTERS = MAX;

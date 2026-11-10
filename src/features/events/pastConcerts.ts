// Paging for the «Conciertos pasados» lists of artist and venue pages: most
// recent first, a page at a time, read only when the section comes into view.

/** Concerts per «Ver más». */
export const PAST_PAGE = 12;
/**
 * The first page is shorter: the section often starts just above the fold,
 * so it loads with the page, and only a few rows are seen before scrolling.
 */
export const FIRST_PAST_PAGE = 6;

/** How many to ask for next, given how many are listed. */
export const nextPastPageSize = (listed: number) => (listed === 0 ? FIRST_PAST_PAGE : PAST_PAGE);

export type MomentStats = { count: number; latestThumbnailUrl: string | null };

export type PastConcertsState<T> = {
  items: T[];
  /** Moments per concert id; concerts without moments are absent. */
  stats: Record<string, MomentStats>;
  /** The last page came back full: there may be older concerts. */
  hasMore: boolean;
  /** At least one page has been read. */
  loaded: boolean;
};

export const emptyPastConcerts = <T>(): PastConcertsState<T> => ({ items: [], stats: {}, hasMore: false, loaded: false });

/**
 * Appends a page to what is already listed. A concert can show up twice if
 * one was added between two reads (offsets move): it is kept once, where it
 * was first. A short page means there is nothing older.
 */
export const mergePastPage = <T extends { id: string }>(
  state: PastConcertsState<T>,
  page: T[],
  pageStats: ReadonlyMap<string, MomentStats> | Record<string, MomentStats>,
  pageSize = PAST_PAGE,
): PastConcertsState<T> => {
  const seen = new Set(state.items.map(item => item.id));
  const fresh = page.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
  const entries = pageStats instanceof Map ? [...pageStats.entries()] : Object.entries(pageStats);
  const stats = { ...state.stats };
  for (const [id, value] of entries) if (value.count > 0) stats[id] = value;
  return { items: [...state.items, ...fresh], stats, hasMore: page.length >= pageSize, loaded: true };
};

/** «1 momento», «12 momentos». */
export const momentCountLabel = (count: number) => `${count} ${count === 1 ? 'momento' : 'momentos'}`;

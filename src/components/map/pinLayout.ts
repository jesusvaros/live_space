// Which venues get a poster pin and which a compact count dot.
//
// MapLibre has no collision handling for HTML markers, so at city zoom the
// posters would pile up. A greedy pass is enough: venues closest to the centre
// of the screen claim a poster first, and a venue whose poster would overlap
// one already placed falls back to the dot. The selected venue always wins.

/** Below this zoom every venue is a count dot (whole-city view). */
export const POSTER_MIN_ZOOM = 12;
/** At most this many posters at once: images to load and DOM to paint. */
export const MAX_POSTERS = 24;
/** Idle poster footprint in px (40×52 plus the 2px border on each side). */
export const POSTER_BOX = { width: 44, height: 56 };
/** Active poster footprint in px. */
export const ACTIVE_POSTER_BOX = { width: 60, height: 76 };

export type PinCandidate = {
  id: string;
  /** Screen position of the venue, in px. */
  x: number;
  y: number;
};

type Box = { x: number; y: number; width: number; height: number };

const overlaps = (a: Box, b: Box) =>
  Math.abs(a.x - b.x) * 2 < a.width + b.width && Math.abs(a.y - b.y) * 2 < a.height + b.height;

/**
 * Ids that show a poster. `candidates` are the venues on screen; `center` is
 * the screen centre. Venues off screen never get one, so their images are
 * never requested.
 */
export const pickPosterVenues = (
  candidates: ReadonlyArray<PinCandidate>,
  center: { x: number; y: number },
  activeId: string | null,
  maxPosters = MAX_POSTERS,
): Set<string> => {
  const chosen = new Set<string>();
  const placed: Box[] = [];
  const distance = (pin: PinCandidate) => (pin.x - center.x) ** 2 + (pin.y - center.y) ** 2;
  const ordered = [...candidates].sort((left, right) => {
    if (left.id === activeId) return -1;
    if (right.id === activeId) return 1;
    return distance(left) - distance(right) || left.id.localeCompare(right.id);
  });
  for (const pin of ordered) {
    if (chosen.size >= maxPosters) break;
    const size = pin.id === activeId ? ACTIVE_POSTER_BOX : POSTER_BOX;
    const box = { x: pin.x, y: pin.y, ...size };
    if (placed.some(other => overlaps(box, other))) continue;
    placed.push(box);
    chosen.add(pin.id);
  }
  return chosen;
};

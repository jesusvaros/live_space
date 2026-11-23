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

/** The map's deepest zoom (Map.tsx sets it). */
export const MAP_MAX_ZOOM = 19;
/** From this zoom the posters start to grow… */
export const POSTER_GROW_FROM_ZOOM = 15;
/** …to this size two levels before the maximum… */
export const POSTER_STREET_ZOOM = MAP_MAX_ZOOM - 2;
export const POSTER_STREET_SCALE = 2.2;
/** …and keep growing over the last two levels, up to this at the maximum. */
export const POSTER_MAX_SCALE = 3.6;

/**
 * How big the posters are at this zoom. At city and neighbourhood zoom they
 * stay small so many fit; close to street level, where venues are far apart
 * on screen, they grow so the concert's cover reads without tapping the pin.
 * Rounded to 0.1 so tiny zoom changes do not repaint every pin.
 */
export const posterScale = (zoom: number) => {
  const ramp = (from: number, to: number) => Math.min(1, Math.max(0, (zoom - from) / (to - from)));
  const scale =
    zoom <= POSTER_STREET_ZOOM
      ? 1 + ramp(POSTER_GROW_FROM_ZOOM, POSTER_STREET_ZOOM) * (POSTER_STREET_SCALE - 1)
      : POSTER_STREET_SCALE + ramp(POSTER_STREET_ZOOM, MAP_MAX_ZOOM) * (POSTER_MAX_SCALE - POSTER_STREET_SCALE);
  return Math.round(scale * 10) / 10;
};

export const scaleBox = (box: { width: number; height: number }, scale: number) => ({
  width: Math.round(box.width * scale),
  height: Math.round(box.height * scale),
});

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
  scale = 1,
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
    const size = scaleBox(pin.id === activeId ? ACTIVE_POSTER_BOX : POSTER_BOX, scale);
    const box = { x: pin.x, y: pin.y, ...size };
    if (placed.some(other => overlaps(box, other))) continue;
    placed.push(box);
    chosen.add(pin.id);
  }
  return chosen;
};

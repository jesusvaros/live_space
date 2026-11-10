// Tonight's concert stays listed for a few hours after doors, even after
// midnight; nothing on Inicio looks further back.
const EVENTS_LOOKBACK_MS = 4 * 60 * 60 * 1000;

/**
 * The dates Inicio lists: today (minus a few hours) to 30 days ahead, and the
 * 14 days of «Cerca de ti». Shared with the tab prefetch so both ask for the
 * same window (the same query keys).
 */
export const inicioWindow = (now = new Date()) => {
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfNearbyWindow = new Date(startOfToday);
  endOfNearbyWindow.setDate(endOfNearbyWindow.getDate() + 14);
  endOfNearbyWindow.setHours(23, 59, 59, 999);

  const endOfEventsWindow = new Date(startOfToday);
  endOfEventsWindow.setDate(endOfEventsWindow.getDate() + 30);
  endOfEventsWindow.setHours(23, 59, 59, 999);

  return {
    startOfToday,
    endOfNearbyWindow,
    startIso: new Date(startOfToday.getTime() - EVENTS_LOOKBACK_MS).toISOString(),
    endIso: endOfEventsWindow.toISOString(),
  };
};

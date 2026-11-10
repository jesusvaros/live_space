import { useMemo } from 'react';
import { FollowedEntity } from '../../../hooks/useFollowedEntities';
import { useQuery } from '../../../shared/hooks/useQuery';
import { fetchFollowedEventCards } from '../../../data/eventQueries';
import { EventListItem } from '../types';

const EMPTY: EventListItem[] = [];

const idsOf = (entities: FollowedEntity[], kind: FollowedEntity['kind']) =>
  [...new Set(entities.filter(entity => entity.kind === kind).map(entity => entity.id))].sort();

/**
 * What followed artists, venues and festivals have on in the window, in any
 * city: "Lo que sigues" is not limited to the city of the listings.
 */
export const useFollowedEvents = (entities: FollowedEntity[], window: { startIso: string; endIso: string }) => {
  const artistIds = useMemo(() => idsOf(entities, 'artist'), [entities]);
  const venueIds = useMemo(() => idsOf(entities, 'venue'), [entities]);
  const festivalIds = useMemo(() => idsOf(entities, 'festival'), [entities]);
  const enabled = artistIds.length + venueIds.length + festivalIds.length > 0;

  const queryKey = useMemo(
    () => ['events:followed', window.startIso, window.endIso, artistIds.join(','), venueIds.join(','), festivalIds.join(',')] as const,
    [artistIds, festivalIds, venueIds, window.endIso, window.startIso],
  );

  const { data } = useQuery<EventListItem[]>(
    queryKey,
    () => fetchFollowedEventCards({ artistIds, venueIds, festivalIds, startIso: window.startIso, endIso: window.endIso }),
    { enabled, ttlMs: 60_000, initialData: EMPTY },
  );

  return enabled ? data || EMPTY : EMPTY;
};

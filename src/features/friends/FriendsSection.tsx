import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconChevronRight, IconUser } from '../../components/icons';
import { fetchEventCards } from '../../data/eventQueries';
import { PERSIST_MAX_AGE } from '../../lib/persistentCache';
import { friendsService, groupByEvent, type FriendGoing } from '../../services/friends.service';
import { useQuery } from '../../shared/hooks/useQuery';
import EventPosterTile from '../events/components/EventPosterTile';
import HomeSectionHeader from '../events/sections/HomeSectionHeader';
import type { EventListItem } from '../events/types';
import { getEventCoverImage } from '../events/utils';
import FriendAvatars from './FriendAvatars';

export type FriendPlan = { event: EventListItem; friends: FriendGoing[] };

const EMPTY: FriendPlan[] = [];

/** «Ana», «Ana y Luis», «Ana y 3 más». */
export const friendsLabel = (friends: Pick<FriendGoing, 'name'>[]) => {
  const first = friends[0]?.name.split(' ')[0] ?? '';
  if (friends.length <= 1) return first;
  if (friends.length === 2) return `${first} y ${friends[1].name.split(' ')[0]}`;
  return `${first} y ${friends.length - 1} más`;
};

/** Under a 140px poster: «Ana», or «4 amigos». */
export const friendsShortLabel = (friends: Pick<FriendGoing, 'name'>[]) =>
  friends.length === 1 ? friends[0].name.split(' ')[0] : `${friends.length} amigos`;

// The row itself, without data loading: also used by the dev playground.
export const FriendsSectionView: React.FC<{ plans: FriendPlan[]; onOpen: (id: string) => void; onFind: () => void }> = ({
  plans,
  onOpen,
  onFind,
}) => (
  <section aria-labelledby="amigos" className="flex flex-col gap-3.5 px-4 pt-8">
    <HomeSectionHeader
      id="amigos"
      title="Tus amigos van"
      kicker="Sus planes"
      icon={<IconUser size={20} />}
      action={
        plans.length ? (
          <button
            type="button"
            onClick={onFind}
            aria-label="Buscar amigos"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line text-app-ink"
          >
            <span aria-hidden className="text-lg leading-none">+</span>
          </button>
        ) : undefined
      }
    />
    {plans.length === 0 ? (
      <button
        type="button"
        onClick={onFind}
        className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-white/25 px-3.5 text-left"
      >
        <span className="flex items-center">
          {[0, 1, 2].map(index => (
            <span
              key={index}
              aria-hidden
              className={`h-8 w-8 rounded-full border-2 border-app-bg bg-app-surface ${index ? '-ml-2.5' : ''}`}
            />
          ))}
        </span>
        <span className="min-w-0 flex-1 text-[15px] font-bold text-app-ink">Busca a tus amigos</span>
        <IconChevronRight size={18} className="text-white/40" />
      </button>
    ) : (
      <div className="-mr-4 flex gap-3 overflow-x-auto pr-4 pt-1">
        {plans.map(({ event, friends }) => (
          <div key={event.id} className="flex w-[140px] shrink-0 flex-col gap-2">
            <EventPosterTile
              className="w-full"
              event={{ ...event, cover_image_url: getEventCoverImage(event) }}
              onSelect={selected => onOpen(selected.id)}
            />
            <div className="flex items-center gap-2">
              <FriendAvatars friends={friends} max={2} size="h-6 w-6 text-[10px]" />
              <span className="min-w-0 truncate text-[12px] text-white/60">{friendsShortLabel(friends)}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </section>
);

// Inicio: upcoming concerts your friends (people you follow who follow you
// back) said they are going to. Only for signed-in people.
const FriendsSection: React.FC<{ userId: string | null }> = ({ userId }) => {
  const navigate = useNavigate();
  const fromIso = useMemo(() => new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), []);

  const { data } = useQuery<FriendPlan[]>(
    ['home:friends', userId ?? ''],
    async () => {
      if (!userId) return EMPTY;
      const groups = groupByEvent(await friendsService.going({ from: fromIso }));
      if (groups.length === 0) return EMPTY;
      const events = await fetchEventCards({ eventIds: groups.map(group => group.eventId), startIso: fromIso });
      const byId = new Map(events.map(event => [event.id, event]));
      return groups
        .map(group => ({ event: byId.get(group.eventId), friends: group.friends }))
        .filter((plan): plan is FriendPlan => Boolean(plan.event));
    },
    {
      enabled: Boolean(userId),
      ttlMs: 30_000,
      initialData: EMPTY,
      persist: { maxAgeMs: PERSIST_MAX_AGE.user, userId, key: 'inicio:friends' },
    },
  );

  if (!userId) return null;
  return (
    <FriendsSectionView
      plans={data || EMPTY}
      onOpen={id => navigate(`/event/${id}`)}
      onFind={() => navigate('/amigos')}
    />
  );
};

export default FriendsSection;

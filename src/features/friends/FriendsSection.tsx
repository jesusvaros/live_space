import React, { useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { IconChevronRight, IconUser } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { fetchEventCards } from '../../data/eventQueries';
import { PERSIST_MAX_AGE } from '../../lib/persistentCache';
import { friendsService, groupByEvent, type FriendGoing, type Person } from '../../services/friends.service';
import { FOLLOWS_CHANGED } from './followsChanged';
import { useQuery } from '../../shared/hooks/useQuery';
import EventPosterTile from '../events/components/EventPosterTile';
import HomeSectionHeader from '../events/sections/HomeSectionHeader';
import type { EventListItem } from '../events/types';
import { getEventCoverImage } from '../events/utils';
import FriendAvatars from './FriendAvatars';

export type FriendPlan = { event: EventListItem; friends: FriendGoing[] };
export type FollowedPerson = Pick<Person, 'id' | 'name' | 'avatarUrl'>;
type FriendsData = { plans: FriendPlan[]; people: FollowedPerson[] };

const EMPTY: FriendPlan[] = [];
const NOBODY: FollowedPerson[] = [];
const EMPTY_DATA: FriendsData = { plans: EMPTY, people: NOBODY };

/** «Ana», «Ana y Luis», «Ana y 3 más». */
export const friendsLabel = (friends: Pick<FriendGoing, 'name'>[]) => {
  const first = friends[0]?.name.split(' ')[0] ?? '';
  if (friends.length <= 1) return first;
  if (friends.length === 2) return `${first} y ${friends[1].name.split(' ')[0]}`;
  return `${first} y ${friends.length - 1} más`;
};

/** Under a 140px poster: «Ana», or «4 personas». */
export const friendsShortLabel = (friends: Pick<FriendGoing, 'name'>[]) =>
  friends.length === 1 ? friends[0].name.split(' ')[0] : `${friends.length} personas`;

// The faces of the people you follow, each opening their profile.
const PeopleStrip: React.FC<{ people: FollowedPerson[]; onOpenPerson: (id: string) => void }> = ({ people, onOpenPerson }) => (
  <ul className="-mr-4 flex gap-3 overflow-x-auto pr-4" aria-label="Gente que sigues">
    {people.map(person => (
      <li key={person.id} className="shrink-0">
        <button
          type="button"
          onClick={() => onOpenPerson(person.id)}
          className="flex w-[60px] flex-col items-center gap-1.5 text-app-ink"
        >
          <Avatar name={person.name} src={person.avatarUrl} className="h-12 w-12 text-[16px]" />
          <span className="w-full truncate text-center text-[12px] text-white/65">{person.name.split(' ')[0]}</span>
        </button>
      </li>
    ))}
  </ul>
);

// The row itself, without data loading: also used by the dev playground.
export const FriendsSectionView: React.FC<{
  plans: FriendPlan[];
  people?: FollowedPerson[];
  onOpen: (id: string) => void;
  onFind: () => void;
  onOpenPerson?: (id: string) => void;
}> = ({ plans, people = NOBODY, onOpen, onFind, onOpenPerson = () => undefined }) => {
  const followsSomeone = people.length > 0 || plans.length > 0;
  return (
    <section aria-labelledby="amigos" className="flex flex-col gap-3.5 px-4 pt-8">
      <HomeSectionHeader
        id="amigos"
        title="Gente que sigues"
        kicker="A qué conciertos van"
        icon={<IconUser size={20} />}
        action={
          followsSomeone ? (
            <button
              type="button"
              onClick={onFind}
              aria-label="Buscar gente"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line text-app-ink"
            >
              <span aria-hidden className="text-lg leading-none">+</span>
            </button>
          ) : undefined
        }
      />
      {!followsSomeone ? (
        // Only when you really follow nobody.
        <button
          type="button"
          onClick={onFind}
          className="flex min-h-14 items-center gap-3 rounded-2xl border border-dashed border-white/25 px-3.5 py-2 text-left"
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
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-bold text-app-ink">Busca a tus amigos</span>
            <span className="block text-[13px] text-white/55">Sigue a alguien y verás a qué conciertos va.</span>
          </span>
          <IconChevronRight size={18} className="text-white/40" />
        </button>
      ) : null}
      {plans.length ? (
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
      ) : null}
      {followsSomeone && plans.length === 0 ? (
        <p className="text-[13px] text-white/55">La gente que sigues aún no ha marcado conciertos.</p>
      ) : null}
      {people.length ? <PeopleStrip people={people} onOpenPerson={onOpenPerson} /> : null}
    </section>
  );
};

// Inicio: the people you follow and the upcoming concerts they said they are
// going to (only if they share their plans). Only for signed-in people.
const FriendsSection: React.FC<{ userId: string | null }> = ({ userId }) => {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const mySubjectId = profile?.subject_id ?? null;
  const fromIso = useMemo(() => new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), []);

  const { data, refetch } = useQuery<FriendsData>(
    ['home:friends', userId ?? '', mySubjectId ?? ''],
    async () => {
      if (!userId) return EMPTY_DATA;
      const [going, mine] = await Promise.all([
        friendsService.going({ from: fromIso }),
        mySubjectId ? friendsService.myPeople(mySubjectId) : Promise.resolve([]),
      ]);
      const people = mine.filter(person => person.iFollow).map(({ id, name, avatarUrl }) => ({ id, name, avatarUrl }));
      const groups = groupByEvent(going);
      if (groups.length === 0) return { plans: EMPTY, people };
      const events = await fetchEventCards({ eventIds: groups.map(group => group.eventId), startIso: fromIso });
      const byId = new Map(events.map(event => [event.id, event]));
      const plans = groups
        .map(group => ({ event: byId.get(group.eventId), friends: group.friends }))
        .filter((plan): plan is FriendPlan => Boolean(plan.event));
      return { plans, people };
    },
    {
      enabled: Boolean(userId),
      ttlMs: 30_000,
      initialData: EMPTY_DATA,
      persist: { maxAgeMs: PERSIST_MAX_AGE.user, userId, key: 'inicio:people-going' },
    },
  );

  // Following or unfollowing someone anywhere shows up here straight away.
  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;
  useEffect(() => {
    if (!userId) return undefined;
    const reload = () => void refetchRef.current().catch(() => undefined);
    window.addEventListener(FOLLOWS_CHANGED, reload);
    return () => window.removeEventListener(FOLLOWS_CHANGED, reload);
  }, [userId]);

  if (!userId) return null;
  return (
    <FriendsSectionView
      plans={data?.plans || EMPTY}
      people={data?.people || NOBODY}
      onOpen={id => navigate(`/event/${id}`)}
      onFind={() => navigate('/amigos')}
      onOpenPerson={id => navigate(`/profile/${id}`)}
    />
  );
};

export default FriendsSection;

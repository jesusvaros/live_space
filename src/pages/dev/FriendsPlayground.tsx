import React from 'react';
import FriendAvatars from '../../features/friends/FriendAvatars';
import { FriendsSectionView, friendsLabel, type FriendPlan } from '../../features/friends/FriendsSection';
import type { EventListItem } from '../../features/events/types';
import type { FriendGoing } from '../../services/friends.service';

// DEV ONLY (mounted under import.meta.env.DEV in App.tsx): «Gente que sigues»
// on Inicio (with plans, following people with no plans, following nobody) and the row on a concert, with invented data.

const day = (offsetDays: number) => new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000).toISOString();

const concert = (id: string, name: string, venue: string, offsetDays: number, cover: string): EventListItem =>
  ({
    id,
    name,
    starts_at: day(offsetDays),
    city: 'Madrid',
    cover_image_url: cover,
    venue_place: { name: venue },
    event_artists: [],
  }) as unknown as EventListItem;

const person = (friendId: string, name: string, avatarUrl: string | null = null): FriendGoing => ({
  eventId: '',
  startsAt: '',
  friendId,
  name,
  username: null,
  avatarUrl,
});

const ANA = person('a', 'Ana', '/fotos/manos-luz-azul.jpg');
const LUIS = person('b', 'Luis');
const MARTA = person('c', 'Marta', '/fotos/franja-luz-roja.jpg');
const PABLO = person('d', 'Pablo');

const PLANS: FriendPlan[] = [
  { event: concert('e1', 'Lobo', 'Wurlitzer Ballroom', 2, '/fotos/publico-escenario.jpg'), friends: [ANA, LUIS, MARTA, PABLO] },
  { event: concert('e2', 'Frisbi', 'Fun Club', 6, '/fotos/franja-luz-roja.jpg'), friends: [MARTA] },
  { event: concert('e3', 'Puerto Candelaria', 'Razzmatazz', 11, '/fotos/multitud-escenario.jpg'), friends: [LUIS, ANA] },
];

const PEOPLE = [ANA, LUIS, MARTA, PABLO].map(({ friendId, name, avatarUrl }) => ({ id: friendId, name, avatarUrl }));

const FriendsPlayground: React.FC = () => (
  <div className="min-h-dvh bg-app-bg pb-16 pt-4 text-app-ink">
    <FriendsSectionView plans={PLANS} people={PEOPLE} onOpen={() => undefined} onFind={() => undefined} />
    <FriendsSectionView plans={[]} people={PEOPLE} onOpen={() => undefined} onFind={() => undefined} />
    <FriendsSectionView plans={[]} onOpen={() => undefined} onFind={() => undefined} />
    <div className="mt-8 flex items-center gap-2.5 px-4">
      <FriendAvatars friends={PLANS[0].friends} max={4} />
      <p className="min-w-0 truncate text-[14px] font-semibold text-app-ink">{friendsLabel(PLANS[0].friends)} van</p>
    </div>
  </div>
);

export default FriendsPlayground;

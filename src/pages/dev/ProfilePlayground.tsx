import React from 'react';
import { IconCalendar, IconHeart } from '../../components/icons';
import ConcertPosters from '../../features/profile/ConcertPosters';
import MomentsByConcert from '../../features/profile/MomentsByConcert';
import { TicketStub } from '../../features/tickets/TicketSlot';
import PassportHeader from '../../features/profile/PassportHeader';
import type { ProfileMoment } from '../../features/profile/profileLayout';
import type { EventListItem } from '../../features/events/types';

// DEV ONLY (mounted under import.meta.env.DEV in App.tsx): the profile's
// passport header and moments gallery with invented data, to see the design
// without an account.

const PHOTOS = [
  '/fotos/multitud-escenario.jpg',
  '/fotos/franja-luz-roja.jpg',
  '/fotos/publico-escenario.jpg',
  '/fotos/manos-luz-azul.jpg',
  '/fotos/festival-multitud.jpg',
  '/auth/fondo-login.jpg',
];

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

const CONCERTS = [
  concert('c1', 'Puerto Candelaria', 'Razzmatazz', -20, PHOTOS[2]),
  concert('c2', 'Frisbi', 'Fun Club', -45, PHOTOS[1]),
  concert('c3', 'Agua de Marquetería', 'Sala Galileo Galilei', -80, PHOTOS[0]),
  concert('c4', 'Lobo', 'Wurlitzer Ballroom', 3, PHOTOS[3]),
];

const moment = (id: string, eventId: string, photo: string, minutes: number): ProfileMoment => {
  const event = CONCERTS.find(item => item.id === eventId)!;
  return {
    id,
    event_id: eventId,
    media_type: minutes % 3 === 0 ? 'video' : 'image',
    media_url: photo,
    thumbnail_url: photo,
    caption: null,
    event_offset_ms: minutes * 60_000,
    captured_at: null,
    created_at: event.starts_at,
    events: { id: eventId, name: event.name, city: 'Madrid', starts_at: event.starts_at, venue_place: { name: event.venue_place?.name } },
  };
};

const MOMENTS: ProfileMoment[] = [
  ...PHOTOS.map((photo, index) => moment(`a${index}`, 'c1', photo, index * 7)),
  ...PHOTOS.slice(0, 4).map((_photo, index) => moment(`b${index}`, 'c2', PHOTOS[(index + 2) % PHOTOS.length], index * 5 + 1)),
  moment('d0', 'c3', PHOTOS[4], 2),
];

const CARDS = new Map(CONCERTS.map(item => [item.id, item]));

const ProfilePlayground: React.FC = () => {
  const tab = new URLSearchParams(window.location.search).get('vista') || 'momentos';
  return (
    <div className="min-h-dvh bg-app-bg pb-16 text-app-ink">
      <PassportHeader
        name="Jesús"
        subline="Madrid · @jesus"
        links={[
          { key: 'saved', label: 'Guardadas', icon: <IconHeart size={16} />, onSelect: () => undefined },
          { key: 'agenda', label: 'Tu agenda', icon: <IconCalendar size={16} />, onSelect: () => undefined },
        ]}
        onSettings={() => undefined}
      />
      <div className="mx-4 mt-4 flex flex-col gap-2">
        <TicketStub has={false} eventName="Demo" onMain={() => undefined} onAdd={() => undefined} />
        <TicketStub has eventName="Demo" onMain={() => undefined} onAdd={() => undefined} />
      </div>
      <div className="mt-6">
        {tab === 'conciertos' ? (
          <ConcertPosters events={CONCERTS} badgeFor={event => (event.id === 'c4' ? 'Voy' : null)} />
        ) : (
          <MomentsByConcert moments={MOMENTS} cards={CARDS} />
        )}
      </div>
    </div>
  );
};

export default ProfilePlayground;

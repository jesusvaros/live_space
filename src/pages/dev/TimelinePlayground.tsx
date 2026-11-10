import React, { useMemo } from 'react';
import type { EventSetlistEntry } from '../../lib/types';
import ConcertPlayer from '../../features/moments/ConcertPlayer';
import { buildConcertTimeline, type TimelineMoment } from '../../features/moments/concertTimeline';

// DEV ONLY (mounted under import.meta.env.DEV in App.tsx): the concert player
// with invented moments — overlaps, gaps, photos, a moment placed by its song
// and one without time — to work on the screen without real data.

const STARTS = '2026-10-24T20:30:00.000Z';
const ENDS = '2026-10-24T22:30:00.000Z';
const T0 = new Date(STARTS).getTime();
const at = (minutes: number, seconds = 0) => new Date(T0 + (minutes * 60 + seconds) * 1000).toISOString();

// Two real public uploads, reused for every mock video.
const VIDEOS = [
  'https://pub-0df5aa6ba7764f61844da3b506fe5bbf.r2.dev/v/2026/10/0a012d18-d89d-40d5-b09b-23bffb31c586.mp4',
  'https://pub-0df5aa6ba7764f61844da3b506fe5bbf.r2.dev/v/2026/10/0fbd6e5d-f336-4148-b532-339132cdf1e1.mp4',
];
const PHOTOS = [
  '/fotos/multitud-escenario.jpg',
  '/fotos/manos-luz-azul.jpg',
  '/fotos/franja-luz-roja.jpg',
  '/fotos/publico-escenario.jpg',
  '/fotos/festival-multitud.jpg',
];

const SONGS = ['Intro', 'Lobo', 'Ruido', 'Noches de neón', 'Carretera', 'Mar adentro', 'Fuego lento', 'Despedida'];
const setlist: EventSetlistEntry[] = SONGS.map((title, index) => ({
  event_id: 'dev',
  ordinal: index + 1,
  performer_artist_id: null,
  song_id: `song-${index + 1}`,
  song_title: title,
  starts_offset_ms: null,
  ends_offset_ms: null,
  created_at: STARTS,
}));

let seq = 0;
const m = (
  user: string,
  minutes: number,
  seconds: number,
  options: Partial<TimelineMoment> & { song?: number; photo?: boolean } = {},
): TimelineMoment => {
  seq += 1;
  const { song, photo, ...rest } = options;
  return {
    id: `dev-${seq}`,
    userId: user,
    userName: user,
    mediaType: photo ? 'image' : 'video',
    mediaUrl: photo ? PHOTOS[seq % PHOTOS.length] : VIDEOS[seq % VIDEOS.length],
    thumbnailUrl: PHOTOS[(seq + 2) % PHOTOS.length],
    capturedAt: at(minutes, seconds),
    createdAt: new Date(T0 + 86_400_000 + seq * 1000).toISOString(),
    songId: song ? `song-${song}` : null,
    durationSec: 8 + (seq % 4) * 6,
    width: 720,
    height: 1280,
    likes: seq % 5,
    ...rest,
  };
};

const moments: TimelineMoment[] = [
  m('lucia', 4, 0, { song: 2, likes: 6 }),
  m('pablo', 4, 10, { song: 2 }),
  m('marta', 4, 30, { song: 2, photo: true }),
  m('lucia', 9, 5, { song: 3 }),
  m('marta', 9, 0, { song: 3, likes: 9 }),
  m('pablo', 9, 20, { song: 3 }),
  m('tu', 9, 12, { song: 3, photo: true }),
  m('alex', 9, 40, { song: 3 }),
  m('tu', 10, 2, { song: 3 }),
  m('lucia', 14, 0, { song: 4, photo: true }),
  m('sara', 14, 5, { song: 4, likes: 3 }),
  m('alex', 21, 30, { song: 5 }),
  m('pablo', 21, 50, { song: 5, likes: 7 }),
  m('marta', 28, 0, { song: 6 }),
  m('sara', 28, 10, { song: 6 }),
  m('tu', 28, 20, { song: 6, photo: true }),
  m('lucia', 0, 0, { capturedAt: null, song: 7 }),
  m('pablo', 0, 0, { capturedAt: null }),
];

const TimelinePlayground: React.FC = () => {
  const timeline = useMemo(
    () => buildConcertTimeline({ moments, setlist, startsAt: STARTS, endsAt: ENDS, currentUserId: 'tu' }),
    [],
  );
  return (
    <div className="h-dvh overflow-y-auto bg-app-bg pb-32">
      <ConcertPlayer
        timeline={timeline}
        title="Los Planetas"
        stageChip={
          <span className="block truncate rounded-full bg-black/55 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase text-app-ink">
            Los Planetas · Sala Mock · Ayer
          </span>
        }
      />
      <p className="px-4 pt-4 font-mono text-[11px] text-white/40">
        Mock · {timeline.unplaced.length} sin hora: {timeline.unplaced.map(item => `@${item.userName}`).join(', ')}
      </p>
    </div>
  );
};

export default TimelinePlayground;

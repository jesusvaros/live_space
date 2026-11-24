import React, { useState } from 'react';
import { IconChevronLeft } from '../../components/icons';
import EventMomentsManager, { CreditBox } from '../../features/community/EventMomentsManager';
import { creditLine, type ManagedMoment, type ReportedMoment } from '../../features/community/eventMoments';
import { ReportsQueueView } from '../../components/admin/ReportsQueue';

// DEV ONLY (mounted under import.meta.env.DEV in App.tsx): the concert's
// moments for its managers and the admin reports queue, with invented data.
// ?vista=momentos | reportes

const PHOTOS = [
  '/fotos/multitud-escenario.jpg',
  '/fotos/franja-luz-roja.jpg',
  '/fotos/publico-escenario.jpg',
  '/fotos/manos-luz-azul.jpg',
  '/fotos/festival-multitud.jpg',
  '/auth/fondo-login.jpg',
];

const CREDITS = ['@lucia.live', '@marcos', '@sara_bcn', '@dani', '@noe', '@pablo'];

const MOMENTS: ManagedMoment[] = Array.from({ length: 11 }, (_, index) => ({
  post_id: `p${index}`,
  author_id: `a${index % 6}`,
  credit: CREDITS[index % CREDITS.length],
  created_at: new Date(Date.now() - index * 3_600_000).toISOString(),
  resource_type: index % 3 === 0 ? 'image' : 'video',
  format: index % 3 === 0 ? 'jpg' : 'mp4',
  thumbnail_url: PHOTOS[index % PHOTOS.length],
  media_url: index === 4 || index === 9 ? null : PHOTOS[index % PHOTOS.length],
  allow_reuse: !(index === 4 || index === 9),
  hidden: index === 2 || index === 7,
  open_reports: index === 7 ? 2 : index === 1 ? 1 : 0,
}));

const REPORTED: ReportedMoment[] = [
  {
    post_id: 'r1',
    post_status: 'review',
    author_id: 'a1',
    author_name: 'Marcos',
    event_id: 'e1',
    event_name: 'Love of Lesbian · Razzmatazz',
    resource_type: 'video',
    thumbnail_url: PHOTOS[1],
    media_url: null,
    reports: 3,
    reasons: ['offensive', 'rights'],
    details: ['Sale mi cara y no quiero salir'],
    last_report_at: new Date().toISOString(),
  },
  {
    post_id: 'r2',
    post_status: 'published',
    author_id: 'a2',
    author_name: 'Sara',
    event_id: 'e2',
    event_name: 'Rodrigo Cuevas · Sala Apolo',
    resource_type: 'image',
    thumbnail_url: PHOTOS[3],
    media_url: null,
    reports: 1,
    reasons: ['wrong_event'],
    details: [],
    last_report_at: new Date(Date.now() - 86_400_000).toISOString(),
  },
];

const ModerationPlayground: React.FC = () => {
  const view = new URLSearchParams(window.location.search).get('vista') || 'momentos';
  const [moments, setMoments] = useState(MOMENTS);
  const [credit, setCredit] = useState('');
  const [reported, setReported] = useState(REPORTED);

  return (
    <div className="min-h-dvh bg-app-bg text-app-ink">
      <header className="flex items-center gap-2 px-3 pb-3 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface">
          <IconChevronLeft size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-bold">{view === 'reportes' ? 'Reportes' : 'Momentos'}</h1>
          {view === 'reportes' ? null : <p className="truncate text-[12px] text-white/55">Love of Lesbian · Razzmatazz</p>}
        </div>
      </header>
      {view === 'reportes' ? (
        <div className="px-4">
          <ReportsQueueView items={reported} onDecide={item => setReported(rows => rows.filter(row => row.post_id !== item.post_id))} />
        </div>
      ) : (
        <>
          {credit ? (
            <div className="px-4 pb-3">
              <CreditBox line={credit} />
            </div>
          ) : null}
          <EventMomentsManager
            moments={moments}
            onSetHidden={(ids, hidden) =>
              setMoments(rows => rows.map(row => (ids.includes(row.post_id) ? { ...row, hidden } : row)))
            }
            onDownload={chosen => setCredit(creditLine(chosen))}
          />
        </>
      )}
    </div>
  );
};

export default ModerationPlayground;

import React from 'react';
import EventScheduleActions from '../../components/pro/EventScheduleActions';
import EventScheduleBanner from '../../features/events/EventScheduleBanner';
import { NoticePill } from '../../features/live/ConcertDock';
import { IconChevronRight, IconQrCode } from '../../components/icons';
import type { ManagedEvent } from '../../services/eventManagement.service';

// /dev/conciertos (dev only): cancelled / postponed states, the manager's
// actions, the QR entry on the concert page and the notice in the dock.

const base = { cancelledAt: null, cancelReason: null, postponedFrom: null, dateTbc: false };

const event: ManagedEvent = {
  id: 'demo',
  name: 'Sticky M.A.',
  starts_at: '2026-12-12T21:00:00Z',
  ends_at: null,
  ticket_url: null,
  image_url: null,
  poster_thumb_url: null,
  image_source: null,
  status: 'published',
  city: 'Madrid',
  venue_place_id: 'v',
  venue_name: 'Sala But',
  manager_locked_fields: [],
  headliner: null,
  schedule: base,
};

const SchedulePlayground: React.FC = () => (
  <div className="min-h-dvh space-y-4 bg-app-bg px-4 pb-16 pt-6 text-app-ink">
    <EventScheduleBanner schedule={{ ...base, cancelledAt: '2026-11-24T10:00:00Z', cancelReason: 'Enfermedad del cantante' }} startsAt={event.starts_at} />
    <EventScheduleBanner schedule={{ ...base, postponedFrom: '2026-12-05T21:00:00Z' }} startsAt={event.starts_at} />
    <EventScheduleBanner schedule={{ ...base, dateTbc: true, postponedFrom: '2026-12-05T21:00:00Z' }} startsAt={event.starts_at} />
    <button type="button" className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3.5 text-left">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-app-ink text-app-bg">
        <IconQrCode size={18} />
      </span>
      <span className="flex-1 text-[15px] font-bold text-app-ink">QR del concierto</span>
      <IconChevronRight size={18} className="text-white/40" />
    </button>
    <div className="overflow-hidden rounded-[18px] border border-app-line bg-app-surface">
      <EventScheduleActions event={event} onDone={() => undefined} />
    </div>
    <NoticePill
      notice={{ id: 'n', eventId: 'demo', eventName: 'Sticky M.A. en Sala But', kind: 'cancelled', reason: null, startsAt: null }}
      onOpen={() => undefined}
      onClose={() => undefined}
    />
  </div>
);

export default SchedulePlayground;

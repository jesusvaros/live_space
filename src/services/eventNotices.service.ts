import { supabase } from '../api';

// Notices of concerts the user was going to or saved: cancelled or postponed
// by the artist or the venue (cancel_event / postpone_event). Read when the
// app opens; there is no server push sender yet.

export type EventNoticeKind = 'cancelled' | 'postponed' | 'date_tbc';

export type EventNotice = {
  id: string;
  eventId: string;
  eventName: string;
  kind: EventNoticeKind;
  reason: string | null;
  startsAt: string | null;
};

export const noticeTitle = (notice: Pick<EventNotice, 'kind'>) =>
  notice.kind === 'cancelled' ? 'Cancelado' : notice.kind === 'date_tbc' ? 'Aplazado' : 'Nueva fecha';

export const noticeBody = (notice: Pick<EventNotice, 'kind' | 'eventName' | 'startsAt'>) => {
  if (notice.kind === 'postponed' && notice.startsAt) {
    const date = new Date(notice.startsAt)
      .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
      .replace(/\./g, '');
    return `${notice.eventName} · ${date}`;
  }
  return notice.eventName;
};

export const eventNoticesService = {
  async mine(): Promise<EventNotice[]> {
    const { data, error } = await supabase.rpc('my_event_notices');
    if (error) return [];
    return ((data || []) as Array<Record<string, unknown>>).map(row => ({
      id: String(row.id),
      eventId: String(row.event_id),
      eventName: String(row.event_name ?? ''),
      kind: row.kind as EventNoticeKind,
      reason: typeof row.reason === 'string' ? row.reason : null,
      startsAt: typeof row.starts_at === 'string' ? row.starts_at : null,
    }));
  },

  async dismiss(noticeId: string, userId: string) {
    await supabase.from('event_notice_dismissals').insert({ notice_id: noticeId, profile_id: userId });
  },
};

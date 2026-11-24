import { supabase } from '../../lib/supabase';
import type { MediaFile } from './saveMedia';

// Moments of one concert for its managers (artist, venue, festival) and the
// admin reports queue. Migration: 20261124001300_event_moment_moderation.sql.

export type ManagedMoment = {
  post_id: string;
  author_id: string;
  credit: string;
  created_at: string;
  resource_type: 'image' | 'video' | string;
  format: string | null;
  thumbnail_url: string | null;
  /** Only when the fan's licence allows the concert to reuse it. */
  media_url: string | null;
  allow_reuse: boolean;
  hidden: boolean;
  open_reports: number;
};

export const fetchEventMoments = async (eventId: string) => {
  const { data, error } = await supabase.rpc('event_moments_for_manager', { p_event_id: eventId });
  if (error) throw error;
  return ((data || []) as ManagedMoment[]).map(row => ({ ...row, open_reports: Number(row.open_reports) || 0 }));
};

export const setMomentHidden = async (postId: string, hidden: boolean, reason?: string) => {
  const { error } = await supabase.rpc('set_event_post_hidden', {
    p_post_id: postId,
    p_hidden: hidden,
    p_reason: reason?.trim() || null,
  });
  if (error) throw error;
};

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'concierto';

const extension = (moment: Pick<ManagedMoment, 'format' | 'resource_type'>) =>
  moment.format && /^[a-z0-9]{2,5}$/i.test(moment.format)
    ? moment.format.toLowerCase()
    : moment.resource_type === 'video'
      ? 'mp4'
      : 'jpg';

/** livespace_<concierto>_<n>_@usuario.<ext>: the credit travels in the name. */
export const momentDownloadName = (eventName: string, moment: Pick<ManagedMoment, 'credit' | 'format' | 'resource_type'>, index: number) =>
  `livespace_${slug(eventName)}_${String(index + 1).padStart(2, '0')}_@${moment.credit.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '') || 'livespace'}.${extension(moment)}`;

/** Files that may be downloaded (licence on), named with their credit. */
export const downloadableFiles = (eventName: string, moments: ManagedMoment[]): MediaFile[] =>
  moments
    .filter(moment => moment.allow_reuse && moment.media_url)
    .map((moment, index) => ({ url: moment.media_url as string, fileName: momentDownloadName(eventName, moment, index) }));

/** The line to paste when reposting: every author once, in order. */
export const creditLine = (moments: Pick<ManagedMoment, 'credit'>[]) => {
  const credits = [...new Set(moments.map(moment => moment.credit).filter(Boolean))];
  return credits.length ? `📹 ${credits.join(' ')} vía Live Space` : '';
};

// ---- Admin queue -------------------------------------------------------------

export type ReportedMoment = {
  post_id: string;
  post_status: string;
  author_id: string;
  author_name: string;
  event_id: string | null;
  event_name: string | null;
  resource_type: string | null;
  thumbnail_url: string | null;
  media_url: string | null;
  reports: number;
  reasons: string[] | null;
  details: string[] | null;
  last_report_at: string;
};

export type QueueAction = 'keep' | 'hide' | 'delete';

export const fetchModerationQueue = async () => {
  const { data, error } = await supabase.rpc('moderation_queue');
  if (error) throw error;
  return ((data || []) as ReportedMoment[]).map(row => ({ ...row, reports: Number(row.reports) || 0 }));
};

export const decideReportedMoment = async (postId: string, action: QueueAction, note?: string) => {
  const { error } = await supabase.rpc('moderation_decide', { p_post_id: postId, p_action: action, p_note: note?.trim() || null });
  if (error) throw error;
};

export const REPORT_REASON_LABELS: Record<string, string> = {
  wrong_event: 'Otro concierto',
  offensive: 'Ofensivo',
  rights: 'Sin permiso',
  illegal: 'Ilegal',
};

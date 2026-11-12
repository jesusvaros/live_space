import { supabase } from '../../lib/supabase';
import {
  MAX_SUGGESTION_NOTE_LENGTH,
  normalizeSuggestionUrl,
} from '../../shared/suggestions/url';

// «¿No encuentras un concierto?»: the ticket link goes to
// public.event_link_suggestions (migration 20261112000100). The database
// normalizes it again, rate-limits (10 a day per person) and the daily scrape
// imports it (docs/scraping.md, "Sugerencias de usuarios").

export type SuggestResult = 'sent' | 'already_sent' | 'rate_limited' | 'invalid_url' | 'unavailable' | 'signed_out' | 'error';

type PostgrestLikeError = { code?: string; message?: string } | null;

export const suggestErrorToResult = (error: PostgrestLikeError): SuggestResult => {
  if (!error) return 'sent';
  if (error.code === '23505') return 'already_sent';
  if (/rate_limited/i.test(error.message ?? '')) return 'rate_limited';
  if (/invalid_url/i.test(error.message ?? '') || error.code === '22023') return 'invalid_url';
  if (error.code === 'PGRST205' || error.code === '42P01') return 'unavailable';
  if (error.code === '42501') return 'signed_out';
  return 'error';
};

export const sendEventLinkSuggestion = async (rawUrl: string, rawNote: string): Promise<SuggestResult> => {
  const url = normalizeSuggestionUrl(rawUrl);
  if (!url) return 'invalid_url';
  const note = rawNote.trim().slice(0, MAX_SUGGESTION_NOTE_LENGTH) || null;
  const { error } = await supabase.from('event_link_suggestions').insert({ url, note });
  return suggestErrorToResult(error);
};

// What was typed before going to sign in with Google/Apple (a full redirect
// on the web, a deep link on the app), so it is still there on the way back.
const DRAFT_KEY = 'live_space.suggest_link_draft';
const DRAFT_TTL_MS = 30 * 60 * 1000;

export type SuggestDraft = { url: string; note: string };

export const saveSuggestDraft = (draft: SuggestDraft) => {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, at: Date.now() }));
  } catch {
    // No storage: they paste it again.
  }
};

export const takeSuggestDraft = (): SuggestDraft | null => {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    window.localStorage.removeItem(DRAFT_KEY);
    const saved = raw ? (JSON.parse(raw) as Partial<SuggestDraft> & { at?: number }) : null;
    if (!saved || typeof saved.url !== 'string' || typeof saved.at !== 'number' || Date.now() - saved.at > DRAFT_TTL_MS) return null;
    return { url: saved.url, note: typeof saved.note === 'string' ? saved.note : '' };
  } catch {
    return null;
  }
};

export const hasSuggestDraft = () => {
  try {
    return Boolean(window.localStorage.getItem(DRAFT_KEY));
  } catch {
    return false;
  }
};

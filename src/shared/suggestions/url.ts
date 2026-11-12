// Ticket links sent from «¿No encuentras un concierto?». Same rules as
// public.normalize_suggestion_url() (migration 20261112000100), so the app,
// the database and the importer agree on what «the same link» is: http(s)
// only, trimmed, no fragment, no tracking parameters.

export const MAX_SUGGESTION_URL_LENGTH = 2048;
export const MAX_SUGGESTION_NOTE_LENGTH = 500;

const TRACKING_PARAM_RE =
  /^(utm_.*|fbclid|gclid|dclid|gbraid|wbraid|msclkid|mc_cid|mc_eid|igshid|_ga|_gl|yclid|ttclid|twclid)$/i;

/** Normalized link, or null when it is not an http(s) URL. */
export const normalizeSuggestionUrl = (input: string | null | undefined): string | null => {
  const raw = (input ?? '').trim();
  if (!raw || raw.length > MAX_SUGGESTION_URL_LENGTH || /\s/.test(raw)) return null;
  // Only an explicit scheme counts: «entradium.com/x» is not sent as-is.
  if (!/^https?:\/\//i.test(raw)) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname || url.username || url.password) return null;
  if (!/[a-z0-9]/i.test(url.hostname) || url.hostname.startsWith('[')) return null;

  url.hash = '';
  // Rebuilt by hand instead of URLSearchParams so the kept parameters keep
  // their exact encoding (a ticket site may sign them).
  const kept = url.search
    .replace(/^\?/, '')
    .split('&')
    .filter(param => param && !TRACKING_PARAM_RE.test(param.split('=')[0]));
  url.search = kept.length ? `?${kept.join('&')}` : '';
  const text = url.toString();
  return text.length <= MAX_SUGGESTION_URL_LENGTH ? text : null;
};

/** 'https://www.Sala.es:443/x' → 'sala.es' (as stored in url_host). */
export const suggestionUrlHost = (url: string): string | null => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '') || null;
  } catch {
    return null;
  }
};

// FCM HTTP v1 with a service account, no SDK (docs/notificaciones.md).
//
// 1. A JWT (RS256, signed with node:crypto) is exchanged for an OAuth access
//    token at the service account's token_uri, scope firebase.messaging. It is
//    cached until a minute before it expires.
// 2. One POST per device token to
//    https://fcm.googleapis.com/v1/projects/<project_id>/messages:send.
// 3. Outcome per token:
//    - UNREGISTERED / 404, SENDER_ID_MISMATCH, or INVALID_ARGUMENT about the
//      token → 'invalid_token' (the caller sets push_devices.disabled_at);
//    - 429 / 5xx / network → retried with backoff (Retry-After honoured),
//      then 'transient';
//    - 401 → the access token is refreshed once and the send retried;
//    - anything else (e.g. INVALID_ARGUMENT about the payload) → 'failed',
//      the device is left alone.
//
// The service account JSON and the access token are never logged.

import { createSign } from 'node:crypto';
import type { Notice } from './types.js';

export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';
export const NOTIFICATION_ICON = 'ic_stat_live_space';

export type ServiceAccount = {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  tokenUri: string;
};

export const parseServiceAccount = (raw: string | undefined): ServiceAccount => {
  if (!raw || !raw.trim()) throw new Error('FIREBASE_SERVICE_ACCOUNT is not set');
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // Never echo the value: it holds a private key.
    throw new Error('FIREBASE_SERVICE_ACCOUNT is not valid JSON');
  }
  const text = (key: string) => (typeof json[key] === 'string' ? (json[key] as string) : '');
  const account = {
    projectId: text('project_id'),
    clientEmail: text('client_email'),
    privateKey: text('private_key').replace(/\\n/g, '\n'),
    tokenUri: text('token_uri') || DEFAULT_TOKEN_URI,
  };
  const missing = (['projectId', 'clientEmail', 'privateKey'] as const).filter(key => !account[key]);
  if (missing.length) throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing ${missing.join(', ')}`);
  return account;
};

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url');

/** Signed JWT assertion for the OAuth token exchange. */
export const buildJwt = (account: ServiceAccount, nowSeconds: number) => {
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss: account.clientEmail,
    scope: FCM_SCOPE,
    aud: account.tokenUri,
    iat: nowSeconds,
    exp: nowSeconds + 3600,
  };
  const unsigned = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(account.privateKey);
  return `${unsigned}.${base64url(signature)}`;
};

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type AccessTokenProvider = (options?: { force?: boolean }) => Promise<string>;

export const createAccessTokenProvider = (
  account: ServiceAccount,
  fetchImpl: FetchLike,
  now: () => number = Date.now,
): AccessTokenProvider => {
  let cached: { token: string; expiresAt: number } | null = null;
  return async ({ force = false } = {}) => {
    if (!force && cached && cached.expiresAt - 60_000 > now()) return cached.token;
    const assertion = buildJwt(account, Math.floor(now() / 1000));
    const response = await fetchImpl(account.tokenUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const text = await response.text();
    if (!response.ok) {
      let reason = '';
      try {
        const body = JSON.parse(text) as { error?: string; error_description?: string };
        reason = [body.error, body.error_description].filter(Boolean).join(': ');
      } catch {
        reason = '';
      }
      throw new Error(`OAuth token exchange failed (${response.status})${reason ? `: ${reason}` : ''}`);
    }
    const body = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new Error('OAuth token exchange returned no access_token');
    cached = { token: body.access_token, expiresAt: now() + (body.expires_in ?? 3600) * 1000 };
    return cached.token;
  };
};

/** The FCM v1 message for one device. */
export const buildMessage = (token: string, notice: Notice) => ({
  message: {
    token,
    notification: { title: notice.title, body: notice.body },
    data: { route: notice.route, type: notice.type },
    android: {
      priority: notice.priority === 'high' ? 'HIGH' : 'NORMAL',
      ttl: `${notice.ttlSeconds}s`,
      notification: {
        channel_id: notice.channel,
        icon: NOTIFICATION_ICON,
        // Same notice again (e.g. a retry) replaces instead of stacking.
        tag: notice.dedupeKey.slice(0, 64),
      },
    },
  },
});

export type SendOutcome =
  | { ok: true; name: string | null }
  | { ok: false; kind: 'invalid_token' | 'transient' | 'failed'; status: number; code: string | null; message: string };

type FcmErrorBody = {
  error?: {
    code?: number;
    status?: string;
    message?: string;
    details?: Array<{ '@type'?: string; errorCode?: string; fieldViolations?: Array<{ field?: string }> }>;
  };
};

/** Classifies a non-2xx FCM answer. */
export const classifyError = (status: number, text: string): Exclude<SendOutcome, { ok: true }> => {
  let body: FcmErrorBody = {};
  try {
    body = JSON.parse(text) as FcmErrorBody;
  } catch {
    body = {};
  }
  const details = body.error?.details ?? [];
  const fcmCode = details.find(detail => detail.errorCode)?.errorCode ?? null;
  const code = fcmCode ?? body.error?.status ?? null;
  const message = (body.error?.message ?? '').slice(0, 300);
  const fail = (kind: 'invalid_token' | 'transient' | 'failed') => ({ ok: false as const, kind, status, code, message });

  if (fcmCode === 'UNREGISTERED' || status === 404) return fail('invalid_token');
  if (fcmCode === 'SENDER_ID_MISMATCH') return fail('invalid_token');
  if (status === 429 || status >= 500 || fcmCode === 'QUOTA_EXCEEDED' || fcmCode === 'UNAVAILABLE' || fcmCode === 'INTERNAL') {
    return fail('transient');
  }
  if (status === 400 && (fcmCode === 'INVALID_ARGUMENT' || body.error?.status === 'INVALID_ARGUMENT')) {
    // A bad token, or a bug in our payload? Only the first disables the device.
    const aboutToken =
      /registration token/i.test(message) ||
      details.some(detail => detail.fieldViolations?.some(violation => violation.field === 'message.token'));
    return fail(aboutToken ? 'invalid_token' : 'failed');
  }
  return fail('failed');
};

export type Sender = (token: string, notice: Notice) => Promise<SendOutcome>;

export const createSender = ({
  projectId,
  fetchImpl,
  getAccessToken,
  maxRetries = 3,
  baseDelayMs = 500,
  sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
}: {
  projectId: string;
  fetchImpl: FetchLike;
  getAccessToken: AccessTokenProvider;
  maxRetries?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}): Sender => {
  const url = `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;
  return async (token, notice) => {
    const body = JSON.stringify(buildMessage(token, notice));
    let refreshed = false;
    let last: Exclude<SendOutcome, { ok: true }> = { ok: false, kind: 'transient', status: 0, code: null, message: '' };
    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      let retryAfterMs = 0;
      try {
        const accessToken = await getAccessToken({ force: refreshed && attempt > 0 && last.status === 401 });
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body,
        });
        const text = await response.text();
        if (response.ok) {
          let name: string | null = null;
          try {
            name = (JSON.parse(text) as { name?: string }).name ?? null;
          } catch {
            name = null;
          }
          return { ok: true, name };
        }
        if (response.status === 401 && !refreshed) {
          refreshed = true;
          last = { ok: false, kind: 'failed', status: 401, code: 'UNAUTHENTICATED', message: 'access token rejected' };
          continue;
        }
        last = classifyError(response.status, text);
        if (last.kind !== 'transient') return last;
        const retryAfter = Number(response.headers.get('retry-after'));
        if (Number.isFinite(retryAfter) && retryAfter > 0) retryAfterMs = Math.min(retryAfter, 60) * 1000;
      } catch (error) {
        last = { ok: false, kind: 'transient', status: 0, code: 'NETWORK', message: error instanceof Error ? error.message.slice(0, 300) : 'network error' };
      }
      if (attempt < maxRetries) await sleep(Math.max(retryAfterMs, baseDelayMs * 2 ** attempt));
    }
    return last;
  };
};

/** Runs `task` over `items` with at most `limit` in flight; keeps the order. */
export const mapWithConcurrency = async <T, R>(items: T[], limit: number, task: (item: T, index: number) => Promise<R>) => {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await task(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
};

export type DeliverySummary = {
  delivered: number;
  invalidTokens: string[];
  transient: number;
  failed: number;
  errors: string[];
};

/** Sends one notice to every device of a person and sums up the outcome. */
export const deliver = async (send: Sender, tokens: string[], notice: Notice, concurrency = 4): Promise<DeliverySummary> => {
  const outcomes = await mapWithConcurrency(tokens, concurrency, token => send(token, notice));
  const summary: DeliverySummary = { delivered: 0, invalidTokens: [], transient: 0, failed: 0, errors: [] };
  outcomes.forEach((outcome, index) => {
    if (outcome.ok) summary.delivered += 1;
    else {
      if (outcome.kind === 'invalid_token') summary.invalidTokens.push(tokens[index]);
      else if (outcome.kind === 'transient') summary.transient += 1;
      else summary.failed += 1;
      summary.errors.push(`${outcome.status}${outcome.code ? ` ${outcome.code}` : ''}`);
    }
  });
  return summary;
};

/**
 * What to do with the notifications_sent row claimed before sending:
 * - at least one device got it → keep it (status 'sent');
 * - nothing delivered but some failure was transient → delete it, so the next
 *   hourly run retries while the window is still open;
 * - every device failed for good → keep it with status 'failed' (it does not
 *   count against daily_limit, and it is never retried).
 */
export const rowAction = (summary: DeliverySummary): 'keep_sent' | 'release' | 'keep_failed' => {
  if (summary.delivered > 0) return 'keep_sent';
  if (summary.transient > 0) return 'release';
  return 'keep_failed';
};

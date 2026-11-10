import { createVerify, generateKeyPairSync } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  buildJwt,
  buildMessage,
  classifyError,
  createAccessTokenProvider,
  createSender,
  deliver,
  FCM_SCOPE,
  mapWithConcurrency,
  parseServiceAccount,
  rowAction,
  type FetchLike,
} from './fcm';
import { concertDayNotice } from './candidates';

// A throwaway key made for the test run: never the real service account.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const account = parseServiceAccount(
  JSON.stringify({
    type: 'service_account',
    project_id: 'test-project',
    client_email: 'sender@test-project.iam.gserviceaccount.com',
    private_key: pem.replace(/\n/g, '\\n'),
    token_uri: 'https://oauth2.googleapis.com/token',
  }),
);

const notice = concertDayNotice(
  'p1',
  {
    id: 'ev1',
    name: 'Gira',
    startsAt: '2026-11-14T20:30:00Z',
    endsAt: null,
    city: 'Madrid',
    venueName: 'La Riviera',
    venuePlaceId: null,
    festivalId: null,
    artistIds: [],
    headliner: 'Morat',
    announcedAt: '2026-11-01T00:00:00Z',
  },
  'Europe/Madrid',
);

type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
const mockFetch = (replies: Reply[]) => {
  const calls: { url: string; init: Parameters<FetchLike>[1] }[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const reply = replies.shift() ?? { status: 200, body: { name: 'projects/test-project/messages/1' } };
    return {
      ok: reply.status >= 200 && reply.status < 300,
      status: reply.status,
      headers: { get: (name: string) => reply.headers?.[name.toLowerCase()] ?? null },
      text: async () => (typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body ?? {})),
    };
  };
  return { fetchImpl, calls };
};

describe('service account and JWT', () => {
  it('rejects missing or broken JSON without echoing it', () => {
    expect(() => parseServiceAccount(undefined)).toThrow('not set');
    expect(() => parseServiceAccount('{"private_key":"-----BEGIN secret')).toThrow('not valid JSON');
    expect(() => parseServiceAccount('{"private_key":"-----BEGIN secret"}')).toThrow(/missing projectId, clientEmail$/);
    try {
      parseServiceAccount('{"private_key":"-----BEGIN secret');
    } catch (error) {
      expect(String(error)).not.toContain('secret');
    }
  });

  it('builds an RS256 JWT with the FCM scope that verifies with the public key', () => {
    const jwt = buildJwt(account, 1_700_000_000);
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toEqual({
      iss: 'sender@test-project.iam.gserviceaccount.com',
      scope: FCM_SCOPE,
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });
    const valid = createVerify('RSA-SHA256').update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, 'base64url'));
    expect(valid).toBe(true);
  });

  it('exchanges the JWT for an access token and caches it', async () => {
    const { fetchImpl, calls } = mockFetch([
      { status: 200, body: { access_token: 'ya29.test', expires_in: 3600 } },
      { status: 200, body: { access_token: 'ya29.next', expires_in: 3600 } },
    ]);
    let now = 1_700_000_000_000;
    const getToken = createAccessTokenProvider(account, fetchImpl, () => now);
    await expect(getToken()).resolves.toBe('ya29.test');
    await expect(getToken()).resolves.toBe('ya29.test');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    const form = new URLSearchParams(calls[0].init.body);
    expect(form.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(form.get('assertion')?.split('.')).toHaveLength(3);
    now += 3600_000;
    await expect(getToken()).resolves.toBe('ya29.next');
    expect(calls).toHaveLength(2);
  });

  it('reports a failed exchange without the assertion', async () => {
    const { fetchImpl } = mockFetch([{ status: 400, body: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' } }]);
    await expect(createAccessTokenProvider(account, fetchImpl)()).rejects.toThrow('OAuth token exchange failed (400): invalid_grant: Invalid JWT Signature.');
  });
});

describe('message', () => {
  it('carries the notification, route, channel, icon and priority', () => {
    expect(buildMessage('tok', notice)).toEqual({
      message: {
        token: 'tok',
        notification: { title: 'Hoy: Morat en La Riviera a las 21:30', body: notice.body },
        data: { route: '/event/ev1', type: 'concert_day' },
        android: {
          priority: 'HIGH',
          ttl: '21600s',
          notification: { channel_id: 'conciertos', icon: 'ic_stat_live_space', tag: 'concert_day:ev1' },
        },
      },
    });
  });
});

describe('errors', () => {
  const fcmError = (status: number, statusText: string, errorCode?: string, message = '') => ({
    error: {
      code: status,
      status: statusText,
      message,
      details: errorCode ? [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode }] : [],
    },
  });

  it('classifies dead tokens, payload bugs and transient failures', () => {
    expect(classifyError(404, JSON.stringify(fcmError(404, 'NOT_FOUND', 'UNREGISTERED'))).kind).toBe('invalid_token');
    expect(classifyError(404, 'not json').kind).toBe('invalid_token');
    expect(classifyError(403, JSON.stringify(fcmError(403, 'PERMISSION_DENIED', 'SENDER_ID_MISMATCH'))).kind).toBe('invalid_token');
    expect(
      classifyError(400, JSON.stringify(fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'The registration token is not a valid FCM registration token'))).kind,
    ).toBe('invalid_token');
    expect(classifyError(400, JSON.stringify(fcmError(400, 'INVALID_ARGUMENT', 'INVALID_ARGUMENT', 'Invalid value at message.android.ttl'))).kind).toBe('failed');
    expect(classifyError(429, JSON.stringify(fcmError(429, 'RESOURCE_EXHAUSTED', 'QUOTA_EXCEEDED'))).kind).toBe('transient');
    expect(classifyError(503, '').kind).toBe('transient');
    expect(classifyError(403, JSON.stringify(fcmError(403, 'PERMISSION_DENIED'))).kind).toBe('failed');
  });

  const sender = (replies: Reply[]) => {
    const { fetchImpl, calls } = mockFetch(replies);
    const getAccessToken = vi.fn(async () => 'ya29.test');
    const sleep = vi.fn(async () => undefined);
    const send = createSender({ projectId: 'test-project', fetchImpl, getAccessToken, sleep, baseDelayMs: 100 });
    return { send, calls, sleep, getAccessToken };
  };

  it('posts to the v1 endpoint with the bearer token', async () => {
    const { send, calls } = sender([{ status: 200, body: { name: 'projects/test-project/messages/42' } }]);
    await expect(send('tok', notice)).resolves.toEqual({ ok: true, name: 'projects/test-project/messages/42' });
    expect(calls[0].url).toBe('https://fcm.googleapis.com/v1/projects/test-project/messages:send');
    expect(calls[0].init.headers.Authorization).toBe('Bearer ya29.test');
    expect(JSON.parse(calls[0].init.body).message.token).toBe('tok');
  });

  it('retries 429/5xx with backoff, honouring Retry-After', async () => {
    const { send, calls, sleep } = sender([{ status: 503 }, { status: 429, headers: { 'retry-after': '2' } }, { status: 200, body: {} }]);
    await expect(send('tok', notice)).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(3);
    expect(sleep.mock.calls.map(call => (call as unknown[])[0])).toEqual([100, 2000]);
  });

  it('gives up after the retries as transient', async () => {
    const { send, calls } = sender([{ status: 500 }, { status: 500 }, { status: 500 }, { status: 500 }]);
    await expect(send('tok', notice)).resolves.toMatchObject({ ok: false, kind: 'transient', status: 500 });
    expect(calls).toHaveLength(4);
  });

  it('does not retry a dead token', async () => {
    const { send, calls } = sender([{ status: 404, body: fcmError(404, 'NOT_FOUND', 'UNREGISTERED') }]);
    await expect(send('tok', notice)).resolves.toMatchObject({ ok: false, kind: 'invalid_token', code: 'UNREGISTERED' });
    expect(calls).toHaveLength(1);
  });

  it('refreshes the access token once on 401', async () => {
    const { send, calls, getAccessToken } = sender([{ status: 401 }, { status: 200, body: {} }]);
    await expect(send('tok', notice)).resolves.toMatchObject({ ok: true });
    expect(calls).toHaveLength(2);
    expect(getAccessToken).toHaveBeenLastCalledWith({ force: true });
  });

  it('treats a network error as transient', async () => {
    const getAccessToken = vi.fn(async () => 'ya29.test');
    const fetchImpl: FetchLike = async () => {
      throw new Error('ECONNRESET');
    };
    const send = createSender({ projectId: 'p', fetchImpl, getAccessToken, sleep: async () => undefined, maxRetries: 1 });
    await expect(send('tok', notice)).resolves.toMatchObject({ ok: false, kind: 'transient', code: 'NETWORK' });
  });
});

describe('delivery to every device', () => {
  it('sums up outcomes and decides what happens to the log row', async () => {
    const outcomes: Record<string, Awaited<ReturnType<Parameters<typeof deliver>[0]>>> = {
      good: { ok: true, name: 'n' },
      dead: { ok: false, kind: 'invalid_token', status: 404, code: 'UNREGISTERED', message: '' },
      flaky: { ok: false, kind: 'transient', status: 503, code: null, message: '' },
      bad: { ok: false, kind: 'failed', status: 400, code: 'INVALID_ARGUMENT', message: '' },
    };
    const send = async (token: string) => outcomes[token];

    const mixed = await deliver(send, ['good', 'dead'], notice);
    expect(mixed).toMatchObject({ delivered: 1, invalidTokens: ['dead'] });
    expect(rowAction(mixed)).toBe('keep_sent');

    expect(rowAction(await deliver(send, ['dead', 'flaky'], notice))).toBe('release');
    expect(rowAction(await deliver(send, ['dead', 'bad'], notice))).toBe('keep_failed');
  });

  it('caps the requests in flight and keeps the order', async () => {
    let inFlight = 0;
    let peak = 0;
    const results = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async item => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise(resolve => setTimeout(resolve, 5));
      inFlight -= 1;
      return item * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(peak).toBe(3);
  });
});

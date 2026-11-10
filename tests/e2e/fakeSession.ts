import { readFileSync } from 'node:fs';
import type { Page, Route } from '@playwright/test';

// A signed-in person without touching the real backend: a session in
// localStorage (supabase-js reads it without a request while it has not
// expired) and every Supabase request answered from fixtures. Nothing reaches
// the database, so these tests can press «Bloquear» or «Eliminar cuenta».

export const ME = '00000000-0000-4000-8000-00000000000a';
export const OTHER = '00000000-0000-4000-8000-00000000000b';

const supabaseUrl = (() => {
  if (process.env.VITE_SUPABASE_URL) return process.env.VITE_SUPABASE_URL;
  try {
    return /^VITE_SUPABASE_URL=(.+)$/m.exec(readFileSync('.env', 'utf8'))?.[1]?.trim() ?? '';
  } catch {
    return '';
  }
})();

const projectRef = (() => {
  try {
    return new URL(supabaseUrl).hostname.split('.')[0];
  } catch {
    return '';
  }
})();

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

const user = {
  id: ME,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.test',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

const profiles: Record<string, object> = {
  [ME]: { id: ME, username: 'ana', display_name: 'Ana', primary_city: 'Madrid', app_role: 'user', external_links: {}, terms_accepted_at: '2026-01-01T00:00:00Z' },
  [OTHER]: { id: OTHER, username: 'ruido', display_name: 'Ruido', primary_city: 'Madrid', app_role: 'user', external_links: {} },
};

export type FakeBackend = { calls: { method: string; path: string; body: string | null }[] };

export const signInWithFakeBackend = async (page: Page, options: { deleteAccount?: 'ok' | 'missing'; blocked?: boolean } = {}): Promise<FakeBackend> => {
  const backend: FakeBackend = { calls: [] };
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const accessToken = `${base64url({ alg: 'HS256', typ: 'JWT' })}.${base64url({ sub: ME, role: 'authenticated', exp, aud: 'authenticated' })}.sig`;
  const session = { access_token: accessToken, refresh_token: 'fake', token_type: 'bearer', expires_in: 3600, expires_at: exp, user };

  await page.addInitScript(
    ([key, value]) => {
      window.localStorage.setItem('live_space.onboarding_seen', '1');
      window.localStorage.setItem(key, value);
    },
    [`sb-${projectRef}-auth-token`, JSON.stringify(session)] as const,
  );

  const json = (route: Route, body: unknown, status = 200, headers: Record<string, string> = {}) =>
    route.fulfill({ status, contentType: 'application/json', headers, body: JSON.stringify(body) });

  await page.route(`${supabaseUrl}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    backend.calls.push({ method: request.method(), path: `${path}${url.search}`, body: request.postData() });
    const wantsObject = (request.headers()['accept'] || '').includes('vnd.pgrst.object');
    const reply = (rows: unknown[]) => json(route, wantsObject ? rows[0] ?? null : rows, wantsObject && rows.length === 0 ? 406 : 200, { 'content-range': `0-${Math.max(rows.length - 1, 0)}/${rows.length}` });

    if (path.startsWith('/auth/v1/user')) return json(route, user);
    if (path.startsWith('/auth/v1/logout')) return route.fulfill({ status: 204 });
    if (path.startsWith('/auth/v1/')) return json(route, {});
    if (path === '/rest/v1/rpc/delete_my_account') {
      return options.deleteAccount === 'missing'
        ? json(route, { code: 'PGRST202', message: 'Could not find the function public.delete_my_account' }, 404)
        : json(route, { deleted: true, posts: 3, media: 4, files_queued: 4 });
    }
    if (path.startsWith('/rest/v1/rpc/')) return json(route, null);
    if (request.method() !== 'GET' && request.method() !== 'HEAD') return route.fulfill({ status: 201, body: '' });

    const table = path.replace('/rest/v1/', '');
    const search = decodeURIComponent(url.search);
    if (table === 'profiles') return reply(Object.values(profiles).filter((row: any) => search.includes(row.id)));
    if (table === 'hidden_map_subjects') {
      return reply([
        { subject_type: 'venue', artist_id: null, venue_place_id: '10000000-0000-4000-8000-000000000001', created_at: '2026-11-10T10:00:00Z', artist: null, venue: { name: 'Sala Ejemplo', image_url: null } },
        { subject_type: 'artist', artist_id: '20000000-0000-4000-8000-000000000001', venue_place_id: null, created_at: '2026-11-09T10:00:00Z', artist: { name: 'Banda Ejemplo', image_url: null }, venue: null },
      ]);
    }
    if (table === 'user_blocks' && options.blocked) {
      return reply([{ blocked_id: OTHER, created_at: '2026-11-10T10:00:00Z', profile: profiles[OTHER] }]);
    }
    if (table === 'subjects') {
      const id = search.includes(OTHER) ? OTHER : ME;
      return reply([{ id: `subject-${id}`, profile: profiles[id] }]);
    }
    return reply([]);
  });

  return backend;
};

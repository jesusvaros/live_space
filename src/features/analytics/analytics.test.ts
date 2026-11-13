import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubLocalStorage } from '../../test/memoryStorage';

// The real module (setup.ts replaces it with spies for every other test).
vi.unmock('./analytics');

const rpc = vi.hoisted(() => vi.fn());
// Before the module loads: it reads the setting and the queue at creation.
stubLocalStorage();
vi.mock('@capacitor/core', () => ({ Capacitor: { getPlatform: () => 'web', isNativePlatform: () => false } }));
vi.mock('@capacitor/app', () => ({
  App: { addListener: vi.fn(async () => ({ remove: async () => undefined })), getInfo: vi.fn() },
}));
vi.mock('../../lib/supabase', () => ({ supabase: { rpc }, supabaseConfig: { isConfigured: true } }));

const QUEUE = 'live_space.analytics.queue';
const queued = () => (JSON.parse(localStorage.getItem(QUEUE) ?? '[]') as Array<{ name: string }>).map(event => event.name);

beforeEach(() => {
  rpc.mockReset();
});

describe('analytics', () => {
  it('keeps events queued while track_events does not exist, and sends them once it does', async () => {
    const { analytics, track } = await import('./analytics');
    rpc.mockResolvedValue({ error: { code: 'PGRST202', message: 'Could not find the function public.track_events' } });
    track('qr_scan', { source: 'home_button', valid: true });
    await analytics.flush();
    expect(rpc).toHaveBeenCalledWith('track_events', expect.objectContaining({ p_device: expect.any(String) }));
    expect(queued()).toContain('qr_scan');

    rpc.mockResolvedValue({ error: null });
    await analytics.flush();
    const sent = rpc.mock.calls.at(-1)![1].p_events as Array<{ name: string; platform: string; props: object }>;
    expect(sent.find(event => event.name === 'qr_scan')).toMatchObject({
      platform: 'web',
      props: { source: 'home_button', valid: true },
    });
    expect(queued()).toEqual([]);
  });

  it('the switch off is remembered, drops the queue and stops tracking', async () => {
    const { analytics, setAnalyticsSharing, track } = await import('./analytics');
    rpc.mockResolvedValue({ error: { message: 'offline' } });
    track('screen', { path: '/tabs/events' });
    await analytics.flush();
    expect(queued().length).toBeGreaterThan(0);

    setAnalyticsSharing(false);
    expect(localStorage.getItem('live_space.analytics_enabled')).toBe('false');
    expect(analytics.isEnabled()).toBe(false);
    track('screen', { path: '/ajustes' });
    await analytics.flush();
    expect(queued()).toEqual([]);

    setAnalyticsSharing(true);
    expect(localStorage.getItem('live_space.analytics_enabled')).toBe('true');
    expect(analytics.isEnabled()).toBe(true);
  });
});

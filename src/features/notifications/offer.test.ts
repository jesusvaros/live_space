import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAskPolicy, type PushPermission } from '@jesusvaros/app-kit/push';

const DAY = 24 * 60 * 60 * 1000;
const state = vi.hoisted(() => ({
  supported: true,
  permission: 'prompt' as string,
  afterRequest: 'granted' as string,
  now: 1_000 * 24 * 60 * 60 * 1000,
}));

vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('./pushDevice', () => ({ registerIfGranted: vi.fn(async () => 'token') }));
vi.mock('./pushClient', async () => {
  const { createAskPolicy: create } = await import('@jesusvaros/app-kit/push');
  const { routeFromData } = await import('@jesusvaros/app-kit/push');
  const PUSH_ROUTE_PREFIXES = ['/event/', '/concierto/', '/tabs/', '/pedidos/', '/sala/', '/artista/'];
  return {
    push: {
      isSupported: () => state.supported,
      requestPermissionWhenUseful: vi.fn(async () => {
        if (state.permission === 'prompt') state.permission = state.afterRequest;
        return state.permission;
      }),
    },
    askPolicy: create({ cooldownDays: 14, storageKey: 'test.declined', now: () => state.now }),
    getPushPermission: async () => state.permission,
    PUSH_ROUTE_PREFIXES,
    pushRoute: (data: Record<string, unknown>) => routeFromData(data, PUSH_ROUTE_PREFIXES),
  };
});

import { DEFAULT_PREFS, writeLocalPrefs } from '../../shared/notifications/prefs';
import { EXPLAINER_COPY, offerDecision, offerNotifications, setExplainerPresenter, type NotificationTrigger } from './offer';
import { push } from './pushClient';
import { registerIfGranted } from './pushDevice';

const presenter = (answer: boolean) => {
  const seen: NotificationTrigger[] = [];
  setExplainerPresenter(async trigger => {
    seen.push(trigger);
    return answer;
  });
  return seen;
};

// Node's own (file-less) localStorage can shadow jsdom's: use a plain one.
const stubStorage = () => {
  const store = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
};

beforeEach(() => {
  stubStorage();
  state.supported = true;
  state.permission = 'prompt';
  state.afterRequest = 'granted';
  state.now = 1_000 * DAY;
  vi.clearAllMocks();
  setExplainerPresenter(null);
});

describe('offerDecision', () => {
  const policy = createAskPolicy({ storage: null });
  const base = { supported: true, prefs: DEFAULT_PREFS, policy: policy.decide };
  it('never offers on the web or with the master switch off', () => {
    expect(offerDecision({ ...base, supported: false, permission: 'prompt' })).toBe('skip');
    expect(offerDecision({ ...base, prefs: { ...DEFAULT_PREFS, enabled: false }, permission: 'granted' })).toBe('skip');
  });
  it('registers silently when granted, explains when open, leaves denied alone', () => {
    const cases: [PushPermission, string][] = [['granted', 'register'], ['prompt', 'explain'], ['denied', 'skip'], ['unavailable', 'skip']];
    for (const [permission, expected] of cases) expect(offerDecision({ ...base, permission })).toBe(expected);
  });
});

describe('offerNotifications', () => {
  it('shows the explainer for the trigger, and only «Sí» opens the system prompt', async () => {
    const seen = presenter(true);
    const onGranted = vi.fn();
    await expect(offerNotifications('going', onGranted)).resolves.toBe(true);
    expect(seen).toEqual(['going']);
    expect(push.requestPermissionWhenUseful).toHaveBeenCalledTimes(1);
    expect(onGranted).toHaveBeenCalled();
    expect(registerIfGranted).toHaveBeenCalled();
  });

  it('«Ahora no» keeps the system prompt closed and waits 14 days', async () => {
    const seen = presenter(false);
    await expect(offerNotifications('follow')).resolves.toBe(false);
    expect(push.requestPermissionWhenUseful).not.toHaveBeenCalled();

    state.now += 13 * DAY;
    await offerNotifications('merch');
    expect(seen).toEqual(['follow']);

    state.now += 1 * DAY + 1;
    await offerNotifications('merch');
    expect(seen).toEqual(['follow', 'merch']);
  });

  it('when already granted registers without any sheet', async () => {
    state.permission = 'granted';
    const seen = presenter(true);
    const onGranted = vi.fn();
    await expect(offerNotifications('going', onGranted)).resolves.toBe(true);
    expect(seen).toEqual([]);
    expect(onGranted).toHaveBeenCalled();
    expect(registerIfGranted).toHaveBeenCalled();
  });

  it('does nothing when denied, on the web, or with notifications switched off', async () => {
    const seen = presenter(true);
    state.permission = 'denied';
    await expect(offerNotifications('going')).resolves.toBe(false);
    state.permission = 'prompt';
    state.supported = false;
    await expect(offerNotifications('going')).resolves.toBe(false);
    state.supported = true;
    writeLocalPrefs({ ...DEFAULT_PREFS, enabled: false });
    await expect(offerNotifications('going')).resolves.toBe(false);
    expect(seen).toEqual([]);
  });

  it('a «Sí» followed by a system «No» reports off without onGranted', async () => {
    presenter(true);
    state.afterRequest = 'denied';
    const onGranted = vi.fn();
    await expect(offerNotifications('going', onGranted)).resolves.toBe(false);
    expect(onGranted).not.toHaveBeenCalled();
  });

  it('never stacks two sheets', async () => {
    let release: (value: boolean) => void = () => undefined;
    const seen: NotificationTrigger[] = [];
    setExplainerPresenter(trigger => {
      seen.push(trigger);
      return new Promise(resolve => {
        release = resolve;
      });
    });
    const first = offerNotifications('going');
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
    await expect(offerNotifications('merch')).resolves.toBe(false);
    release(false);
    await first;
    expect(seen).toEqual(['going']);
  });

  it('has a question and an answer for every trigger', () => {
    for (const trigger of ['going', 'follow', 'merch'] as const) {
      expect(EXPLAINER_COPY[trigger].title).toMatch(/^¿Te avisamos/);
    }
    expect(EXPLAINER_COPY.going.title).toBe('¿Te avisamos el día del concierto?');
  });
});

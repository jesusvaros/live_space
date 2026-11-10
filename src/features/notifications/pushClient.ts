import { createAskPolicy, createPush, routeFromData, type PushPermission } from '@jesusvaros/app-kit/push';
import { createSupabasePushTokens } from '@jesusvaros/app-kit/push/supabase';
import { supabase } from '../../lib/supabase';

// The one push instance of the app (docs/notificaciones.md).
//
// Android only for now: iOS has no APNs key yet (no Apple Developer
// account), so it never asks for a token. The system permission is still
// asked on iOS after the explainer, because the local notifications use it.

export const PUSH_CHANNELS = [
  {
    id: 'conciertos',
    name: 'Conciertos',
    description: 'El día del concierto y conciertos nuevos de lo que sigues.',
    importance: 4 as const,
    vibration: true,
    lights: true,
    lightColor: '#ff5b2e',
  },
  {
    id: 'momentos',
    name: 'Momentos',
    description: '«¿Subes lo de anoche?» y momentos nuevos de tus conciertos.',
    importance: 3 as const,
  },
  {
    id: 'merch',
    name: 'Merch',
    description: 'Cuándo y dónde recoger lo que reservas.',
    importance: 4 as const,
    vibration: true,
  },
];

export const push = createPush({
  registerOn: ['android'],
  channels: PUSH_CHANNELS,
  tokenStorageKey: 'live_space.push.token',
});

export const pushTokens = createSupabasePushTokens({
  supabase,
  rpc: { upsert: 'register_push_device', remove: 'unregister_push_device' },
});

export const askPolicy = createAskPolicy({ cooldownDays: 14, storageKey: 'live_space.push.declined_at' });

/** Paths a tapped notification may open. Anything else is ignored. */
export const PUSH_ROUTE_PREFIXES = ['/event/', '/concierto/', '/tabs/', '/pedidos/', '/sala/', '/artista/'] as const;

export const pushRoute = (data: Record<string, unknown> | null | undefined) => routeFromData(data, PUSH_ROUTE_PREFIXES);

// Dev server only: lets the e2e tests and screenshots show each permission
// state on the web, where there is no system permission.
const devPermission = (): PushPermission | null => {
  if (!import.meta.env.DEV) return null;
  try {
    const value = window.localStorage.getItem('live_space.dev.push_permission');
    return value === 'granted' || value === 'denied' || value === 'prompt' ? value : null;
  } catch {
    return null;
  }
};

export const getPushPermission = async (): Promise<PushPermission> => devPermission() ?? push.getPermissionState();

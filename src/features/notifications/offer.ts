import type { AskDecision, PushPermission } from '@jesusvaros/app-kit/push';
import { readLocalPrefs, type NotificationPrefs } from '../../shared/notifications/prefs';
import { askPolicy, getPushPermission, push } from './pushClient';
import { registerIfGranted } from './pushDevice';
import { track } from '../analytics/analytics';

// When Live Space offers notifications. Never on app open: only right after
// the person did something a notice would help with.
//
//   «Voy» / guardar un concierto → 'going'
//   seguir un artista, sala o festival → 'follow'
//   reservar merch → 'merch'
//
// Permission already granted → register silently. Still open → our own
// sheet first (PushPermissionSheet); only «Sí, avísame» opens the system
// prompt. «Ahora no» → not again for 14 days. Denied, master switch off, the
// web, or a sheet already on screen → nothing.

export type NotificationTrigger = 'going' | 'follow' | 'merch';

export const EXPLAINER_COPY: Record<NotificationTrigger, { title: string; body: string }> = {
  going: {
    title: '¿Te avisamos el día del concierto?',
    body: 'Un aviso el día del concierto y otro a la mañana siguiente para subir tus fotos y vídeos. Nada más.',
  },
  follow: {
    title: '¿Te avisamos cuando anuncien conciertos?',
    body: 'Cuando lo que sigues anuncie un concierto nuevo, te llega un aviso. Sin spam.',
  },
  merch: {
    title: '¿Te avisamos para recoger tu pedido?',
    body: 'Te recordamos cuándo y dónde recogerlo en el concierto.',
  },
};

/** Pure part of the policy, for the tests. */
export const offerDecision = ({
  supported,
  prefs,
  permission,
  policy,
}: {
  supported: boolean;
  prefs: NotificationPrefs;
  permission: PushPermission;
  policy: (permission: PushPermission) => AskDecision;
}): AskDecision => {
  if (!supported || !prefs.enabled) return 'skip';
  return policy(permission);
};

type Presenter = (trigger: NotificationTrigger) => Promise<boolean>;
let presenter: Presenter | null = null;
let showing = false;

/** PushPermissionSheet plugs itself in here. */
export const setExplainerPresenter = (next: Presenter | null) => {
  presenter = next;
};

/**
 * Offers notifications after `trigger`. `onGranted` runs when the permission
 * is (or becomes) granted: e.g. scheduling the local nudges. Resolves with
 * whether notifications are on.
 */
export const offerNotifications = async (trigger: NotificationTrigger, onGranted?: () => unknown): Promise<boolean> => {
  const permission = await getPushPermission().catch(() => 'unavailable' as const);
  const decision = offerDecision({
    supported: push.isSupported(),
    prefs: readLocalPrefs(),
    permission,
    policy: askPolicy.decide,
  });

  if (decision === 'register') {
    await Promise.resolve(onGranted?.()).catch(() => undefined);
    void registerIfGranted();
    return true;
  }
  if (decision === 'skip' || !presenter || showing) return false;

  showing = true;
  track('push_prompt', { trigger, step: 'explainer' });
  let accepted = false;
  try {
    accepted = await presenter(trigger);
  } finally {
    showing = false;
  }
  if (!accepted) {
    track('push_denied', { trigger, step: 'explainer' });
    askPolicy.declined();
    return false;
  }
  askPolicy.reset();
  if ((await push.requestPermissionWhenUseful()) !== 'granted') {
    track('push_denied', { trigger, step: 'system' });
    return false;
  }
  track('push_granted', { trigger });
  await Promise.resolve(onGranted?.()).catch(() => undefined);
  void registerIfGranted();
  return true;
};

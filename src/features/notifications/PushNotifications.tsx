import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IconBell } from '../../components/icons';
import Button from '../../components/ui/Button';
import { Modal, useToast } from '../../components/ui/AppPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { EXPLAINER_COPY, setExplainerPresenter, type NotificationTrigger } from './offer';
import { push, pushRoute } from './pushClient';
import { setPushUser } from './pushDevice';

// Mounted once inside the router:
// - keeps this device's token saved for whoever is signed in;
// - a tapped notification opens its `data.route` (internal paths only);
// - a notification that arrives with the app open shows as a toast (the
//   system shows nothing then);
// - the explainer sheet offerNotifications() opens before the system prompt.

const PushPermissionSheet: React.FC = () => {
  const [trigger, setTrigger] = useState<NotificationTrigger | null>(null);
  const answer = useRef<((accepted: boolean) => void) | null>(null);

  useEffect(() => {
    setExplainerPresenter(
      next =>
        new Promise<boolean>(resolve => {
          answer.current = resolve;
          setTrigger(next);
        }),
    );
    return () => {
      setExplainerPresenter(null);
      answer.current?.(false);
    };
  }, []);

  const close = (accepted: boolean) => {
    answer.current?.(accepted);
    answer.current = null;
    setTrigger(null);
  };

  const copy = trigger ? EXPLAINER_COPY[trigger] : null;

  return (
    <Modal isOpen={trigger !== null} onDidDismiss={() => close(false)} initialBreakpoint={0.5} title={copy?.title ?? 'Notificaciones'}>
      {copy ? (
        <div className="px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-app-accent/15 text-app-accent">
            <IconBell size={24} />
          </span>
          <h3 className="m-0 mt-4 font-display text-2xl font-bold text-app-ink">{copy.title}</h3>
          <p className="m-0 mt-2 text-[15px] leading-snug text-[#c9c5bd]">{copy.body}</p>
          <p className="m-0 mt-2 text-[13px] text-white/45">Lo cambias cuando quieras en Ajustes → Notificaciones.</p>
          <div className="mt-6 flex flex-col gap-2">
            <Button size="lg" block onClick={() => close(true)}>
              Sí, avísame
            </Button>
            <Button size="lg" variant="ghost" block onClick={() => close(false)}>
              Ahora no
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
};

const PushNotifications: React.FC = () => {
  const navigate = useNavigate();
  const { presentToast } = useToast();
  const { user } = useAuth();
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!push.isSupported()) return undefined;
    const stopTaps = push.onTapped(message => {
      const route = pushRoute(message.data);
      if (route) navigate(route);
    });
    const stopReceived = push.onReceived(message => {
      const text = [message.title, message.body].filter(Boolean).join(' · ');
      presentToast({ message: text || 'Tienes un aviso nuevo.', duration: 4500 });
    });
    void push.listen();
    return () => {
      stopTaps();
      stopReceived();
    };
  }, [navigate, presentToast]);

  useEffect(() => {
    setPushUser(userId);
  }, [userId]);

  return <PushPermissionSheet />;
};

export default PushNotifications;

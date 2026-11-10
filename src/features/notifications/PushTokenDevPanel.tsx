import React, { useState } from 'react';
import Button from '../../components/ui/Button';
import { push } from './pushClient';
import { registerIfGranted } from './pushDevice';

// Ajustes → Acerca de, only in dev builds or with localStorage
// 'live_space.dev' = '1' (also set by tapping «Versión» 7 times): shows this
// device's FCM token so a test push can be sent from the Firebase console
// (docs/notificaciones.md, "Probar").

const DEV_KEY = 'live_space.dev';

export const isDevMode = () => {
  if (import.meta.env.DEV) return true;
  try {
    return window.localStorage.getItem(DEV_KEY) === '1';
  } catch {
    return false;
  }
};

export const enableDevMode = () => {
  try {
    window.localStorage.setItem(DEV_KEY, '1');
  } catch {
    // No storage: dev mode only in dev builds then.
  }
};

const PushTokenDevPanel: React.FC = () => {
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState('');

  const show = async () => {
    setStatus('Pidiendo el token…');
    const permission = await push.getPermissionState();
    const value = (await registerIfGranted()) ?? push.currentToken();
    setToken(value);
    setStatus(
      value
        ? ''
        : !push.canRegister()
          ? 'En esta plataforma no hay push (solo Android por ahora).'
          : `Sin token. Permiso: ${permission}.`,
    );
  };

  const copy = async () => {
    if (!token) return;
    try {
      await navigator.clipboard.writeText(token);
      setStatus('Copiado.');
    } catch {
      setStatus('No se ha podido copiar: mantén pulsado el texto.');
    }
  };

  return (
    <section className="mt-6 rounded-2xl border border-dashed border-white/20 p-3.5">
      <h2 className="m-0 text-[12px] font-semibold uppercase tracking-[0.14em] text-white/45">Desarrollo</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={() => void show()}>
          Ver token de notificaciones
        </Button>
        {token ? (
          <Button size="sm" variant="ghost" onClick={() => void copy()}>
            Copiar
          </Button>
        ) : null}
      </div>
      {token ? (
        <p data-testid="push-token" className="m-0 mt-3 select-all break-all font-mono text-[12px] leading-snug text-white/70">
          {token}
        </p>
      ) : null}
      {status ? <p className="m-0 mt-2 text-[13px] text-white/50">{status}</p> : null}
    </section>
  );
};

export default PushTokenDevPanel;

import React, { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import type { PushPermission } from '@jesusvaros/app-kit/push';
import { IconBell, IconCalendar, IconCamera, IconClock, IconPlay, IconShield, IconTicket } from '../../components/icons';
import Button from '../../components/ui/Button';
import {
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPES,
  type NotificationType,
} from '../../shared/notifications/prefs';
import { SettingsGroup, SettingsHelp, SettingsItem, Switch } from '../settings/SettingsList';
import { askPolicy, push } from './pushClient';
import { registerIfGranted } from './pushDevice';
import { canOpenNotificationSettings, openNotificationSettings } from './systemSettings';
import { useNotificationSettings } from './useNotificationSettings';

// Ajustes → Notificaciones: master switch, one switch per kind of notice,
// quiet hours, and where the system permission stands (with the way to fix
// it when it was denied).

const TYPE_ICONS: Record<NotificationType, React.ReactNode> = {
  concert_day: <IconCalendar size={18} />,
  upload_reminder: <IconCamera size={18} />,
  merch_pickup: <IconTicket size={18} />,
  new_moments: <IconPlay size={18} />,
  followed_new_concert: <IconBell size={18} />,
};

const PERMISSION_LABELS: Record<PushPermission, string> = {
  granted: 'Permitidas',
  denied: 'Bloqueadas',
  prompt: 'Sin preguntar',
  unavailable: 'Solo en el móvil',
};

const TimeInput: React.FC<{ label: string; value: string; onChange: (value: string) => void; disabled?: boolean }> = ({
  label,
  value,
  onChange,
  disabled,
}) => (
  <input
    type="time"
    aria-label={label}
    value={value}
    disabled={disabled}
    onChange={event => {
      if (event.target.value) onChange(event.target.value);
    }}
    className="min-h-11 shrink-0 rounded-xl border border-app-line bg-app-bg px-3 text-[15px] text-app-ink [color-scheme:dark] disabled:opacity-40"
  />
);

const PermissionHelp: React.FC<{ permission: PushPermission; onAllow: () => void; busy: boolean }> = ({ permission, onAllow, busy }) => {
  const [openFailed, setOpenFailed] = useState(false);
  const ios = Capacitor.getPlatform() === 'ios';
  const steps = ios ? 'Ajustes del iPhone → Live Space → Notificaciones' : 'Ajustes del móvil → Aplicaciones → Live Space → Notificaciones';

  if (permission === 'denied') {
    return (
      <div className="mt-2.5 px-3.5">
        <p className="m-0 text-[13.5px] leading-snug text-white/50">
          El móvil tiene bloqueadas las notificaciones de Live Space. Para recibirlas, actívalas en {steps}.
        </p>
        {canOpenNotificationSettings() && !openFailed ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => {
              void openNotificationSettings().then(opened => setOpenFailed(!opened));
            }}
          >
            Abrir ajustes del sistema
          </Button>
        ) : null}
      </div>
    );
  }
  if (permission === 'prompt') {
    return (
      <div className="mt-2.5 px-3.5">
        <p className="m-0 text-[13.5px] leading-snug text-white/50">
          Aún no le has dado permiso a Live Space para avisarte en este móvil.
        </p>
        <Button size="sm" className="mt-3" onClick={onAllow} disabled={busy}>
          Permitir notificaciones
        </Button>
      </div>
    );
  }
  if (permission === 'unavailable') {
    return <SettingsHelp>Los avisos llegan a la app del móvil. Lo que elijas aquí vale para todos tus dispositivos.</SettingsHelp>;
  }
  return null;
};

const NotificationsSettingsPage: React.FC = () => {
  const { prefs, update, error, permission, refreshPermission } = useNotificationSettings();
  const [asking, setAsking] = useState(false);
  const off = !prefs.enabled;

  // Here the person came looking for it: the system prompt can open directly.
  const allow = async () => {
    setAsking(true);
    try {
      askPolicy.reset();
      if ((await push.requestPermissionWhenUseful()) === 'granted') void registerIfGranted();
    } finally {
      setAsking(false);
      refreshPermission();
    }
  };

  return (
    <div className="px-4 pb-10">
      <SettingsGroup>
        <SettingsItem icon={<IconBell size={18} />} title="Notificaciones" subtitle={off ? 'No te enviamos ninguna' : undefined}>
          <Switch
            checked={prefs.enabled}
            label="Recibir notificaciones"
            onChange={value => {
              update(current => ({ ...current, enabled: value }));
              if (value && permission === 'prompt') void allow();
            }}
          />
        </SettingsItem>
      </SettingsGroup>
      <SettingsHelp>Solo avisos de tus conciertos. Nunca publicidad.</SettingsHelp>

      <SettingsGroup label="Permiso del sistema">
        <SettingsItem icon={<IconShield size={18} />} title="En este móvil" value={PERMISSION_LABELS[permission]} />
      </SettingsGroup>
      <PermissionHelp permission={permission} onAllow={() => void allow()} busy={asking} />

      <SettingsGroup label="Qué te avisamos">
        {NOTIFICATION_TYPES.map(type => (
          <SettingsItem key={type} icon={TYPE_ICONS[type]} title={NOTIFICATION_TYPE_LABELS[type].title} subtitle={NOTIFICATION_TYPE_LABELS[type].help}>
            <Switch
              checked={prefs.types[type]}
              disabled={off}
              label={NOTIFICATION_TYPE_LABELS[type].title}
              onChange={value => update(current => ({ ...current, types: { ...current.types, [type]: value } }))}
            />
          </SettingsItem>
        ))}
      </SettingsGroup>

      <SettingsGroup label="Horas de silencio">
        <SettingsItem icon={<IconClock size={18} />} title="Desde">
          <TimeInput
            label="Silencio desde"
            value={prefs.quietStart}
            disabled={off}
            onChange={value => update(current => ({ ...current, quietStart: value }))}
          />
        </SettingsItem>
        <SettingsItem icon={<IconClock size={18} />} title="Hasta">
          <TimeInput
            label="Silencio hasta"
            value={prefs.quietEnd}
            disabled={off}
            onChange={value => update(current => ({ ...current, quietEnd: value }))}
          />
        </SettingsItem>
      </SettingsGroup>
      <SettingsHelp>
        Entre estas horas (las de tu móvil) no te enviamos nada. Como mucho {prefs.dailyLimit} avisos al día.
      </SettingsHelp>

      {error ? (
        <p role="alert" className="m-0 mt-4 px-3.5 text-[13.5px] text-rose-300">
          {error}
        </p>
      ) : null}
    </div>
  );
};

export default NotificationsSettingsPage;

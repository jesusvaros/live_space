import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { App as CapacitorApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import Avatar from '../../components/ui/Avatar';
import {
  IconBlock,
  IconBriefcase,
  IconDocument,
  IconEyeOff,
  IconInfo,
  IconLocate,
  IconLogout,
  IconShield,
  IconTrash,
} from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import type { ManagedEntity } from '../../lib/types';
import { useBlockedUserIds } from '../blocks/useBlockedUsers';
import BlockedUsersList from '../blocks/BlockedUsersList';
import HiddenOnMapList from '../hiddenMap/HiddenOnMapList';
import { useHiddenOnMap } from '../hiddenMap/useHiddenOnMap';
import { getReuseConsent, setReuseConsent } from '../community/licence';
import DeleteAccountSection from '../account/DeleteAccountSection';
import { legalAppPath } from '../legal/paths';
import { LEGAL_CONTACT_EMAIL } from '../legal/config';
import PushTokenDevPanel, { enableDevMode, isDevMode } from '../notifications/PushTokenDevPanel';
import AnalyticsSharingSetting from '../analytics/AnalyticsSharingSetting';
import { SettingsGroup, SettingsHelp, SettingsItem, SettingsRow, Switch } from './SettingsList';

const PROVIDER_LABELS: Record<string, string> = { email: 'Email y contraseña', google: 'Google', apple: 'Apple' };

export const useSignInMethod = () => {
  const { user } = useAuth();
  const providers = (user?.app_metadata?.providers as string[] | undefined) ?? [user?.app_metadata?.provider as string | undefined];
  return providers.filter(Boolean).map(provider => PROVIDER_LABELS[provider as string] ?? provider).join(' · ');
};

// --- Gestión ---------------------------------------------------------------

const entityName = (entity: ManagedEntity) =>
  entity.type === 'artist' ? entity.artist?.name : entity.type === 'venue' ? entity.venue?.name : entity.profile?.display_name;

const entityId = (entity: ManagedEntity) =>
  (entity.artist as any)?.id ?? (entity.artist as any)?.artist_id ?? (entity.venue as any)?.id ?? (entity.venue as any)?.venue_place_id;

export const ManagementPage: React.FC = () => {
  const { managedEntities, activeWorkspace, setActiveWorkspace } = useWorkspace();
  const navigate = useNavigate();
  const entities = managedEntities.filter(entity => entity.type === 'artist' || entity.type === 'venue');

  const actAs = (entity: ManagedEntity | null) => {
    if (!entity) {
      setActiveWorkspace(null);
      navigate('/tabs/profile', { replace: true });
      return;
    }
    const id = entityId(entity);
    setActiveWorkspace({
      ...entity,
      artist: entity.artist ? { ...entity.artist, id } : undefined,
      venue: entity.venue ? { ...entity.venue, id } : undefined,
    } as ManagedEntity);
    navigate(entity.type === 'artist' ? `/tabs/artist/${id}` : `/tabs/venue/${id}`, { replace: true });
  };

  return (
    <div className="px-4 pb-10">
      <SettingsGroup label="Actuar como">
        <SettingsItem icon={<IconBriefcase size={18} />} title="Tú" value={activeWorkspace ? null : 'Ahora'}>
          {activeWorkspace ? (
            <button type="button" onClick={() => actAs(null)} className="min-h-11 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink">
              Usar
            </button>
          ) : null}
        </SettingsItem>
        {entities.map(entity => (
          <SettingsItem
            key={entity.subject_id}
            icon={<Avatar name={entityName(entity) || '?'} kind={entity.type as 'artist' | 'venue'} className="h-8 w-8" />}
            title={entityName(entity) || (entity.type === 'artist' ? 'Artista' : 'Sala')}
            value={activeWorkspace?.subject_id === entity.subject_id ? 'Ahora' : entity.type === 'artist' ? 'Artista' : 'Sala'}
          >
            {activeWorkspace?.subject_id === entity.subject_id ? null : (
              <button type="button" onClick={() => actAs(entity)} className="min-h-11 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink">
                Usar
              </button>
            )}
          </SettingsItem>
        ))}
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow to="/gestion" icon={<IconBriefcase size={18} />} title="Panel de gestión" value="Eventos · setlist · QR" />
      </SettingsGroup>
      <SettingsHelp>
        Para gestionar otro artista o sala, búscalo y pulsa «Reclamar» en su página. Lo revisamos y te avisamos.
      </SettingsHelp>
    </div>
  );
};

// --- Privacidad ------------------------------------------------------------

type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown';

const useLocationPermission = () => {
  const [state, setState] = useState<PermissionState>('unknown');
  useEffect(() => {
    let active = true;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then(status => {
        if (active) setState(status.state as PermissionState);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return state;
};

const LOCATION_LABELS: Record<PermissionState, string> = {
  granted: 'Permitida',
  denied: 'No permitida',
  prompt: 'Se pide al usarla',
  unknown: 'Se pide al usarla',
};

export const PrivacyPage: React.FC = () => {
  const blocked = useBlockedUserIds();
  const { items: hidden } = useHiddenOnMap();
  const location = useLocationPermission();
  const [allowReuse, setAllowReuse] = useState(getReuseConsent);

  return (
    <div className="px-4 pb-10">
      <SettingsGroup label="Tus momentos">
        <SettingsItem icon={<IconShield size={18} />} title="Reutilización">
          <Switch
            checked={allowReuse}
            label="Permitir que el artista y la sala reutilicen tus momentos citándote"
            onChange={value => {
              setAllowReuse(value);
              setReuseConsent(value);
            }}
          />
        </SettingsItem>
      </SettingsGroup>
      <SettingsHelp>
        Al publicar, el artista y la sala del concierto pueden compartir el momento citándote. Si lo apagas, tus
        próximas subidas no se podrán reutilizar; también lo cambias en cada momento. <Link to={legalAppPath('licencia-momentos')} className="text-app-accent">Licencia</Link>
      </SettingsHelp>

      <AnalyticsSharingSetting
        privacyLink={<Link to={legalAppPath('privacidad')} className="text-app-accent">Privacidad</Link>}
      />

      <SettingsGroup label="Personas y mapa">
        <SettingsRow to="/ajustes/bloqueados" icon={<IconBlock size={18} />} title="Usuarios bloqueados" value={String(blocked.size)} />
        <SettingsRow to="/ajustes/ocultos-mapa" icon={<IconEyeOff size={18} />} title="Ocultos del mapa" value={String(hidden.length)} />
      </SettingsGroup>

      <SettingsGroup label="Dispositivo">
        <SettingsItem icon={<IconLocate size={18} />} title="Ubicación" value={LOCATION_LABELS[location]} />
      </SettingsGroup>
      <SettingsHelp>
        Solo se usa, si la permites, para centrar el mapa y enseñarte conciertos cerca. Se queda en el móvil; para
        buscar conciertos cercanos enviamos una zona aproximada, nunca la guardamos. Cámbialo en los ajustes del sistema
        → Live Space → Ubicación.
      </SettingsHelp>
    </div>
  );
};

export const BlockedUsersPage: React.FC = () => (
  <div className="px-4 pb-10 pt-4">
    <BlockedUsersList />
    <SettingsHelp>No ves sus momentos ni su perfil, y no ven los tuyos. No les avisamos.</SettingsHelp>
  </div>
);

export const HiddenOnMapPage: React.FC = () => (
  <div className="px-4 pb-10 pt-4">
    <HiddenOnMapList />
  </div>
);

// --- Cuenta ----------------------------------------------------------------

export const AccountPage: React.FC = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const method = useSignInMethod();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const handleSignOut = async () => {
    setError('');
    setSigningOut(true);
    try {
      await signOut();
      navigate('/welcome', { replace: true });
    } catch {
      setError('No se ha podido cerrar sesión. Revisa tu conexión.');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <div className="px-4 pb-10">
      <SettingsGroup>
        <SettingsItem icon={<IconInfo size={18} />} title="Email" value={user?.email || '—'} />
        <SettingsItem icon={<IconShield size={18} />} title="Entras con" value={method || '—'} />
      </SettingsGroup>
      <SettingsGroup>
        <li>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            disabled={signingOut}
            className="flex min-h-[54px] w-full items-center gap-3 px-3.5 py-2 text-left disabled:opacity-60"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-app-accent/15 text-app-accent">
              <IconLogout size={18} />
            </span>
            <span className="flex-1 text-[16px] font-semibold text-app-ink">{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</span>
          </button>
        </li>
      </SettingsGroup>
      {error ? <p className="m-0 mt-2 px-1 text-sm text-rose-400">{error}</p> : null}
      <section className="mt-10">
        <h2 className="m-0 mb-2 flex items-center gap-2 px-1 text-[12px] font-semibold uppercase tracking-[0.14em] text-rose-300/80">
          <IconTrash size={14} />
          Zona peligrosa
        </h2>
        <DeleteAccountSection />
        <SettingsHelp>
          Borra tu cuenta y todo lo que has subido. No se puede deshacer.{' '}
          <Link to={legalAppPath('borrar-cuenta')} className="text-app-accent">Qué se borra</Link>
        </SettingsHelp>
      </section>
    </div>
  );
};

// --- Legal -----------------------------------------------------------------

export const LegalListPage: React.FC = () => (
  <div className="px-4 pb-10">
    <SettingsGroup>
      <SettingsRow to={legalAppPath('privacidad')} icon={<IconShield size={18} />} title="Política de privacidad" />
      <SettingsRow to={legalAppPath('condiciones')} icon={<IconDocument size={18} />} title="Condiciones de uso" />
      <SettingsRow to={legalAppPath('licencia-momentos')} icon={<IconDocument size={18} />} title="Licencia de los momentos" />
      <SettingsRow to={legalAppPath('borrar-cuenta')} icon={<IconTrash size={18} />} title="Borrar tu cuenta" />
    </SettingsGroup>
    {LEGAL_CONTACT_EMAIL ? <SettingsHelp>Dudas o peticiones sobre tus datos: {LEGAL_CONTACT_EMAIL}</SettingsHelp> : null}
  </div>
);

// --- Acerca de -------------------------------------------------------------

declare const __APP_VERSION__: string | undefined;

export const useAppVersion = () => {
  const bundled = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '';
  const [version, setVersion] = useState(bundled);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    CapacitorApp.getInfo()
      .then(info => setVersion(`${info.version} (${info.build})`))
      .catch(() => undefined);
  }, []);
  return version;
};

export const AboutPage: React.FC = () => {
  const version = useAppVersion();
  const [dev, setDev] = useState(isDevMode);
  const taps = useRef(0);
  // Seven taps on «Versión» turn on the developer tools (push token).
  const tapVersion = () => {
    taps.current += 1;
    if (taps.current >= 7 && !dev) {
      enableDevMode();
      setDev(true);
    }
  };
  return (
    <div className="px-4 pb-10">
      <div onClick={tapVersion}>
        <SettingsGroup>
          <SettingsItem icon={<IconInfo size={18} />} title="Versión" value={version || '—'} />
        </SettingsGroup>
      </div>
      <SettingsHelp>Live Space: los conciertos, contados por el público.</SettingsHelp>
      {dev ? <PushTokenDevPanel /> : null}
    </div>
  );
};

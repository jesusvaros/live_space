import React from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Content, Page } from '../../components/ui/AppPrimitives';
import { IconBriefcase, IconDocument, IconInfo, IconShield, IconUser } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { useBlockedUserIds } from '../blocks/useBlockedUsers';
import { useHiddenOnMap } from '../hiddenMap/useHiddenOnMap';
import ProfileSettingsPage from './ProfileSettingsPage';
import {
  AboutPage,
  AccountPage,
  BlockedUsersPage,
  HiddenOnMapPage,
  LegalListPage,
  ManagementPage,
  PrivacyPage,
  useAppVersion,
} from './SettingsPages';
import { SettingsGroup, SettingsRow, SettingsTopBar } from './SettingsList';
import { isSettingsSection, SETTINGS_SECTIONS, type SettingsSection } from './settingsPaths';

// Ajustes: groups of rows with their current value, each opening its own
// page (/ajustes/:section), like the system settings of iOS and Android.
// Reached from the gear in the Perfil header.

const PAGES: Record<SettingsSection, () => React.ReactNode> = {
  perfil: () => <div className="px-4 pb-10 pt-4"><ProfileSettingsPage /></div>,
  gestion: () => <ManagementPage />,
  privacidad: () => <PrivacyPage />,
  bloqueados: () => <BlockedUsersPage />,
  'ocultos-mapa': () => <HiddenOnMapPage />,
  cuenta: () => <AccountPage />,
  legal: () => <LegalListPage />,
  acerca: () => <AboutPage />,
};

const SettingsHome: React.FC = () => {
  const { profile, user } = useAuth();
  const { managedEntities } = useWorkspace();
  const blocked = useBlockedUserIds();
  const { items: hidden } = useHiddenOnMap();
  const version = useAppVersion();
  const managed = managedEntities.filter(entity => entity.type === 'artist' || entity.type === 'venue').length;
  const privacyValue = blocked.size + hidden.length > 0
    ? [blocked.size ? `${blocked.size} bloqueados` : '', hidden.length ? `${hidden.length} ocultos` : ''].filter(Boolean).join(' · ')
    : null;

  return (
    <div className="px-4 pb-[calc(40px+env(safe-area-inset-bottom,0px))]">
      <SettingsGroup>
        <SettingsRow
          to="/ajustes/perfil"
          icon={<IconUser size={18} />}
          title="Perfil"
          value={profile?.username ? `@${profile.username}` : profile?.display_name}
        />
        {managed > 0 ? (
          <SettingsRow to="/ajustes/gestion" icon={<IconBriefcase size={18} />} title="Gestión" value={String(managed)} />
        ) : null}
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow to="/ajustes/privacidad" icon={<IconShield size={18} />} title="Privacidad" value={privacyValue} />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow to="/ajustes/cuenta" icon={<IconUser size={18} />} title="Cuenta" value={user?.email} />
      </SettingsGroup>
      <SettingsGroup>
        <SettingsRow to="/ajustes/legal" icon={<IconDocument size={18} />} title="Legal" value="Privacidad · condiciones" />
        <SettingsRow to="/ajustes/acerca" icon={<IconInfo size={18} />} title="Acerca de" value={version ? `v${version}` : null} />
      </SettingsGroup>
    </div>
  );
};

const SettingsScreen: React.FC = () => {
  const { section } = useParams<{ section?: string }>();
  const { managedEntities, ready } = useWorkspace();

  if (section !== undefined && !isSettingsSection(section)) return <Navigate to="/ajustes" replace />;
  // Gestión only exists for people who manage an artist or venue.
  if (section === 'gestion' && ready && !managedEntities.some(entity => entity.type === 'artist' || entity.type === 'venue')) {
    return <Navigate to="/ajustes" replace />;
  }
  const meta = section ? SETTINGS_SECTIONS[section] : null;

  return (
    <Page>
      <Content fullscreen>
        <div className="min-h-full bg-app-bg">
          <SettingsTopBar title={meta ? meta.title : 'Ajustes'} back={meta ? meta.back : '/tabs/profile'} />
          {section ? PAGES[section]() : <SettingsHome />}
        </div>
      </Content>
    </Page>
  );
};

export default SettingsScreen;

import React from 'react';
import GestionShell from '../../features/management/GestionShell';
import ProfileEditor from '../../features/management/ProfileEditor';
import TeamView from '../../features/management/TeamView';
import type { TeamInvite, TeamMember } from '../../services/team.service';

// DEV ONLY (mounted under import.meta.env.DEV in App.tsx): the management
// screens of phase 1 with invented data and no account.
// ?vista=perfil | sala | equipo.

const wait = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const DAY = 24 * 60 * 60 * 1000;

const MEMBERS: TeamMember[] = [
  { profileId: 'me', role: 'admin', username: 'lucia', displayName: 'Lucía Prado', avatarUrl: null, createdAt: '2026-11-01' },
  { profileId: 'p2', role: 'editor', username: 'marcos.booking', displayName: 'Marcos', avatarUrl: '/fotos/publico-escenario.jpg', createdAt: '2026-11-10' },
  { profileId: 'p3', role: 'moderator', username: 'ana_fotos', displayName: null, avatarUrl: null, createdAt: '2026-11-12' },
];

const INVITES: TeamInvite[] = [
  {
    id: 'i1',
    role: 'editor',
    email: 'prensa@sala.com',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 6 * DAY).toISOString(),
    acceptedAt: null,
    revokedAt: null,
  },
];

const TeamPlayground: React.FC = () => {
  const view = new URLSearchParams(window.location.search).get('vista') || 'perfil';

  if (view === 'equipo') {
    return (
      <GestionShell kicker="Sala Lobo" title="Equipo">
        <TeamView
          entityName="Sala Lobo"
          members={MEMBERS}
          invites={INVITES}
          currentUserId="me"
          canAdmin
          onCreateInvite={async () => {
            await wait(300);
            return 'https://livespace-dusky.vercel.app/unirse?equipo=Zq4mN8xT2vLp9RkW3sYb7HcD';
          }}
          onRevokeInvite={() => wait(200)}
          onChangeRole={() => wait(200)}
          onRemove={() => wait(200)}
        />
      </GestionShell>
    );
  }

  const venue = view === 'sala';
  return (
    <GestionShell title="Mi perfil" flushBottom>
      <ProfileEditor
        kind={venue ? 'venue' : 'artist'}
        name={venue ? 'Sala Lobo' : 'Los Lobos'}
        initial={{
          photoUrl: '/fotos/multitud-escenario.jpg',
          city: 'Madrid',
          bio: venue ? '' : 'Rock de garaje desde Vallecas. Tres guitarras y ninguna prisa.',
          genres: venue ? [] : ['Rock', 'Punk'],
          links: venue ? {} : { instagram: 'https://www.instagram.com/loslobos', spotify: '' },
          address: venue ? 'Calle del Lobo 12' : '',
          capacity: venue ? '450' : '',
          website: venue ? 'https://salalobo.es' : '',
        }}
        onUploadPhoto={async () => {
          await wait(400);
          return '/fotos/publico-escenario.jpg';
        }}
        onSave={() => wait(400)}
      />
    </GestionShell>
  );
};

export default TeamPlayground;

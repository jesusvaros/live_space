import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/ui/AppPrimitives';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import GestionShell from '../features/management/GestionShell';
import TeamView from '../features/management/TeamView';
import { canAdminTeam, inviteUrl } from '../features/management/profileForm';
import { publicAppBaseUrl } from '../lib/uploadQr';
import { teamService, type TeamInvite, type TeamMember } from '../services/team.service';

// /gestion/equipo: the team of the active artist or venue.

const GestionEquipo: React.FC = () => {
  const { user } = useAuth();
  const { activeWorkspace, ready } = useWorkspace();
  const entity = activeWorkspace && (activeWorkspace.type === 'artist' || activeWorkspace.type === 'venue') ? activeWorkspace : null;
  const name = entity?.artist?.name || entity?.venue?.name || 'Tu perfil';
  const canAdmin = canAdminTeam(entity?.role);

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!entity) {
      setLoading(false);
      return;
    }
    setError('');
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        teamService.listMembers(entity.subject_id),
        canAdmin ? teamService.listInvites(entity.subject_id) : Promise.resolve([]),
      ]);
      setMembers(nextMembers);
      setInvites(nextInvites);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido cargar el equipo.');
    } finally {
      setLoading(false);
    }
  }, [entity?.subject_id, canAdmin]);

  useEffect(() => {
    void load();
  }, [load]);

  let body: React.ReactNode;
  if (!ready || loading) {
    body = <div className="flex justify-center py-16"><Spinner /></div>;
  } else if (!entity) {
    body = (
      <p className="pt-6 text-sm text-white/65">
        Elige qué perfil gestionas en <Link to="/gestion" className="font-semibold text-app-ink underline">el panel</Link>.
      </p>
    );
  } else if (error) {
    body = <p className="pt-6 text-sm text-rose-300">{error}</p>;
  } else {
    body = (
      <TeamView
        entityName={name}
        members={members}
        invites={invites}
        currentUserId={user?.id ?? null}
        canAdmin={canAdmin}
        onCreateInvite={async (role, email) => {
          const token = await teamService.createInvite(entity.subject_id, role, email);
          await load();
          return inviteUrl(publicAppBaseUrl(), token);
        }}
        onRevokeInvite={async inviteId => {
          await teamService.revokeInvite(inviteId);
          await load();
        }}
        onChangeRole={async (profileId, role) => {
          await teamService.changeRole(entity.subject_id, profileId, role);
          await load();
        }}
        onRemove={async profileId => {
          await teamService.removeMember(entity.subject_id, profileId);
          await load();
        }}
      />
    );
  }

  return (
    <GestionShell kicker={name} title="Equipo">
      {body}
    </GestionShell>
  );
};

export default GestionEquipo;

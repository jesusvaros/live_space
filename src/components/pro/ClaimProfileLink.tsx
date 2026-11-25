import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { claimsService, ClaimEntityType } from '../../services/claims.service';
import { IconBriefcase } from '../icons';

type ClaimProfileLinkProps = {
  type: ClaimEntityType;
  entityId: string | null | undefined;
  subjectId?: string | null;
  className?: string;
  // 'menu': a row in the page's «Más opciones» sheet; 'footer': the old link under the page.
  variant?: 'footer' | 'menu';
};

// In the «Más opciones» menu of an artist or venue page (variant 'menu'), or
// the footer of a festival page. Members get the way into the management
// panel; everyone else a discreet "is this you?" link to claim the profile.
const ClaimProfileLink: React.FC<ClaimProfileLinkProps> = ({ type, entityId, subjectId, className = '', variant = 'footer' }) => {
  const { user } = useAuth();
  const { managedEntities, setActiveWorkspace } = useWorkspace();
  const [pending, setPending] = useState(false);

  const membership = managedEntities.find(entity =>
    entity.type === type &&
    ((type === 'artist' ? entity.artist?.id : entity.venue?.id) === entityId || (subjectId && entity.subject_id === subjectId)),
  );

  useEffect(() => {
    if (!user?.id || !subjectId || membership) return undefined;
    let cancelled = false;
    claimsService
      .getMyClaim(subjectId, user.id)
      .then(claim => {
        if (!cancelled) setPending(claim?.status === 'pending');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.id, subjectId, membership]);

  if (!entityId) return null;

  if (variant === 'menu') {
    const row =
      'flex min-h-12 items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-4 text-left text-[15px] font-semibold text-app-ink';
    if (membership) {
      return (
        <Link to="/gestion" onClick={() => setActiveWorkspace(membership)} className={row}>
          <IconBriefcase size={20} />
          Panel de gestión
        </Link>
      );
    }
    if (pending) {
      return <p className="m-0 px-1 text-sm text-white/60">Tu solicitud para gestionar este perfil está pendiente de verificación.</p>;
    }
    return (
      <Link to={user ? `/reclamar/${type}/${entityId}` : '/welcome'} className={row}>
        <IconBriefcase size={20} />
        ¿Eres tú? Gestiona este perfil
      </Link>
    );
  }

  if (membership) {
    return (
      <div className={`flex justify-center py-2 ${className}`}>
        <Link
          to="/gestion"
          onClick={() => setActiveWorkspace(membership)}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app-line bg-app-surface px-4 text-sm font-semibold text-app-ink transition hover:border-white/30"
        >
          <IconBriefcase size={16} />
          Panel de gestión
        </Link>
      </div>
    );
  }

  if (pending) {
    return (
      <p className={`py-3 text-center font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50 ${className}`}>
        Tu solicitud está pendiente de verificación
      </p>
    );
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <Link
        to={user ? `/reclamar/${type}/${entityId}` : '/welcome'}
        className="inline-flex min-h-11 items-center px-3 text-[13px] text-white/50 underline decoration-white/20 underline-offset-4 transition hover:text-white/80"
      >
        ¿Eres tú? Gestiona este perfil
      </Link>
    </div>
  );
};

export default ClaimProfileLink;

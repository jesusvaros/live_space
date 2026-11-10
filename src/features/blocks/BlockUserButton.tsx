import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Modal } from '../../components/ui/AppPrimitives';
import { IconBlock } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { rememberReturnTo } from '../../auth/returnTo';
import { blockUser, unblockUser, useBlockedUserIds } from './useBlockedUsers';

type BlockUserButtonProps = {
  profileId: string | null | undefined;
  // "@usuario" (blockTargetLabel).
  label: string;
  className?: string;
  onBlocked?: () => void;
};

/**
 * «Bloquear a @usuario», with a confirmation. Blocked already: «Desbloquear».
 * Signed out: asks for an account (back here afterwards). Renders nothing on
 * your own content.
 */
const BlockUserButton: React.FC<BlockUserButtonProps> = ({ profileId, label, className, onBlocked }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const blocked = useBlockedUserIds();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!profileId || user?.id === profileId) return null;
  const isBlocked = blocked.has(profileId);

  const onClick = async () => {
    setError('');
    if (!user) {
      rememberReturnTo(`${location.pathname}${location.search}`);
      navigate('/welcome');
      return;
    }
    if (!isBlocked) {
      setConfirming(true);
      return;
    }
    setBusy(true);
    try {
      await unblockUser(user.id, profileId);
    } catch {
      setError('No se ha podido desbloquear. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!user) return;
    setBusy(true);
    setError('');
    try {
      await blockUser(user.id, profileId);
      setConfirming(false);
      onBlocked?.();
    } catch {
      setError('No se ha podido bloquear. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        className={
          className
          ?? 'inline-flex min-h-11 items-center gap-2 self-start text-sm text-white/60 disabled:opacity-50'
        }
      >
        <IconBlock size={16} />
        {isBlocked ? `Desbloquear a ${label}` : `Bloquear a ${label}`}
      </button>
      {error && !confirming ? <p className="m-0 text-sm text-rose-400">{error}</p> : null}
      <Modal isOpen={confirming} onDidDismiss={() => setConfirming(false)} initialBreakpoint={0.5} title={`Bloquear a ${label}`}>
        <div className="flex flex-col gap-3 p-5 pb-[calc(20px+env(safe-area-inset-bottom,0px))]">
          <h3 className="m-0 font-display text-xl font-bold text-app-ink">¿Bloquear a {label}?</h3>
          <p className="m-0 text-sm leading-relaxed text-white/70">
            Dejarás de ver sus momentos y su perfil, y no verá los tuyos. No le avisamos. Puedes desbloquear cuando
            quieras en Ajustes → Privacidad.
          </p>
          {error ? <p className="m-0 text-sm text-rose-400">{error}</p> : null}
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={busy}
            className="mt-1 min-h-12 rounded-full bg-rose-500 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Bloqueando…' : `Bloquear a ${label}`}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="min-h-12 rounded-full bg-white/10 text-sm font-semibold text-app-ink"
          >
            Cancelar
          </button>
        </div>
      </Modal>
    </>
  );
};

export default BlockUserButton;

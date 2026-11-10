import React, { useEffect, useState } from 'react';
import Avatar from '../../components/ui/Avatar';
import { Spinner } from '../../components/ui/AppPrimitives';
import { useAuth } from '../../contexts/AuthContext';
import { blockTargetLabel } from './blocking';
import { fetchBlockedProfiles, unblockUser, type BlockedProfile } from './useBlockedUsers';

/** Ajustes → Privacidad → Usuarios bloqueados: the list, with «Desbloquear». */
const BlockedUsersList: React.FC = () => {
  const { user } = useAuth();
  const [rows, setRows] = useState<BlockedProfile[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchBlockedProfiles(user.id)
      .then(next => active && setRows(next))
      .catch(() => {
        if (!active) return;
        setRows([]);
        setError('No se ha podido cargar la lista. Revisa tu conexión.');
      });
    return () => {
      active = false;
    };
  }, [user]);

  const unblock = async (id: string) => {
    if (!user) return;
    setError('');
    try {
      await unblockUser(user.id, id);
      setRows(current => (current || []).filter(row => row.id !== id));
    } catch {
      setError('No se ha podido desbloquear. Inténtalo de nuevo.');
    }
  };

  if (!rows) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="m-0 text-sm text-rose-400">{error}</p> : null}
      {rows.length === 0 ? (
        <p className="m-0 px-1 text-sm text-white/60">No has bloqueado a nadie.</p>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-2xl bg-app-surface p-0">
          {rows.map(row => {
            const label = row.username || row.display_name ? blockTargetLabel(row) : 'Perfil privado';
            return (
              <li key={row.id} className="flex min-h-14 items-center gap-3 border-t border-app-line px-3.5 py-2 first:border-t-0">
                <Avatar name={label} src={row.avatar_url} className="h-9 w-9" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-app-ink">{label}</span>
                <button
                  type="button"
                  onClick={() => void unblock(row.id)}
                  className="min-h-11 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
                >
                  Desbloquear
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default BlockedUsersList;

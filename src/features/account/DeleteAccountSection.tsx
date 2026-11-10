import React, { useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Modal, useToast } from '../../components/ui/AppPrimitives';
import { IconTrash } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import { leaveProtectedPageTo } from '../../auth/returnTo';
import { LEGAL_CONTACT_EMAIL } from '../legal/config';
import { DELETE_CONFIRMATION_WORD, deleteMyAccount, isDeleteConfirmed } from './deleteAccount';

const WHAT_GOES = [
  'Tu cuenta y tu perfil (nombre, usuario, ciudad, bio y enlaces).',
  'Todos los momentos que has subido: fotos y vídeos.',
  'Tus me gusta, a quién sigues y quién te sigue.',
  'Tus conciertos guardados y tus asistencias («Voy», «Fui»).',
  'Tus bloqueos, reportes y lo que ocultaste del mapa.',
];

/** Ajustes → Cuenta → «Eliminar cuenta», with what goes and type-to-confirm. */
const DeleteAccountSection: React.FC = () => {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { presentToast } = useToast();
  const inputId = useId();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const close = () => {
    if (busy) return;
    setOpen(false);
    setTyped('');
    setError('');
  };

  const confirm = async () => {
    if (!isDeleteConfirmed(typed)) return;
    setBusy(true);
    setError('');
    const result = await deleteMyAccount();
    if (!result.ok) {
      setBusy(false);
      setError(
        result.reason === 'unavailable'
          ? `Ahora mismo no podemos borrarla desde la app. Pídelo en ${LEGAL_CONTACT_EMAIL || 'la página «Borrar cuenta»'} y lo hacemos nosotros.`
          : 'No se ha podido eliminar la cuenta. Revisa tu conexión y vuelve a intentarlo.',
      );
      return;
    }
    // Leave Ajustes first (it requires an account, and would send the
    // signed-out person to /welcome), then drop the session on this device.
    setOpen(false);
    leaveProtectedPageTo('/tabs/events');
    navigate('/tabs/events', { replace: true });
    presentToast({ message: 'Tu cuenta se ha eliminado.', duration: 3500 });
    await signOut().catch(() => undefined);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/10 px-4 text-sm font-semibold text-rose-200"
      >
        <IconTrash size={18} />
        Eliminar cuenta
      </button>
      <Modal isOpen={open} onDidDismiss={close} initialBreakpoint={0.9} title="Eliminar cuenta">
        <div className="max-h-[88dvh] overflow-y-auto p-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))]">
          <h3 className="m-0 font-display text-2xl font-bold text-app-ink">¿Eliminar tu cuenta?</h3>
          <p className="m-0 mt-2 text-sm text-white/70">Se borra para siempre y no se puede deshacer:</p>
          <ul className="m-0 mt-3 flex list-disc flex-col gap-1.5 pl-5 text-sm leading-relaxed text-white/80 marker:text-rose-300">
            {WHAT_GOES.map(item => <li key={item}>{item}</li>)}
          </ul>
          <p className="m-0 mt-3 text-xs leading-relaxed text-white/55">
            Los artistas y salas que gestionas no se borran: solo dejas de gestionarlos. Los archivos desaparecen de
            nuestros servidores en un día como mucho y las copias de seguridad en 14 días.
          </p>
          <label htmlFor={inputId} className="mt-5 block text-sm font-medium text-white/80">
            Escribe <strong className="text-app-ink">{DELETE_CONFIRMATION_WORD}</strong> para confirmar
          </label>
          <input
            id={inputId}
            value={typed}
            onChange={event => setTyped(event.target.value)}
            autoCapitalize="characters"
            autoComplete="off"
            className="mt-2 min-h-12 w-full rounded-2xl border border-white/15 bg-black/40 px-4 text-base text-white focus:border-rose-400 focus:outline-none"
          />
          {error ? <p role="alert" className="m-0 mt-3 text-sm text-rose-300">{error}</p> : null}
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={!isDeleteConfirmed(typed) || busy}
            className="mt-5 min-h-12 w-full rounded-full bg-rose-500 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Eliminando…' : 'Eliminar mi cuenta para siempre'}
          </button>
          <button
            type="button"
            onClick={close}
            disabled={busy}
            className="mt-2 min-h-12 w-full rounded-full bg-white/10 text-sm font-semibold text-app-ink"
          >
            Cancelar
          </button>
        </div>
      </Modal>
    </>
  );
};

export default DeleteAccountSection;

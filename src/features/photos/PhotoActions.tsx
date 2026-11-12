import React, { useEffect, useState } from 'react';
import { IconEyeOff, IconHeart, IconHeartFilled, IconTrash } from '../../components/icons';
import type { TimelineMoment } from '../moments/concertTimeline';

// What a viewer can do with a photo: save it (♥, their likes → «Guardadas»),
// hide it for themselves, and — on their own photos — delete it. Shared by
// the full-screen viewer (bar) and the long-press sheet in the grids.

export type PhotoActionHandlers = {
  currentUserId: string | null;
  savedIds: ReadonlySet<string>;
  onToggleSave: (photo: TimelineMoment) => void;
  // Not offered where hiding makes no sense (Guardadas).
  onHide?: (photo: TimelineMoment) => void;
  onDelete: (photo: TimelineMoment) => Promise<void>;
};

type PhotoActionsProps = PhotoActionHandlers & {
  photo: TimelineMoment;
  variant: 'bar' | 'sheet';
  // The sheet closes after an action.
  onDone?: () => void;
};

const PhotoActions: React.FC<PhotoActionsProps> = ({
  photo,
  variant,
  currentUserId,
  savedIds,
  onToggleSave,
  onHide,
  onDelete,
  onDone,
}) => {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const saved = savedIds.has(photo.id);
  const mine = Boolean(currentUserId && photo.userId === currentUserId);

  useEffect(() => {
    setConfirmDelete(false);
  }, [photo.id]);

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setDeleting(true);
    try {
      await onDelete(photo);
      onDone?.();
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  if (variant === 'sheet') {
    const row = 'flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-3.5 text-left text-[15px] font-semibold';
    return (
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          aria-pressed={saved}
          onClick={() => {
            onToggleSave(photo);
            onDone?.();
          }}
          className={`${row} bg-app-surface ${saved ? 'text-app-accent' : 'text-app-ink'}`}
        >
          {saved ? <IconHeartFilled size={20} /> : <IconHeart size={20} />}
          {saved ? 'Quitar de guardadas' : 'Guardar'}
        </button>
        {onHide && !mine ? (
          <button
            type="button"
            onClick={() => {
              onHide(photo);
              onDone?.();
            }}
            className={`${row} bg-app-surface text-app-ink`}
          >
            <IconEyeOff size={20} />
            <span className="min-w-0 flex-1">
              Ocultar
              <span className="block text-[12px] font-normal text-white/50">Deja de verla en este concierto. Solo para ti.</span>
            </span>
          </button>
        ) : null}
        {mine ? (
          <button type="button" disabled={deleting} onClick={remove} className={`${row} bg-rose-500/10 text-rose-400`}>
            <IconTrash size={20} />
            {deleting ? 'Eliminando…' : confirmDelete ? 'Toca otra vez para eliminarla' : 'Eliminar'}
          </button>
        ) : null}
      </div>
    );
  }

  const pill = 'flex h-11 items-center gap-2 rounded-full px-4 text-[14px] font-bold backdrop-blur-md';
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={saved}
        aria-label={saved ? 'Quitar de guardadas' : 'Guardar'}
        onClick={() => onToggleSave(photo)}
        className={`${pill} ${saved ? 'bg-app-accent text-[#14151a]' : 'bg-white/15 text-white'}`}
      >
        {saved ? <IconHeartFilled size={19} /> : <IconHeart size={19} />}
        {saved ? 'Guardada' : 'Guardar'}
      </button>
      {onHide && !mine ? (
        <button type="button" onClick={() => onHide(photo)} className={`${pill} bg-white/15 text-white`}>
          <IconEyeOff size={19} />
          Ocultar
        </button>
      ) : null}
      {mine ? (
        <button
          type="button"
          disabled={deleting}
          onClick={remove}
          className={`${pill} ${confirmDelete ? 'bg-rose-500 text-white' : 'bg-white/15 text-rose-300'}`}
        >
          <IconTrash size={19} />
          {deleting ? 'Eliminando…' : confirmDelete ? '¿Eliminar?' : 'Eliminar'}
        </button>
      ) : null}
    </div>
  );
};

export default PhotoActions;

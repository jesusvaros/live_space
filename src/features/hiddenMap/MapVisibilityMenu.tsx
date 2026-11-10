import React, { useState } from 'react';
import { Modal, useToast } from '../../components/ui/AppPrimitives';
import { IconEye, IconEyeOff, IconMore } from '../../components/icons';
import type { HiddenMapType } from './hiddenMap';
import { useHiddenOnMap } from './useHiddenOnMap';

type MapVisibilityMenuProps = {
  type: HiddenMapType;
  id: string | null | undefined;
  name: string;
  imageUrl?: string | null;
};

/**
 * «Más opciones» in the header of an artist or venue page: «Ocultar del mapa»
 * / «Mostrar en el mapa». The only place to hide; undone here or in
 * Ajustes → Privacidad → Ocultos del mapa.
 */
const MapVisibilityMenu: React.FC<MapVisibilityMenuProps> = ({ type, id, name, imageUrl = null }) => {
  const { isHidden, hide, show } = useHiddenOnMap();
  const { presentToast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!id) return null;
  const hidden = isHidden(type, id);

  const toggle = async () => {
    setBusy(true);
    try {
      if (hidden) {
        await show(type, id);
        presentToast({ message: `${name} vuelve a salir en el mapa.` });
      } else {
        await hide({ type, id, name, imageUrl });
        presentToast({ message: `No verás a ${name} en el mapa. Puedes deshacerlo en Ajustes.`, duration: 3500 });
      }
      setOpen(false);
    } catch {
      presentToast({ message: 'No se ha podido guardar. Inténtalo de nuevo.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Más opciones"
        onClick={() => setOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md"
      >
        <IconMore size={22} />
      </button>
      <Modal isOpen={open} onDidDismiss={() => setOpen(false)} initialBreakpoint={0.35} title={`Opciones de ${name}`}>
        <div className="flex flex-col gap-2 p-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))]">
          <p className="m-0 mb-1 truncate text-sm text-white/60">{name}</p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void toggle()}
            className="flex min-h-12 items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-4 text-left text-[15px] font-semibold text-app-ink disabled:opacity-50"
          >
            {hidden ? <IconEye size={20} /> : <IconEyeOff size={20} />}
            {hidden ? 'Mostrar en el mapa' : 'Ocultar del mapa'}
          </button>
          <p className="m-0 px-1 text-xs text-white/50">
            {type === 'venue'
              ? 'Su chincheta deja de salir en tu mapa. La sala y sus conciertos siguen en la agenda.'
              : 'Sus conciertos dejan de salir en tu mapa. El artista sigue en la agenda.'}
          </p>
        </div>
      </Modal>
    </>
  );
};

export default MapVisibilityMenu;

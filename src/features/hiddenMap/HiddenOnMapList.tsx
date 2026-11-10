import React, { useState } from 'react';
import Avatar from '../../components/ui/Avatar';
import { Spinner } from '../../components/ui/AppPrimitives';
import { useHiddenOnMap } from './useHiddenOnMap';

/** Ajustes → Privacidad → Ocultos del mapa: what is hidden, with «Mostrar». */
const HiddenOnMapList: React.FC = () => {
  const { items, ready, show } = useHiddenOnMap();
  const [error, setError] = useState('');

  if (!ready) return <div className="flex justify-center py-8"><Spinner /></div>;

  return (
    <div className="flex flex-col gap-3">
      {error ? <p className="m-0 text-sm text-rose-400">{error}</p> : null}
      {items.length === 0 ? (
        <p className="m-0 px-1 text-sm text-white/60">
          No has ocultado nada. Desde la página de un artista o una sala, en «Más opciones», puedes quitarlo de tu mapa.
        </p>
      ) : (
        <ul className="m-0 list-none overflow-hidden rounded-2xl bg-app-surface p-0">
          {items.map(item => (
            <li key={`${item.type}:${item.id}`} className="flex min-h-14 items-center gap-3 border-t border-app-line px-3.5 py-2 first:border-t-0">
              <Avatar name={item.name} src={item.imageUrl} kind={item.type} className="h-9 w-9" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-semibold text-app-ink">{item.name}</span>
                <span className="block text-xs text-white/55">{item.type === 'artist' ? 'Artista' : 'Sala'}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setError('');
                  show(item.type, item.id).catch(() => setError('No se ha podido guardar. Inténtalo de nuevo.'));
                }}
                className="min-h-11 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
              >
                Mostrar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HiddenOnMapList;

import React from 'react';
import { IconMap } from '../icons';

type ArtistMapSectionProps = {
  hasEvents: boolean;
  artistName: string;
  isManager: boolean;
  onOpenMap: () => void;
  onCreateShow: () => void;
};

const ArtistMapSection: React.FC<ArtistMapSectionProps> = ({
  hasEvents,
  artistName,
  isManager,
  onOpenMap,
  onCreateShow,
}) => (
  <section className="animate-fade-up space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Mapa</p>
        <h2 className="font-display text-xl font-bold text-white">Mapa del artista</h2>
        <p className="text-sm text-white/55">Filtrado por {artistName}.</p>
      </div>
      <button
        type="button"
        onClick={onOpenMap}
        className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 transition-colors hover:border-white/35 hover:text-white"
      >
        <IconMap size={16} />
        Abrir mapa
      </button>
    </div>
    <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] p-5">
      {!hasEvents ? (
        <div className="flex flex-col items-start gap-2 text-white">
          <p className="text-lg font-semibold">Este artista no tiene conciertos que mostrar</p>
          <p className="text-sm text-white/55">
            Los nuevos conciertos aparecerán en el mapa en cuanto se publiquen.
          </p>
          {isManager ? (
            <button
              type="button"
              onClick={onCreateShow}
              className="mt-2 inline-flex items-center justify-center rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.1]"
            >
              Crear concierto
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Vista previa del mapa</p>
          <p className="text-sm text-white/55">
            Abre el mapa para ver dónde toca {artistName}. Empieza filtrado por este artista.
          </p>
          <div className="mt-3 h-40 rounded-xl border border-white/10 bg-[radial-gradient(circle_at_25%_20%,rgba(255,91,46,0.2),transparent_50%),radial-gradient(circle_at_75%_18%,rgba(122,167,255,0.18),transparent_48%),linear-gradient(180deg,rgba(255,255,255,0.04),rgba(0,0,0,0.6))]" />
        </div>
      )}
    </div>
  </section>
);

export default ArtistMapSection;

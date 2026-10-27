import React from 'react';
import { ArtistProfileArtist } from './types';
import { IconMap } from '../icons';

type AboutSectionProps = {
  artist: ArtistProfileArtist;
  isManager: boolean;
  playedCount: number;
  onCreateShow: () => void;
  onOpenMap: () => void;
};

const AboutSection: React.FC<AboutSectionProps> = ({
  artist,
  isManager,
  playedCount,
  onCreateShow,
  onOpenMap,
}) => (
  <section className="animate-fade-up space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Info</p>
      <h2 className="font-display text-xl font-bold text-white">Detalles</h2>
    </div>
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Ciudad</p>
          <p className="text-sm font-semibold text-white">{artist.city || '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Tipo</p>
          <p className="text-sm font-semibold text-white">{artist.artist_type === 'band' ? 'Banda' : 'Solista'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Géneros</p>
          <p className="text-sm font-semibold text-white">
            {artist.genres && artist.genres.length > 0 ? artist.genres.join(', ') : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/60">Conciertos</p>
          <p className="text-sm font-semibold text-white">
            {playedCount > 0 ? `${playedCount} tocados` : 'Próximamente'}
          </p>
        </div>
      </div>
      {isManager && (
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={onCreateShow}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.1]"
          >
            Crear concierto
          </button>
          <button
            type="button"
            onClick={onOpenMap}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:bg-white/[0.1]"
          >
            <IconMap size={14} />
            Ver en el mapa
          </button>
        </div>
      )}
    </div>
  </section>
);

export default AboutSection;

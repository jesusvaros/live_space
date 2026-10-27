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

const ARTIST_TYPES: Record<string, string> = {
  band: 'Banda',
  solo: 'Solista',
  dj: 'DJ',
  collective: 'Colectivo',
};

const AboutSection: React.FC<AboutSectionProps> = ({ artist, isManager, playedCount, onCreateShow, onOpenMap }) => {
  const facts = [
    { label: 'Ciudad', value: artist.city || '—' },
    { label: 'Tipo', value: ARTIST_TYPES[artist.artist_type || ''] || 'Artista' },
    { label: 'Géneros', value: artist.genres?.length ? artist.genres.join(', ') : '—' },
    { label: 'Conciertos', value: playedCount > 0 ? String(playedCount) : '—' },
  ];

  return (
    <section className="flex flex-col gap-4">
      {artist.bio ? <p className="text-[15px] leading-relaxed text-[#e4e0d8]">{artist.bio}</p> : null}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-app-line bg-app-line">
        {facts.map(fact => (
          <div key={fact.label} className="bg-app-surface p-3">
            <dt className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">{fact.label}</dt>
            <dd className="mt-1 text-sm font-semibold text-app-ink">{fact.value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onOpenMap}
          className="inline-flex min-h-11 items-center gap-2 rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
        >
          <IconMap size={16} />
          Ver en el mapa
        </button>
        {isManager ? (
          <button
            type="button"
            onClick={onCreateShow}
            className="inline-flex min-h-11 items-center rounded-full border border-app-line px-4 text-sm font-semibold text-app-ink"
          >
            Crear concierto
          </button>
        ) : null}
      </div>
    </section>
  );
};

export default AboutSection;

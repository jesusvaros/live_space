import React from 'react';
import { IconFilters } from '../icons';
import type { MapArtistFilter } from '../../hooks/useMapFilters';

type MapFilterBarProps = {
  search: string;
  onSearchChange: (value: string) => void;
  artists: MapArtistFilter[];
  onRemoveArtist: (id: string) => void;
  onClearArtists: () => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
};

export const chipClass = (active: boolean) =>
  `inline-flex h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 text-[13px] font-semibold transition-colors ${
    active
      ? 'border-app-accent bg-app-accent text-white'
      : 'border-app-line bg-app-surface/90 text-app-ink/80 backdrop-blur-md hover:text-app-ink'
  }`;

const SearchGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

const MapFilterBar: React.FC<MapFilterBarProps> = ({
  search,
  onSearchChange,
  artists,
  onRemoveArtist,
  onClearArtists,
  activeFilterCount,
  onOpenFilters,
}) => (
  <div className="flex flex-col gap-2">
    <div className="flex items-center gap-2 px-4">
      <label className="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full border border-app-line bg-app-surface/90 pl-4 pr-2 text-app-ink/60 shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md focus-within:border-app-accent/70">
        <SearchGlyph />
        <input
          type="text"
          inputMode="search"
          enterKeyHint="search"
          aria-label="Buscar conciertos"
          placeholder="Artista, sala o ciudad"
          value={search}
          onChange={event => onSearchChange(event.target.value)}
          className="h-full min-w-0 flex-1 appearance-none border-0 bg-transparent p-0 text-[15px] text-app-ink outline-none placeholder:text-app-ink/45"
        />
        {search ? (
          <button
            type="button"
            aria-label="Borrar búsqueda"
            onClick={() => onSearchChange('')}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-ink/60 hover:text-app-ink"
          >
            ✕
          </button>
        ) : null}
      </label>
      <button
        type="button"
        aria-label="Abrir filtros"
        onClick={onOpenFilters}
        className="relative inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface/90 text-app-ink shadow-[0_8px_24px_rgba(0,0,0,0.45)] backdrop-blur-md"
      >
        <IconFilters size={18} />
        {activeFilterCount > 0 ? (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-app-accent px-1 font-mono text-[11px] font-bold text-white">
            {activeFilterCount}
          </span>
        ) : null}
      </button>
    </div>

    {artists.length > 0 ? (
      <div className="flex gap-2 overflow-x-auto px-4 pb-1">
        {artists.map(artist => (
          <span key={artist.id} className={`${chipClass(true)} pr-1`}>
            {artist.avatar_url ? (
              <img src={artist.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
            ) : null}
            {artist.name}
            <button
              type="button"
              onClick={() => onRemoveArtist(artist.id)}
              aria-label={`Quitar ${artist.name}`}
              className="inline-flex h-9 items-center rounded-full bg-black/20 px-3 text-[12px] font-semibold"
            >
              Quitar
            </button>
          </span>
        ))}
        {artists.length > 1 ? (
          <button type="button" className={chipClass(false)} onClick={onClearArtists}>
            Quitar filtro
          </button>
        ) : null}
      </div>
    ) : null}
  </div>
);

export default MapFilterBar;

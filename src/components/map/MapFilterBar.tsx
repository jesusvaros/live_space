import React, { useRef } from 'react';
import { IconFilters } from '../icons';
import { MAP_WHEN_LABELS, toDateInputValue, type MapArtistFilter, type MapWhen } from '../../hooks/useMapFilters';

type MapFilterBarProps = {
  when: MapWhen;
  onWhenChange: (when: MapWhen) => void;
  /** yyyy-mm-dd picked in the calendar, when the "Fecha" chip is active. */
  day: string | null;
  onDayChange: (day: string | null) => void;
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

const CalendarGlyph = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);

const dayLabel = (day: string) =>
  new Date(`${day}T12:00:00`)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/\./g, '');

// Date chips always in sight under the search: the quick ranges plus a
// calendar for a specific day. The same choice shows in the filters sheet.
const DateChips: React.FC<Pick<MapFilterBarProps, 'when' | 'onWhenChange' | 'day' | 'onDayChange'>> = ({
  when,
  onWhenChange,
  day,
  onDayChange,
}) => {
  const dateInput = useRef<HTMLInputElement | null>(null);
  const openCalendar = () => {
    const input = dateInput.current;
    if (!input) return;
    try {
      input.showPicker();
    } catch {
      input.click();
    }
  };
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="group" aria-label="Fechas">
      {(Object.keys(MAP_WHEN_LABELS) as Exclude<MapWhen, 'all' | 'day'>[]).map(value => (
        <button
          key={value}
          type="button"
          aria-pressed={when === value}
          onClick={() => onWhenChange(value)}
          className={chipClass(when === value)}
        >
          {value === 'next30' ? '30 días' : MAP_WHEN_LABELS[value]}
        </button>
      ))}
      <button type="button" aria-pressed={when === 'day'} onClick={openCalendar} className={chipClass(when === 'day')}>
        <CalendarGlyph />
        {when === 'day' && day ? dayLabel(day) : 'Fecha'}
      </button>
      <button type="button" aria-pressed={when === 'all'} onClick={() => onWhenChange('all')} className={chipClass(when === 'all')}>
        Cualquier fecha
      </button>
      <input
        ref={dateInput}
        type="date"
        aria-label="Elegir un día"
        min={toDateInputValue(new Date())}
        value={day ?? ''}
        onChange={event => onDayChange(event.target.value || null)}
        className="pointer-events-none absolute h-0 w-0 opacity-0"
        tabIndex={-1}
      />
    </div>
  );
};

const MapFilterBar: React.FC<MapFilterBarProps> = ({
  when,
  onWhenChange,
  day,
  onDayChange,
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

    <DateChips when={when} onWhenChange={onWhenChange} day={day} onDayChange={onDayChange} />

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

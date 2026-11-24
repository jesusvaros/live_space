import React, { useState } from 'react';
import FilterPills, { FilterSheet, type FilterPill } from '../ui/FilterPills';
import { IconFilters, IconMap } from '../icons';
import { MAP_WHEN_LABELS, toDateInputValue, type MapArtistFilter, type MapWhen } from '../../hooks/useMapFilters';

type MapFilterBarProps = {
  when: MapWhen;
  onWhenChange: (when: MapWhen) => void;
  /** yyyy-mm-dd picked in the calendar, when the "Fecha" chip is active. */
  day: string | null;
  onDayChange: (day: string | null) => void;
  city: string | null;
  cities: string[];
  onCityChange: (city: string | null) => void;
  search: string;
  onSearchChange: (value: string) => void;
  artists: MapArtistFilter[];
  onRemoveArtist: (id: string) => void;
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

// Quick dates always in sight (Hoy, Este finde); «Fecha ▾» opens every range
// plus a calendar, «Ciudad ▾» the cities. What is picked slides to the start.
const QUICK_WHEN: MapWhen[] = ['today', 'weekend'];
const DEFAULT_WHEN: MapWhen = 'next30';

const whenLabel = (when: MapWhen, day: string | null) =>
  when === 'day' ? (day ? dayLabel(day) : 'Fecha') : when === 'all' ? 'Cualquier fecha' : when === 'next30' ? '30 días' : MAP_WHEN_LABELS[when];

const MapFilterBar: React.FC<MapFilterBarProps> = ({
  when,
  onWhenChange,
  day,
  onDayChange,
  city,
  cities,
  onCityChange,
  search,
  onSearchChange,
  artists,
  onRemoveArtist,
  activeFilterCount,
  onOpenFilters,
}) => {
  const [sheet, setSheet] = useState<'when' | 'city' | null>(null);
  const quickWhen = QUICK_WHEN.includes(when);
  const detailedWhen = !quickWhen && when !== DEFAULT_WHEN;
  const pills: FilterPill[] = [
    ...QUICK_WHEN.map(value => ({
      key: `when:${value}`,
      label: whenLabel(value, null),
      selected: when === value,
      onPress: () => onWhenChange(when === value ? DEFAULT_WHEN : value),
    })),
    {
      key: 'when:more',
      label: detailedWhen ? whenLabel(when, day) : 'Fecha',
      icon: <CalendarGlyph />,
      selected: detailedWhen,
      opens: true,
      onPress: () => setSheet('when'),
      onClear: () => onWhenChange(DEFAULT_WHEN),
    },
    ...(cities.length > 1 || city
      ? [
          {
            key: 'city',
            label: city ?? 'Ciudad',
            icon: <IconMap size={15} />,
            selected: Boolean(city),
            opens: true,
            onPress: () => setSheet('city'),
            onClear: () => onCityChange(null),
          },
        ]
      : []),
    ...artists.map(artist => ({
      key: `artist:${artist.id}`,
      label: artist.name,
      icon: artist.avatar_url ? <img src={artist.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" /> : undefined,
      selected: true,
      onPress: () => onRemoveArtist(artist.id),
    })),
  ];

  return (
  <div className="flex flex-col gap-1">
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

    <FilterPills pills={pills} label="Filtros rápidos" className="px-4" />

    <FilterSheet
      isOpen={sheet === 'when'}
      title="Fecha"
      onClose={() => setSheet(null)}
      options={(['today', 'tomorrow', 'weekend', 'week', 'next30', 'all'] as MapWhen[]).map(value => ({
        value,
        label: whenLabel(value, null),
      }))}
      selected={when === 'day' ? null : when}
      onSelect={value => onWhenChange((value as MapWhen | null) ?? DEFAULT_WHEN)}
    >
      <label className="mt-5 flex min-h-12 items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-4 text-sm font-semibold text-app-ink">
        <CalendarGlyph />
        <span className="flex-1">Un día concreto</span>
        <input
          type="date"
          aria-label="Elegir un día"
          min={toDateInputValue(new Date())}
          value={when === 'day' && day ? day : ''}
          onChange={event => {
            onDayChange(event.target.value || null);
            if (event.target.value) setSheet(null);
          }}
          className="bg-transparent text-app-ink [color-scheme:dark]"
        />
      </label>
    </FilterSheet>

    <FilterSheet
      isOpen={sheet === 'city'}
      title="Ciudad"
      onClose={() => setSheet(null)}
      options={cities.map(value => ({ value, label: value }))}
      selected={city}
      onSelect={onCityChange}
    />
  </div>
  );
};

export default MapFilterBar;

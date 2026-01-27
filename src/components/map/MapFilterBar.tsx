import React from 'react';

type MapFilterBarProps = {
  filterToday: boolean;
  filterTomorrow: boolean;
  filterDate: string;
  filterNow: boolean;
  filterFree: boolean;
  showEvents: boolean;
  showVenues: boolean;
  onToggleToday: () => void;
  onToggleTomorrow: () => void;
  onDateChange: (value: string) => void;
  onToggleNow: () => void;
  onToggleFree: () => void;
  onToggleEvents: () => void;
  onToggleVenues: () => void;
  onOpenArtistSearch: () => void;
  onOpenFilters: () => void;
};

const MapFilterBar: React.FC<MapFilterBarProps> = ({
  filterToday,
  filterTomorrow,
  filterDate,
  filterNow,
  filterFree,
  showEvents,
  showVenues,
  onToggleToday,
  onToggleTomorrow,
  onDateChange,
  onToggleNow,
  onToggleFree,
  onToggleEvents,
  onToggleVenues,
  onOpenArtistSearch,
  onOpenFilters,
}) => {
  const baseChip =
    'inline-flex items-center justify-center whitespace-nowrap bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors';
  const inactiveChip = 'text-white/65 hover:text-white/85';
  const activeChip = 'text-app-accent';

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      <button type="button" className={`${baseChip} ${showEvents ? activeChip : inactiveChip}`} onClick={onToggleEvents}>
        Events
      </button>
      <button type="button" className={`${baseChip} ${showVenues ? activeChip : inactiveChip}`} onClick={onToggleVenues}>
        Venues
      </button>
      <button type="button" className={`${baseChip} ${filterToday ? activeChip : inactiveChip}`} onClick={onToggleToday}>
        Today
      </button>
      <button
        type="button"
        className={`${baseChip} ${filterTomorrow ? activeChip : inactiveChip}`}
        onClick={onToggleTomorrow}
      >
        Tomorrow
      </button>
      <label className="flex items-center">
        <input
          type="date"
          value={filterDate}
          onChange={e => onDateChange(e.target.value)}
          className="bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/80"
        />
      </label>
      <button type="button" className={`${baseChip} ${filterNow ? activeChip : inactiveChip}`} onClick={onToggleNow}>
        Now
      </button>
      <button type="button" className={`${baseChip} ${filterFree ? activeChip : inactiveChip}`} onClick={onToggleFree}>
        Free
      </button>
      <button type="button" className={`${baseChip} ${inactiveChip}`} onClick={onOpenArtistSearch}>
        Artist
      </button>
      <button type="button" className={`${baseChip} ${inactiveChip}`} onClick={onOpenFilters}>
        Filters
      </button>
    </div>
  );
};

export default MapFilterBar;

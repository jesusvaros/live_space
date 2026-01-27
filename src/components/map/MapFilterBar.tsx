import React from 'react';

type MapFilterBarProps = {
  showUpcoming: boolean;
  showPast: boolean;
  filterToday: boolean;
  filterTomorrow: boolean;
  filterDate: string;
  filterNow: boolean;
  filterFree: boolean;
  showEvents: boolean;
  showVenues: boolean;
  onToggleUpcoming: () => void;
  onTogglePast: () => void;
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
  filterFree,
  showEvents,
  onToggleToday,
  onToggleTomorrow,
  onToggleFree,
  onToggleEvents,
  onOpenFilters,
}) => {
  const baseChip =
    'inline-flex items-center justify-center whitespace-nowrap rounded-xl bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] transition-colors hover:bg-white/20';
  const inactiveChip = 'text-white/85';
  const activeChip = 'bg-white/20 text-app-accent';

  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      <button type="button" className={`${baseChip} ${showEvents ? activeChip : inactiveChip}`} onClick={onToggleEvents}>
        Events
      </button>
      <button type="button" className={`${baseChip} ${filterToday ? activeChip : inactiveChip}`} onClick={onToggleToday}>
        Today
      </button>
       <button type="button" className={`${baseChip} ${filterFree ? activeChip : inactiveChip}`} onClick={onToggleFree}>
        Free
      </button>
      <button
        type="button"
        className={`${baseChip} ${filterTomorrow ? activeChip : inactiveChip}`}
        onClick={onToggleTomorrow}
      >
        Tomorrow
      </button>
      <button type="button" className={`${baseChip} ${inactiveChip}`} onClick={onOpenFilters}>
        Filters
      </button>
    </div>
  );
};

export default MapFilterBar;

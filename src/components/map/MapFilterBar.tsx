import React from 'react';
import { IconFilters } from '../icons';

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
    'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg bg-white/15 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors hover:bg-white/20';
  const inactiveChip = 'text-white/85';
  const activeChip = 'bg-white/20 text-app-accent';
  const filterIconButton =
    'ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white/85 transition-colors hover:bg-white/20';

  return (
    <div className="flex items-center gap-1 overflow-hidden pb-1">
      <button type="button" className={`${baseChip} ${showEvents ? activeChip : inactiveChip}`} onClick={onToggleEvents}>
        Events
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
      <button type="button" className={`${baseChip} ${filterFree ? activeChip : inactiveChip}`} onClick={onToggleFree}>
        Free
      </button>
      <button
        type="button"
        aria-label="Open filters"
        className={filterIconButton}
        onClick={onOpenFilters}
      >
        <IconFilters size={14} />
      </button>
    </div>
  );
};

export default MapFilterBar;

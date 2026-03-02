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
    'inline-flex h-8 items-center justify-center whitespace-nowrap rounded-lg border px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] transition-all duration-150';
  const inactiveChip = 'border-white/10 bg-white/10 text-white/70 hover:border-white/25 hover:bg-white/15 hover:text-white/90';
  const activeChip =
    'border-app-accent bg-app-accent text-white shadow-[0_8px_18px_rgba(255,107,74,0.34)]';
  const filterIconButton =
    'ml-auto inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white/80 transition-all duration-150 hover:border-white/25 hover:bg-white/15';

  const renderChip = (label: string, active: boolean, onClick: () => void) => (
    <button type="button" className={`${baseChip} ${active ? activeChip : inactiveChip}`} onClick={onClick}>
      {active ? <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" /> : null}
      {label}
    </button>
  );

  return (
    <div className="flex items-center gap-1 overflow-hidden pb-1">
      {renderChip('Events', showEvents, onToggleEvents)}
      {renderChip('Today', filterToday, onToggleToday)}
      {renderChip('Tomorrow', filterTomorrow, onToggleTomorrow)}
      {renderChip('Free', filterFree, onToggleFree)}
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

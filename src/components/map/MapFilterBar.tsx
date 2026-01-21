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
    'inline-flex items-center justify-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] transition whitespace-nowrap';
  const inactiveChip = 'border-white/20 bg-[#0b0f1a]/90 text-slate-100';
  const activeChip =
    'border-[#ff6b4a] bg-[#ff6b4a]/80 text-white shadow-[0_8px_16px_rgba(255,107,74,0.25)]';
  const handleKeyActivate = (action: () => void) => (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      action();
    }
  };
  return (
    <div className="flex flex-wrap gap-2 overflow-x-auto pb-1">
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${showEvents ? activeChip : inactiveChip}`}
        onClick={onToggleEvents}
        onKeyDown={handleKeyActivate(onToggleEvents)}
      >
        🎟 Eventos
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${showVenues ? activeChip : inactiveChip}`}
        onClick={onToggleVenues}
        onKeyDown={handleKeyActivate(onToggleVenues)}
      >
        🏛 Salas
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${filterToday ? activeChip : inactiveChip}`}
        onClick={onToggleToday}
        onKeyDown={handleKeyActivate(onToggleToday)}
      >
        Hoy
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${filterTomorrow ? activeChip : inactiveChip}`}
        onClick={onToggleTomorrow}
        onKeyDown={handleKeyActivate(onToggleTomorrow)}
      >
        Mañana
      </div>
      <label className="flex items-center">
        <input
          type="date"
          value={filterDate}
          onChange={e => onDateChange(e.target.value)}
          className="rounded-full border border-white/20 bg-[#0b0f1a]/90 px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-100"
        />
      </label>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${filterNow ? activeChip : inactiveChip}`}
        onClick={onToggleNow}
        onKeyDown={handleKeyActivate(onToggleNow)}
      >
        ⚡ Ahora
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${filterFree ? activeChip : inactiveChip}`}
        onClick={onToggleFree}
        onKeyDown={handleKeyActivate(onToggleFree)}
      >
        💸 Gratis
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} bg-[#1f2a3d] text-slate-100 border-white/30 shadow-[0_8px_18px_rgba(0,0,0,0.35)]`}
        onClick={onOpenArtistSearch}
        onKeyDown={handleKeyActivate(onOpenArtistSearch)}
      >
        🎤 Artista
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} border-white/10 bg-white/10 text-slate-100`}
        onClick={onOpenFilters}
        onKeyDown={handleKeyActivate(onOpenFilters)}
      >
        Filtros
      </div>
    </div>
  );
};

export default MapFilterBar;

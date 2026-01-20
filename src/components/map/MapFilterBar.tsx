import React from 'react';

type MapFilterBarProps = {
  filterToday: boolean;
  filterTomorrow: boolean;
  filterDate: string;
  filterNow: boolean;
  filterFree: boolean;
  onToggleToday: () => void;
  onToggleTomorrow: () => void;
  onDateChange: (value: string) => void;
  onToggleNow: () => void;
  onToggleFree: () => void;
  onOpenFilters: () => void;
};

const MapFilterBar: React.FC<MapFilterBarProps> = ({
  filterToday,
  filterTomorrow,
  filterDate,
  filterNow,
  filterFree,
  onToggleToday,
  onToggleTomorrow,
  onDateChange,
  onToggleNow,
  onToggleFree,
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
    <div className="flex gap-2 overflow-x-auto pb-1">
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
        Ahora
      </div>
      <div
        role="button"
        tabIndex={0}
        className={`${baseChip} ${filterFree ? activeChip : inactiveChip}`}
        onClick={onToggleFree}
        onKeyDown={handleKeyActivate(onToggleFree)}
      >
        Gratis
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

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
  return (
    <div className="map-filter-row">
      <button
        type="button"
        className={`map-filter-chip ${filterToday ? 'is-active' : ''}`}
        onClick={onToggleToday}
      >
        Hoy
      </button>
      <button
        type="button"
        className={`map-filter-chip ${filterTomorrow ? 'is-active' : ''}`}
        onClick={onToggleTomorrow}
      >
        Mañana
      </button>
      <label className="map-filter-date">
        <input
          type="date"
          value={filterDate}
          onChange={e => onDateChange(e.target.value)}
        />
      </label>
      <button
        type="button"
        className={`map-filter-chip ${filterNow ? 'is-active' : ''}`}
        onClick={onToggleNow}
      >
        Ahora
      </button>
      <button
        type="button"
        className={`map-filter-chip ${filterFree ? 'is-active' : ''}`}
        onClick={onToggleFree}
      >
        Gratis
      </button>
      <button
        type="button"
        className="map-filter-chip map-filter-more"
        onClick={onOpenFilters}
      >
        Filtros
      </button>
    </div>
  );
};

export default MapFilterBar;

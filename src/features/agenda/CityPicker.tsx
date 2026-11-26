import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Spinner } from '../../components/ui/AppPrimitives';
import { IconLocate, IconMap } from '../../components/icons';
import { sameCity } from './agendaPrefs';
import { matchesCity } from './homeCity';

export type CityPickerOption = { name: string; count: number };

const ChevronDown = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 9l6 6 6-6" />
  </svg>
);

const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-3.5-3.5" />
  </svg>
);

type CityButtonProps = {
  /** What the button shows: the city, or «Según tu ubicación». */
  label: string;
  onClick: () => void;
  size?: 'md' | 'lg';
  className?: string;
};

/** The city as a button (pin + name + chevron): tapping it opens the picker. */
export const CityButton: React.FC<CityButtonProps> = ({ label, onClick, size = 'md', className = '' }) => (
  <button
    type="button"
    aria-haspopup="dialog"
    aria-label={`Ciudad: ${label}. Cambiar`}
    onClick={onClick}
    className={`inline-flex min-w-0 items-center gap-1.5 rounded-full border border-app-line bg-app-surface font-semibold text-app-ink ${
      size === 'lg' ? 'min-h-11 pl-3 pr-3.5 text-base' : 'min-h-10 pl-3 pr-3 text-sm'
    } ${className}`}
  >
    <IconMap size={size === 'lg' ? 18 : 16} className="shrink-0 text-app-accent" />
    <span className="truncate">{label}</span>
    <ChevronDown />
  </button>
);

type CityPickerSheetProps = {
  isOpen: boolean;
  onDismiss: () => void;
  /** Cities with concerts, with how many. */
  cities: CityPickerOption[];
  /** The city shown now, marked in the list. */
  current: string | null;
  followingLocation?: boolean;
  loading?: boolean;
  onPick: (city: string) => void;
  /** «Usar mi ubicación»: follow the device's position instead. */
  onUseLocation?: () => void;
};

const concertsLabel = (count: number) => `${count} ${count === 1 ? 'concierto' : 'conciertos'}`;

/** Bottom sheet to choose the home city: search, «Usar mi ubicación», list. */
export const CityPickerSheet: React.FC<CityPickerSheetProps> = ({
  isOpen,
  onDismiss,
  cities,
  current,
  followingLocation = false,
  loading = false,
  onPick,
  onUseLocation,
}) => {
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (!isOpen) setQuery('');
  }, [isOpen]);
  const shown = useMemo(() => cities.filter(option => matchesCity(option.name, query)), [cities, query]);

  return (
    <Modal isOpen={isOpen} onDidDismiss={onDismiss} initialBreakpoint={0.75} title="Elegir ciudad">
      <div className="flex max-h-[85dvh] flex-col px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 shrink-0 rounded-full bg-white/20" aria-hidden />
        <h3 className="px-1 font-display text-lg font-bold text-app-ink">Tu ciudad</h3>
        <p className="px-1 pb-3 text-[13px] text-white/60">Inicio te enseña la cartelera de esta ciudad.</p>

        <label className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-app-line bg-app-surface px-3 text-white/60">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar ciudad"
            aria-label="Buscar ciudad"
            className="min-w-0 flex-1 bg-transparent text-[15px] text-app-ink placeholder:text-white/40 focus:outline-none"
          />
        </label>

        <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
          {onUseLocation && !query ? (
            <li>
              <button
                type="button"
                aria-current={followingLocation ? 'true' : undefined}
                onClick={() => {
                  onUseLocation();
                  onDismiss();
                }}
                className={`flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-[15px] font-semibold ${
                  followingLocation ? 'bg-white/[0.08] text-app-accent' : 'text-app-ink'
                }`}
              >
                <IconLocate size={18} className="text-app-accent" />
                Usar mi ubicación
              </button>
            </li>
          ) : null}
          {loading && cities.length === 0 ? (
            <li className="flex justify-center py-6">
              <Spinner />
            </li>
          ) : shown.length === 0 ? (
            <li className="px-3 py-5 text-sm text-white/60">
              {query ? `Aún no hay conciertos en «${query.trim()}».` : 'No hay ciudades con conciertos ahora mismo.'}
            </li>
          ) : (
            shown.map(option => {
              const active = !followingLocation && Boolean(current && sameCity(option.name, current));
              return (
                <li key={option.name}>
                  <button
                    type="button"
                    onClick={() => {
                      onPick(option.name);
                      onDismiss();
                    }}
                    aria-current={active ? 'true' : undefined}
                    className={`flex min-h-12 w-full items-center justify-between rounded-xl px-3 text-left text-[15px] font-semibold ${
                      active ? 'bg-white/[0.08] text-app-accent' : 'text-app-ink'
                    }`}
                  >
                    {option.name}
                    <span className="font-mono text-xs text-white/50">{concertsLabel(option.count)}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </Modal>
  );
};

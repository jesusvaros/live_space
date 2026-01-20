import React from 'react';
import { IonContent, IonModal } from '@ionic/react';

type MapFilterModalProps = {
  isOpen: boolean;
  onDismiss: () => void;
  showVenues: boolean;
  onToggleVenues: (value: boolean) => void;
  filterGenres: string;
  onGenresChange: (value: string) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (value: string) => void;
  onPriceMaxChange: (value: string) => void;
  filterGoing: boolean;
  filterAttended: boolean;
  onToggleGoing: (value: boolean) => void;
  onToggleAttended: (value: boolean) => void;
  onClear: () => void;
  disableAttendance: boolean;
};

const MapFilterModal: React.FC<MapFilterModalProps> = ({
  isOpen,
  onDismiss,
  showVenues,
  onToggleVenues,
  filterGenres,
  onGenresChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  filterGoing,
  filterAttended,
  onToggleGoing,
  onToggleAttended,
  onClear,
  disableAttendance,
}) => {
  return (
    <IonModal isOpen={isOpen} onDidDismiss={onDismiss}>
      <IonContent fullscreen>
        <div className="flex flex-col gap-4 rounded-3xl bg-[#141824] p-5 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-display text-lg font-semibold text-slate-50">Filtros</h2>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
              onClick={onDismiss}
            >
              Cerrar
            </button>
          </div>

          <div className="space-y-4">
            <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>Mostrar salas</span>
              <span className="relative inline-flex h-6 w-11 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={showVenues}
                  onChange={e => onToggleVenues(e.target.checked)}
                />
                <span className="h-full w-full rounded-full bg-white/10 transition peer-checked:bg-[#ff6b4a]/80" />
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
              </span>
            </label>

            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                Tipo de musica (coma)
              </span>
              <input
                className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                value={filterGenres}
                onChange={e => onGenresChange(e.target.value)}
                placeholder="Jazz, Rock"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Precio minimo
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  value={priceMin}
                  onChange={e => onPriceMinChange(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Precio maximo
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  value={priceMax}
                  onChange={e => onPriceMaxChange(e.target.value)}
                  placeholder="50"
                />
              </label>
            </div>

            <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>Eventos a los que voy</span>
              <span className="relative inline-flex h-6 w-11 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={filterGoing}
                  onChange={e => onToggleGoing(e.target.checked)}
                  disabled={disableAttendance}
                />
                <span className="h-full w-full rounded-full bg-white/10 transition peer-checked:bg-[#ff6b4a]/80 peer-disabled:opacity-40" />
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5 peer-disabled:opacity-40" />
              </span>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
              <span>Eventos a los que he ido</span>
              <span className="relative inline-flex h-6 w-11 items-center">
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={filterAttended}
                  onChange={e => onToggleAttended(e.target.checked)}
                  disabled={disableAttendance}
                />
                <span className="h-full w-full rounded-full bg-white/10 transition peer-checked:bg-[#ff6b4a]/80 peer-disabled:opacity-40" />
                <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5 peer-disabled:opacity-40" />
              </span>
            </label>
          </div>

          <button
            type="button"
            className="inline-flex w-full items-center justify-center rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-[#ffd1c4]"
            onClick={onClear}
          >
            Limpiar filtros
          </button>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default MapFilterModal;

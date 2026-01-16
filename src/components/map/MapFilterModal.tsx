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
        <div className="app-modal">
          <div className="app-modal-header">
            <h2 className="app-modal-title">Filtros</h2>
            <button
              type="button"
              className="app-button app-button--ghost app-button--small"
              onClick={onDismiss}
            >
              Cerrar
            </button>
          </div>

          <div className="space-y-4">
            <label className="app-toggle">
              <input
                type="checkbox"
                checked={showVenues}
                onChange={e => onToggleVenues(e.target.checked)}
              />
              <span>Mostrar salas</span>
            </label>

            <label className="app-field">
              <span className="app-label">Tipo de musica (coma)</span>
              <input
                className="app-input"
                value={filterGenres}
                onChange={e => onGenresChange(e.target.value)}
                placeholder="Jazz, Rock"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="app-field">
                <span className="app-label">Precio minimo</span>
                <input
                  className="app-input"
                  value={priceMin}
                  onChange={e => onPriceMinChange(e.target.value)}
                  placeholder="0"
                />
              </label>
              <label className="app-field">
                <span className="app-label">Precio maximo</span>
                <input
                  className="app-input"
                  value={priceMax}
                  onChange={e => onPriceMaxChange(e.target.value)}
                  placeholder="50"
                />
              </label>
            </div>

            <label className="app-toggle">
              <input
                type="checkbox"
                checked={filterGoing}
                onChange={e => onToggleGoing(e.target.checked)}
                disabled={disableAttendance}
              />
              <span>Eventos a los que voy</span>
            </label>
            <label className="app-toggle">
              <input
                type="checkbox"
                checked={filterAttended}
                onChange={e => onToggleAttended(e.target.checked)}
                disabled={disableAttendance}
              />
              <span>Eventos a los que he ido</span>
            </label>
          </div>

          <button
            type="button"
            className="app-button app-button--ghost app-button--block"
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

import React from 'react';
import { IonContent, IonModal } from '@ionic/react';
import { supabase } from '../../lib/supabase';

type MapFilterModalProps = {
  isOpen: boolean;
  onDismiss: () => void;
  filterGenres: string;
  onGenresChange: (value: string) => void;
  priceMin: string;
  priceMax: string;
  onPriceMinChange: (value: string) => void;
  onPriceMaxChange: (value: string) => void;
  filterDayPart: 'day' | 'night' | '';
  onDayPartChange: (value: 'day' | 'night' | '') => void;
  filterBandOnly: boolean;
  onToggleBand: (value: boolean) => void;
  selectedArtists: { id: string; name: string; avatar_url: string | null }[];
  onAddArtist: (artist: { id: string; name: string; avatar_url: string | null }) => void;
  onRemoveArtist: (id: string) => void;
  autoFocusArtist?: boolean;
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
  filterGenres,
  onGenresChange,
  priceMin,
  priceMax,
  onPriceMinChange,
  onPriceMaxChange,
  filterDayPart,
  onDayPartChange,
  filterBandOnly,
  onToggleBand,
  selectedArtists,
  onAddArtist,
  onRemoveArtist,
  autoFocusArtist = false,
  filterGoing,
  filterAttended,
  onToggleGoing,
  onToggleAttended,
  onClear,
  disableAttendance,
}) => {
  const [artistQuery, setArtistQuery] = React.useState('');
  const [artistResults, setArtistResults] = React.useState<
    { id: string; name: string; avatar_url: string | null }[]
  >([]);
  const [searching, setSearching] = React.useState(false);
  const artistInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen && autoFocusArtist && artistInputRef.current) {
      artistInputRef.current.focus();
    }
  }, [isOpen, autoFocusArtist]);

  const handleArtistSearch = async () => {
    const term = artistQuery.trim();
    if (!term) {
      setArtistResults([]);
      return;
    }
    try {
      setSearching(true);
      const { data } = await supabase
        .from('artists')
        .select('id, name, avatar_url, artist_type')
        .ilike('name', `%${term}%`)
        .order('name', { ascending: true })
        .limit(6);
      setArtistResults(
        (data || []).map((item: any) => ({
          id: item.id,
          name: item.name,
          avatar_url: item.avatar_url ?? null,
        }))
      );
    } finally {
      setSearching(false);
    }
  };

  React.useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistResults([]);
      return;
    }
    const timer = window.setTimeout(() => handleArtistSearch(), 350);
    return () => window.clearTimeout(timer);
  }, [artistQuery]);

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

          <div className="space-y-6">
            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Cuándo</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    filterDayPart === 'day'
                      ? 'border-[#ff6b4a] bg-[#ff6b4a]/80 text-white'
                      : 'border-white/10 bg-[#0b0f1a] text-slate-100'
                  }`}
                  onClick={() => onDayPartChange(filterDayPart === 'day' ? '' : 'day')}
                >
                  ☀️ Día
                </button>
                <button
                  type="button"
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    filterDayPart === 'night'
                      ? 'border-[#ff6b4a] bg-[#ff6b4a]/80 text-white'
                      : 'border-white/10 bg-[#0b0f1a] text-slate-100'
                  }`}
                  onClick={() => onDayPartChange(filterDayPart === 'night' ? '' : 'night')}
                >
                  🌙 Noche
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={filterGoing}
                    onChange={e => onToggleGoing(e.target.checked)}
                    disabled={disableAttendance}
                    className="accent-[#ff6b4a]"
                  />
                  <span>Voy</span>
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-200">
                  <input
                    type="checkbox"
                    checked={filterAttended}
                    onChange={e => onToggleAttended(e.target.checked)}
                    disabled={disableAttendance}
                    className="accent-[#ff6b4a]"
                  />
                  <span>He ido</span>
                </label>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-white/5 bg-white/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Estilo y lineup</p>
              <label className="flex flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                  Tipo de música (coma)
                </span>
                <input
                  className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  value={filterGenres}
                  onChange={e => onGenresChange(e.target.value)}
                  placeholder="Jazz, Rock"
                />
              </label>
              <label className="flex items-center justify-between gap-3 text-sm text-slate-200">
                <span className="flex items-center gap-2">🎸 Solo bandas</span>
                <span className="relative inline-flex h-6 w-11 items-center">
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={filterBandOnly}
                    onChange={e => onToggleBand(e.target.checked)}
                  />
                  <span className="h-full w-full rounded-full bg-white/10 transition peer-checked:bg-[#ff6b4a]/80" />
                  <span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
                </span>
              </label>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    className="flex-1 rounded-2xl border border-white/10 bg-[#141824] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
                    value={artistQuery}
                    onChange={e => setArtistQuery(e.target.value)}
                    ref={artistInputRef}
                    placeholder="Buscar artista"
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleArtistSearch();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-slate-100"
                    onClick={handleArtistSearch}
                    disabled={searching}
                  >
                    {searching ? 'Buscando…' : 'Buscar'}
                  </button>
                </div>
                {artistResults.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-2 text-sm text-slate-100">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Resultados</p>
                    <div className="mt-2 space-y-2">
                      {artistResults.map(artist => (
                        <button
                          key={artist.id}
                          type="button"
                          className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2 text-left hover:bg-white/10"
                          onClick={() => {
                            onAddArtist(artist);
                            setArtistQuery('');
                            setArtistResults([]);
                          }}
                        >
                          <div className="h-8 w-8 overflow-hidden rounded-full bg-white/10">
                            {artist.avatar_url ? (
                              <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">🎤</div>
                            )}
                          </div>
                          <span>{artist.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {selectedArtists.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-[#0b0f1a] p-2 text-sm text-slate-100">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Artistas activos</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selectedArtists.map(artist => (
                        <span
                          key={artist.id}
                          className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs"
                        >
                          {artist.name}
                          <button
                            type="button"
                            className="text-slate-300 hover:text-white"
                            onClick={() => onRemoveArtist(artist.id)}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border border-white/5 bg-white/5 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Precio</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Mínimo
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
                    Máximo
                  </span>
                  <input
                    className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                    value={priceMax}
                    onChange={e => onPriceMaxChange(e.target.value)}
                    placeholder="50"
                  />
                </label>
              </div>
            </div>

            <button
              type="button"
              className="inline-flex w-full items-center justify-center rounded-2xl border border-transparent px-4 py-3 text-sm font-semibold text-[#ffd1c4]"
              onClick={onClear}
            >
              Limpiar filtros
            </button>
          </div>
        </div>
      </IonContent>
    </IonModal>
  );
};

export default MapFilterModal;

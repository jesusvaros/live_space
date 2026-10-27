import React from 'react';
import { Modal } from '../ui/AppPrimitives';
import { supabase } from '../../lib/supabase';
import { MAP_WHEN_LABELS, type MapArtistFilter, type MapWhen } from '../../hooks/useMapFilters';
import { chipClass } from './MapFilterBar';

type MapFilterModalProps = {
  isOpen: boolean;
  onDismiss: () => void;
  autoFocusArtist?: boolean;
  when: MapWhen;
  onWhenChange: (value: MapWhen) => void;
  city: string | null;
  cities: string[];
  onCityChange: (value: string | null) => void;
  artists: MapArtistFilter[];
  onAddArtist: (artist: MapArtistFilter) => void;
  onRemoveArtist: (id: string) => void;
  includePast: boolean;
  onIncludePastChange: (value: boolean) => void;
  resultCount: number;
  onClear: () => void;
};

const sectionLabel = 'font-mono text-[11px] font-semibold uppercase tracking-[0.2em] text-app-ink/50';

const MapFilterModal: React.FC<MapFilterModalProps> = ({
  isOpen,
  onDismiss,
  autoFocusArtist = false,
  when,
  onWhenChange,
  city,
  cities,
  onCityChange,
  artists,
  onAddArtist,
  onRemoveArtist,
  includePast,
  onIncludePastChange,
  resultCount,
  onClear,
}) => {
  const [artistQuery, setArtistQuery] = React.useState('');
  const [artistResults, setArtistResults] = React.useState<MapArtistFilter[]>([]);
  const [searching, setSearching] = React.useState(false);
  const artistInputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (isOpen && autoFocusArtist) artistInputRef.current?.focus();
  }, [isOpen, autoFocusArtist]);

  React.useEffect(() => {
    const term = artistQuery.trim();
    if (!term) {
      setArtistResults([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabase
          .from('v_subject_artists')
          .select('artist_id, name, avatar_url')
          .ilike('name', `%${term}%`)
          .order('name', { ascending: true })
          .limit(6);
        if (cancelled) return;
        setArtistResults(
          (data || []).map((item: any) => ({
            id: String(item.artist_id),
            name: String(item.name ?? ''),
            avatar_url: item.avatar_url ?? null,
          }))
        );
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [artistQuery]);

  const whenOptions: { value: MapWhen; label: string }[] = [
    { value: 'all', label: 'Cualquier fecha' },
    ...(Object.keys(MAP_WHEN_LABELS) as Exclude<MapWhen, 'all'>[]).map(value => ({
      value,
      label: MAP_WHEN_LABELS[value],
    })),
  ];

  return (
    <Modal isOpen={isOpen} onDidDismiss={onDismiss} title="Filtros del mapa" className="sheet">
      <div className="flex max-h-[90dvh] flex-col bg-app-bg text-app-ink">
        <div className="flex items-center justify-between px-5 pt-3">
          <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden="true" />
        </div>
        <div className="flex items-center justify-between gap-4 px-5 pt-2">
          <h2 className="font-display text-xl font-bold">Filtros</h2>
          <button
            type="button"
            className="inline-flex h-11 items-center rounded-full px-3 text-sm font-semibold text-app-ink/70 hover:text-app-ink"
            onClick={onDismiss}
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 pb-4 pt-4">
          <section className="space-y-3">
            <p className={sectionLabel}>Cuándo</p>
            <div className="flex flex-wrap gap-2">
              {whenOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={when === option.value}
                  className={chipClass(when === option.value)}
                  onClick={() => onWhenChange(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {cities.length > 0 ? (
            <section className="space-y-3">
              <p className={sectionLabel}>Ciudad</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" aria-pressed={!city} className={chipClass(!city)} onClick={() => onCityChange(null)}>
                  Todas
                </button>
                {cities.map(name => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={city === name}
                    className={chipClass(city === name)}
                    onClick={() => onCityChange(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="space-y-3">
            <p className={sectionLabel}>Artista</p>
            <input
              ref={artistInputRef}
              type="text"
              inputMode="search"
              aria-label="Buscar artista"
              placeholder="Busca un artista"
              value={artistQuery}
              onChange={event => setArtistQuery(event.target.value)}
              className="h-12 w-full appearance-none rounded-full border border-[var(--app-line,#2a2d36)] bg-app-surface px-4 text-[15px] text-app-ink outline-none placeholder:text-app-ink/45 focus:border-app-accent/70"
            />
            {artists.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {artists.map(artist => (
                  <span key={artist.id} className={`${chipClass(true)} pr-1`}>
                    {artist.name}
                    <button
                      type="button"
                      aria-label={`Quitar ${artist.name}`}
                      onClick={() => onRemoveArtist(artist.id)}
                      className="inline-flex h-9 items-center rounded-full bg-black/20 px-3 text-[12px] font-semibold"
                    >
                      Quitar
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            {searching ? <p className="text-sm text-app-ink/50">Buscando…</p> : null}
            {artistResults.length > 0 ? (
              <ul className="divide-y divide-[var(--app-line,#2a2d36)] overflow-hidden rounded-2xl border border-[var(--app-line,#2a2d36)] bg-app-surface">
                {artistResults.map(artist => {
                  const selected = artists.some(item => item.id === artist.id);
                  return (
                    <li key={artist.id}>
                      <button
                        type="button"
                        disabled={selected}
                        onClick={() => {
                          onAddArtist(artist);
                          setArtistQuery('');
                        }}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-[15px] text-app-ink disabled:opacity-50"
                      >
                        {artist.avatar_url ? (
                          <img src={artist.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-mono text-xs">
                            {artist.name.slice(0, 1).toUpperCase()}
                          </span>
                        )}
                        <span className="min-w-0 flex-1 truncate font-semibold">{artist.name}</span>
                        <span className="text-xs text-app-ink/50">{selected ? 'Añadido' : 'Añadir'}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </section>

          <section>
            <label className="flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-2xl border border-[var(--app-line,#2a2d36)] bg-app-surface px-4 py-3">
              <span>
                <span className="block text-[15px] font-semibold">Incluir conciertos pasados</span>
                <span className="block text-xs text-app-ink/50">Por defecto solo ves lo que viene</span>
              </span>
              <input
                type="checkbox"
                className="peer sr-only"
                checked={includePast}
                onChange={event => onIncludePastChange(event.target.checked)}
              />
              <span
                aria-hidden="true"
                className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition-colors after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform after:content-[''] peer-checked:bg-app-accent peer-checked:after:translate-x-5 peer-focus-visible:ring-2 peer-focus-visible:ring-app-accent"
              />
            </label>
          </section>
        </div>

        <div className="flex gap-3 border-t border-[var(--app-line,#2a2d36)] px-5 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-3">
          <button
            type="button"
            onClick={onClear}
            className="inline-flex h-12 items-center justify-center rounded-full border border-[var(--app-line,#2a2d36)] px-5 text-sm font-semibold text-app-ink/80"
          >
            Quitar filtros
          </button>
          <button
            type="button"
            onClick={onDismiss}
            className="inline-flex h-12 flex-1 items-center justify-center rounded-full bg-app-accent px-5 text-sm font-bold text-white"
          >
            Ver {resultCount} {resultCount === 1 ? 'concierto' : 'conciertos'}
          </button>
        </div>
      </div>
    </Modal>
  );
};

export default MapFilterModal;

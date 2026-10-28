import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Avatar from '../components/ui/Avatar';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconLocate } from '../components/icons';
import { useAuth } from '../contexts/AuthContext';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { supabase } from '../lib/supabase';
import { useLastKnownLocation } from '../shared/hooks/useLastKnownLocation';
import { useQuery } from '../shared/hooks/useQuery';
import { useEventsList } from '../features/events/hooks/useEventsList';
import { deriveCities } from '../features/events/sections/CityListingSection';
import { formatDistance } from '../features/events/utils';
import {
  deriveGenres,
  eventCity,
  eventGenres,
  genreKey,
  markSetupDone,
  nearestEventCity,
  persistCity,
  persistTastes,
  readStoredCity,
  readTastes,
  sameCity,
} from '../features/agenda/agendaPrefs';

const STEPS = 3;
const MAX_GENRES = 24;
const MAX_ARTISTS = 10;
const MAX_VENUES = 6;

type Suggestion = {
  kind: 'artist' | 'venue';
  id: string;
  subjectId: string;
  name: string;
  imageUrl: string | null;
  detail: string;
};

const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

// Same window as the home, so the listings come from its cache.
const listingsRange = () => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 30);
  end.setHours(23, 59, 59, 999);
  return {
    startIso: new Date(start.getTime() - 1000 * 60 * 60 * 24 * 4).toISOString(),
    endIso: end.toISOString(),
  };
};

const concertsLabel = (count: number) => `${count} ${count === 1 ? 'concierto' : 'conciertos'}`;

// First-run setup of the personal agenda: city, tastes and who to follow.
// Every step can be skipped; it opens again from the profile.
const AgendaSetup: React.FC = () => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const returnTo = (routeLocation.state as { returnTo?: string } | null)?.returnTo || '/tabs/events';
  const { user, profile, updateProfile } = useAuth();

  const range = useMemo(() => listingsRange(), []);
  const { events, loading: eventsLoading, error: eventsError } = useEventsList(range);
  const cities = useMemo(() => deriveCities(events), [events]);
  const findCity = (name?: string | null) =>
    name ? cities.find(option => sameCity(option.name, name))?.name ?? null : null;

  const [step, setStep] = useState(1);
  const [city, setCity] = useState<string | null>(null);
  const [tastes, setTastes] = useState<string[]>(() => readTastes());
  const [saving, setSaving] = useState(false);

  // Preselect the city the user already has, once the listings arrive.
  const preselected = useRef(false);
  useEffect(() => {
    if (preselected.current || cities.length === 0) return;
    preselected.current = true;
    setCity(current => current || findCity(readStoredCity()) || findCity(profile?.primary_city));
  }, [cities]);

  const { location, loading: locating, error: locationError, requestLocation } = useLastKnownLocation();
  const [nearest, setNearest] = useState<{ city: string; distanceKm: number } | null>(null);
  const awaitingLocation = useRef(false);
  useEffect(() => {
    if (!awaitingLocation.current || locating || !location || events.length === 0) return;
    awaitingLocation.current = false;
    const found = nearestEventCity(events, location);
    setNearest(found);
    if (found) setCity(findCity(found.city) || found.city);
  }, [events, location, locating]);
  const locate = () => {
    awaitingLocation.current = true;
    requestLocation();
  };

  const genres = useMemo(() => deriveGenres(events, city).slice(0, MAX_GENRES), [city, events]);
  const toggleTaste = (key: string) =>
    setTastes(current => (current.includes(key) ? current.filter(item => item !== key) : [...current, key]));

  const { isFollowing, isToggling, toggleFollowSubject, canFollow } = useFollowedSubjects();

  // Who plays most in the city, the user's genres first, and its busiest venues.
  const { data: suggestions, loading: suggestionsLoading } = useQuery<Suggestion[]>(
    ['agenda:suggestions', city ?? '', [...tastes].sort().join(',')],
    async () => {
      const inCity = events.filter(event => city && sameCity(eventCity(event), city));
      const tasteKeys = new Set(tastes);
      const artistScores = new Map<string, { score: number; concerts: number; genres: string[] }>();
      const venueCounts = new Map<string, number>();
      for (const event of inCity) {
        const matches = eventGenres(event).filter(genre => tasteKeys.has(genreKey(genre))).length;
        for (const entry of event.event_artists || []) {
          const artist = entry.artist;
          if (!artist?.id) continue;
          const current = artistScores.get(artist.id) || { score: 0, concerts: 0, genres: artist.genres || [] };
          current.concerts += 1;
          current.score += 1 + (matches > 0 ? 5 : 0);
          artistScores.set(artist.id, current);
        }
        if (event.venue_place?.id) venueCounts.set(event.venue_place.id, (venueCounts.get(event.venue_place.id) || 0) + 1);
      }
      const artistIds = Array.from(artistScores.entries())
        .sort((left, right) => right[1].score - left[1].score)
        .slice(0, MAX_ARTISTS)
        .map(([id]) => id);
      const venueIds = Array.from(venueCounts.entries())
        .sort((left, right) => right[1] - left[1])
        .slice(0, MAX_VENUES)
        .map(([id]) => id);
      const [artists, venues] = await Promise.all([
        artistIds.length
          ? supabase.from('v_subject_artists').select('subject_id,artist_id,name,avatar_url').in('artist_id', artistIds)
          : Promise.resolve({ data: [], error: null }),
        venueIds.length
          ? supabase.from('v_subject_venues').select('subject_id,id,name,photos,cover_image_url').in('id', venueIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (artists.error) throw artists.error;
      if (venues.error) throw venues.error;
      const artistRows = new Map((artists.data || []).map((row: any) => [String(row.artist_id), row]));
      const venueRows = new Map((venues.data || []).map((row: any) => [String(row.id), row]));
      return [
        ...artistIds.flatMap(id => {
          const row = artistRows.get(id);
          const stats = artistScores.get(id);
          if (!row?.subject_id || !stats) return [];
          return [{
            kind: 'artist' as const,
            id,
            subjectId: String(row.subject_id),
            name: String(row.name ?? ''),
            imageUrl: row.avatar_url ?? null,
            detail: [concertsLabel(stats.concerts), stats.genres.slice(0, 2).join(', ')].filter(Boolean).join(' · '),
          }];
        }),
        ...venueIds.flatMap(id => {
          const row = venueRows.get(id);
          if (!row?.subject_id) return [];
          return [{
            kind: 'venue' as const,
            id,
            subjectId: String(row.subject_id),
            name: String(row.name ?? ''),
            imageUrl: row.cover_image_url ?? (row.photos || [])[0] ?? null,
            detail: `${concertsLabel(venueCounts.get(id) || 0)} este mes`,
          }];
        }),
      ];
    },
    { enabled: step === 3 && Boolean(city) && events.length > 0, ttlMs: 60_000 },
  );

  const saveCity = async () => {
    if (!city) return;
    persistCity(city);
    if (!profile?.primary_city || !sameCity(profile.primary_city, city)) {
      // The local choice already drives the home; the profile copy is best effort.
      await updateProfile({ primary_city: city }).catch(() => undefined);
    }
  };

  const finish = () => {
    if (user) markSetupDone(user.id);
    navigate(returnTo, { replace: true });
  };

  const next = async () => {
    if (step === 1) {
      setSaving(true);
      await saveCity();
      setSaving(false);
    }
    if (step === 2) persistTastes(tastes);
    if (step < STEPS) setStep(step + 1);
    else finish();
  };

  const titles = ['¿Dónde vas a conciertos?', '¿Qué música te gusta?', 'Sigue a quien te interesa'];
  const intros = [
    'Tu inicio abrirá con la cartelera de esta ciudad.',
    'Lo usamos para ordenar «Para ti». Elige tantos como quieras.',
    `Te avisamos cuando anuncien fechas${city ? ` y los verás primero en ${city}` : ''}.`,
  ];

  const renderCityStep = () => (
    <div className="flex flex-col gap-4">
      <Button variant="secondary" size="lg" block onClick={locate} disabled={locating || eventsLoading} icon={<IconLocate size={18} />}>
        {locating ? 'Buscando…' : 'Usar mi ubicación'}
      </Button>
      {nearest ? (
        <p className="text-[13px] text-white/70">
          La ciudad con conciertos más cercana es <span className="font-semibold text-app-ink">{nearest.city}</span>
          {nearest.distanceKm > 5 ? ` (a ${formatDistance(nearest.distanceKm)})` : ''}.
        </p>
      ) : locationError ? (
        <p className="text-[13px] text-white/60">{locationError} También puedes elegirla abajo.</p>
      ) : null}

      <h2 className="pt-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">O elígela</h2>
      {eventsLoading && cities.length === 0 ? (
        <div className="flex justify-center py-8"><Spinner /></div>
      ) : eventsError ? (
        <p className="text-sm text-rose-300">{eventsError}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {cities.map(option => {
            const active = Boolean(city && sameCity(option.name, city));
            return (
              <li key={option.name}>
                <button
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCity(option.name)}
                  className={`flex min-h-12 w-full items-center justify-between rounded-xl border px-3.5 text-left text-[15px] font-semibold ${
                    active ? 'border-app-accent bg-app-accent/10 text-app-accent' : 'border-app-line bg-app-surface text-app-ink'
                  }`}
                >
                  {option.name}
                  <span className="font-mono text-xs text-white/50">{concertsLabel(option.count)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const renderTastesStep = () =>
    genres.length === 0 ? (
      <p className="rounded-2xl border border-dashed border-app-line p-5 text-sm text-white/70">
        Aún no tenemos géneros para {city || 'tu ciudad'}. Puedes seguir y volver a esto desde tu perfil.
      </p>
    ) : (
      <div className="flex flex-wrap gap-2">
        {genres.map(genre => {
          const active = tastes.includes(genre.key);
          return (
            <button
              key={genre.key}
              type="button"
              aria-pressed={active}
              onClick={() => toggleTaste(genre.key)}
              className={`min-h-11 rounded-full px-4 text-sm font-semibold ${
                active ? 'bg-app-accent text-[#14151a]' : 'border border-app-line bg-app-surface text-app-ink'
              }`}
            >
              {genre.label}
            </button>
          );
        })}
      </div>
    );

  const renderSuggestion = (item: Suggestion) => {
    const following = isFollowing(item.subjectId);
    return (
      <li key={item.subjectId} className="flex items-center gap-3 py-2">
        <button
          type="button"
          onClick={() => navigate(`/tabs/${item.kind}/${item.id}`)}
          className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Avatar name={item.name} src={item.imageUrl} kind={item.kind} badge className="h-11 w-11 text-[15px]" />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[15px] font-bold text-app-ink">{item.name}</span>
            <span className="block truncate text-xs text-[#8f8b84]">{item.detail}</span>
          </span>
        </button>
        <button
          type="button"
          aria-pressed={following}
          disabled={!canFollow || isToggling(item.subjectId)}
          onClick={() => void toggleFollowSubject(item.subjectId)}
          className={`min-h-11 shrink-0 rounded-full px-4 text-[13px] font-semibold disabled:opacity-50 ${
            following ? 'border border-app-line text-app-ink' : 'bg-app-accent text-[#14151a]'
          }`}
        >
          {following ? 'Siguiendo' : 'Seguir'}
        </button>
      </li>
    );
  };

  const renderFollowStep = () => {
    const list = suggestions || [];
    if (suggestionsLoading && list.length === 0) return <div className="flex justify-center py-8"><Spinner /></div>;
    if (!city || list.length === 0) {
      return (
        <p className="rounded-2xl border border-dashed border-app-line p-5 text-sm text-white/70">
          No hay sugerencias {city ? `en ${city}` : 'sin ciudad'} ahora mismo. Busca artistas y salas en Explorar.
        </p>
      );
    }
    const artists = list.filter(item => item.kind === 'artist');
    const venues = list.filter(item => item.kind === 'venue');
    return (
      <div className="flex flex-col gap-5">
        {artists.length > 0 ? (
          <section aria-labelledby="sugerencias-artistas">
            <h2 id="sugerencias-artistas" className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
              Artistas en {city}
            </h2>
            <ul className="divide-y divide-app-line">{artists.map(renderSuggestion)}</ul>
          </section>
        ) : null}
        {venues.length > 0 ? (
          <section aria-labelledby="sugerencias-salas">
            <h2 id="sugerencias-salas" className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">
              Salas de {city}
            </h2>
            <ul className="divide-y divide-app-line">{venues.map(renderSuggestion)}</ul>
          </section>
        ) : null}
      </div>
    );
  };

  return (
    <div className="flex h-dvh flex-col bg-app-bg text-app-ink">
      <header className="flex items-center gap-2 px-3 pb-1 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={finish}
          aria-label="Cerrar"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
        >
          <CloseIcon />
        </button>
        <span className="flex-1 text-center font-mono text-xs font-semibold text-white/50">PASO {step} DE {STEPS}</span>
        <button
          type="button"
          onClick={() => (step < STEPS ? setStep(step + 1) : finish())}
          className="min-h-11 px-3 text-sm font-semibold text-white/70"
        >
          Saltar
        </button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-app-accent">Tu agenda</p>
        <h1 className="mt-1 font-display text-[26px] font-bold leading-tight">{titles[step - 1]}</h1>
        <p className="mb-5 mt-1.5 text-sm text-white/65">{intros[step - 1]}</p>
        {step === 1 ? renderCityStep() : step === 2 ? renderTastesStep() : renderFollowStep()}
      </main>

      <footer className="flex gap-2 border-t border-app-line bg-app-bg/95 px-4 pb-[calc(16px+env(safe-area-inset-bottom,0px))] pt-2.5">
        {step > 1 ? (
          <Button variant="secondary" size="lg" onClick={() => setStep(step - 1)}>
            Atrás
          </Button>
        ) : null}
        <Button size="lg" block className="flex-1" onClick={() => void next()} disabled={saving || (step === 1 && !city)}>
          {saving ? <Spinner className="h-4 w-4" /> : null}
          {step < STEPS ? 'Continuar' : 'Listo'}
        </Button>
      </footer>
    </div>
  );
};

export default AgendaSetup;

import { useEffect, useMemo, useState } from 'react';
import { createConfiguredCloudinaryMediaProvider } from '../media';
import {
  ArtistPick,
  concertsService,
  CreateConcertResult,
  VenueOption,
} from '../services/concerts.service';

export type ConcertWorkspace = {
  type: 'artist' | 'venue';
  subjectId: string;
  artist?: { id: string; name: string } | null;
  venue?: VenueOption | null;
};

type UseCreateEventFormOptions = {
  userId?: string | null;
  workspace: ConcertWorkspace | null;
};

const SEARCH_DELAY_MS = 300;
const DEFAULT_TIME = '21:00';

const todayValue = () => {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const isHttpUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
};

const sameName = (left: string, right: string) =>
  left.trim().toLocaleLowerCase('es') === right.trim().toLocaleLowerCase('es');

// Debounced search that ignores stale answers.
const useSearch = <T,>(query: string, search: (value: string) => Promise<T[]>) => {
  const [results, setResults] = useState<T[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const handle = window.setTimeout(() => {
      search(term)
        .then(rows => {
          if (!cancelled) setResults(rows);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, search]);

  return { results, searching };
};

// One-screen form to add a concert: venue, day and time, line-up and,
// optionally, name, ticket link and poster. Whether it is published or
// proposed to the venue is decided by create_concert() in the database.
export const useCreateEventForm = ({ userId, workspace }: UseCreateEventFormOptions) => {
  const fixedVenue = workspace?.type === 'venue' ? workspace.venue ?? null : null;
  const ownArtist = workspace?.type === 'artist' ? workspace.artist ?? null : null;

  const [venue, setVenue] = useState<VenueOption | null>(fixedVenue);
  const [venueQuery, setVenueQuery] = useState('');
  const [date, setDate] = useState(todayValue());
  const [time, setTime] = useState(DEFAULT_TIME);
  const [lineup, setLineup] = useState<ArtistPick[]>(ownArtist ? [{ id: ownArtist.id, name: ownArtist.name }] : []);
  const [artistQuery, setArtistQuery] = useState('');
  const [name, setName] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [posterPreview, setPosterPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CreateConcertResult | null>(null);

  // The workspace arrives after the first render on a cold start.
  useEffect(() => {
    if (fixedVenue) setVenue(fixedVenue);
  }, [fixedVenue?.id]);
  useEffect(() => {
    if (ownArtist) {
      setLineup(prev => (prev.some(pick => pick.id === ownArtist.id) ? prev : [{ id: ownArtist.id, name: ownArtist.name }, ...prev]));
    }
  }, [ownArtist?.id]);

  const venueSearch = useSearch(venueQuery, concertsService.searchVenues);
  const artistSearch = useSearch(artistQuery, concertsService.searchArtists);

  useEffect(() => {
    if (!posterFile) {
      setPosterPreview(null);
      return;
    }
    const previewUrl = URL.createObjectURL(posterFile);
    setPosterPreview(previewUrl);
    return () => URL.revokeObjectURL(previewUrl);
  }, [posterFile]);

  const defaultName = useMemo(() => lineup.map(pick => pick.name.trim()).filter(Boolean).join(' + ').slice(0, 160), [lineup]);

  const artistSuggestions = useMemo(
    () => artistSearch.results.filter(option => !lineup.some(pick => pick.id === option.id)),
    [artistSearch.results, lineup],
  );
  const term = artistQuery.trim();
  const canAddNewArtist =
    term.length >= 2 &&
    !artistSearch.searching &&
    !artistSearch.results.some(option => sameName(option.name, term)) &&
    !lineup.some(pick => sameName(pick.name, term));

  const addArtist = (pick: ArtistPick) => {
    setLineup(prev => (prev.some(item => (pick.id ? item.id === pick.id : sameName(item.name, pick.name))) ? prev : [...prev, pick]));
    setArtistQuery('');
    setError('');
  };

  const removeArtist = (index: number) => {
    setLineup(prev => prev.filter((pick, idx) => idx !== index || (ownArtist && pick.id === ownArtist.id)));
  };

  const chooseVenue = (option: VenueOption | null) => {
    setVenue(option);
    setVenueQuery('');
    setError('');
  };

  const submit = async (): Promise<CreateConcertResult | null> => {
    if (!userId || !workspace) {
      setError('Elige qué perfil gestionas para añadir conciertos.');
      return null;
    }
    if (!venue) {
      setError('Elige la sala.');
      return null;
    }
    const startsAt = date && time ? new Date(`${date}T${time}`) : null;
    if (!startsAt || Number.isNaN(startsAt.getTime())) {
      setError('Indica el día y la hora.');
      return null;
    }
    if (lineup.length === 0) {
      setError('Añade al menos un artista.');
      return null;
    }
    const finalName = name.trim() || defaultName;
    if (finalName.length < 2) {
      setError('Ponle nombre al concierto.');
      return null;
    }
    const ticket = ticketUrl.trim();
    if (ticket && !isHttpUrl(ticket)) {
      setError('El enlace de entradas tiene que empezar por https://');
      return null;
    }

    setSaving(true);
    setError('');
    try {
      let imageUrl: string | null = null;
      if (posterFile) {
        const provider = createConfiguredCloudinaryMediaProvider();
        const upload = await provider.upload({ file: posterFile, kind: 'image', subjectId: workspace.subjectId, purpose: 'catalog' });
        imageUrl = upload.secureUrl;
      }
      const created = await concertsService.createConcert(
        {
          venueId: venue.id,
          startsAt,
          name: finalName,
          lineup,
          ticketUrl: ticket || null,
          imageUrl,
          asArtistId: ownArtist?.id ?? null,
        },
        userId,
      );
      setResult(created);
      return created;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Ha ocurrido un error inesperado.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  return {
    venue,
    venueLocked: Boolean(fixedVenue),
    venueQuery,
    venueResults: venueSearch.results,
    venueSearching: venueSearch.searching,
    date,
    time,
    lineup,
    ownArtistId: ownArtist?.id ?? null,
    artistQuery,
    artistSuggestions,
    artistSearching: artistSearch.searching,
    canAddNewArtist,
    name,
    defaultName,
    ticketUrl,
    posterFile,
    posterPreview,
    saving,
    error,
    result,
    setVenueQuery,
    chooseVenue,
    setDate,
    setTime,
    setArtistQuery,
    addArtist,
    removeArtist,
    setName,
    setTicketUrl,
    setPosterFile,
    submit,
  };
};

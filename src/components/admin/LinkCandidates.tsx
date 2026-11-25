import React, { useEffect, useState } from 'react';
import { IconMap, IconMic, IconUser } from '../icons';
import { artistService } from '../../services/artist.service';
import { venueService } from '../../services/venue.service';
import { useAuth } from '../../contexts/AuthContext';
import {
  artistLinksFrom,
  listLinkCandidates,
  resolveLinkCandidate,
  type CandidateKind,
  type LinkCandidateRow,
} from '../../features/suggestions/linkCandidates';

// Admin → «Salas y artistas sugeridos»: links people sent with «¿Falta un
// concierto?» that are a venue's or an artist's page, or a social profile.
// One tap creates the venue or artist (name and city editable first) and
// tells whoever sent it; «Descartar» drops the link.

const KIND_LABEL: Record<CandidateKind, string> = { venue: 'Sala', artist: 'Artista', profile: 'Perfil (sala o artista)' };
const KIND_ICON: Record<CandidateKind, React.FC<{ size?: number }>> = { venue: IconMap, artist: IconMic, profile: IconUser };

const inputClass = 'w-full rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-sm text-white outline-none focus:border-app-accent/60';

const CandidateItem: React.FC<{ row: LinkCandidateRow; onDone: (url: string, message: string) => void }> = ({ row, onDone }) => {
  const { profile } = useAuth();
  const [name, setName] = useState(row.candidate.name ?? '');
  const [city, setCity] = useState(row.candidate.city ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const Icon = KIND_ICON[row.kind];

  const run = async (task: () => Promise<string>) => {
    setBusy(true);
    setError('');
    try {
      onDone(row.url, await task());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se ha podido completar.');
      setBusy(false);
    }
  };

  const createVenue = () =>
    run(async () => {
      if (!name.trim() || !city.trim()) throw new Error('La sala necesita nombre y ciudad.');
      const venue = await venueService.createVenue({
        name: name.trim(),
        city: city.trim(),
        address: row.candidate.address ?? null,
        capacity: null,
        venue_type: null,
        latitude: null,
        longitude: null,
        website_url: row.candidate.website ?? null,
        photos: [],
        created_by: profile?.id ?? null,
      });
      await resolveLinkCandidate(row.url, 'created', { venuePlaceId: venue.id });
      return `Sala «${venue.name}» creada. Para traer su agenda sola hace falta una fuente con parser (docs/scraping.md).`;
    });

  const createArtist = () =>
    run(async () => {
      if (!name.trim()) throw new Error('El artista necesita nombre.');
      const artist = await artistService.createArtist({
        name: name.trim(),
        artist_type: 'band',
        city: city.trim() || null,
        bio: null,
        avatar_url: null,
        genres: [],
        external_links: artistLinksFrom(row.candidate),
      });
      await resolveLinkCandidate(row.url, 'created', { artistId: artist.id });
      return `Artista «${artist.name}» creado.`;
    });

  const dismiss = () =>
    run(async () => {
      await resolveLinkCandidate(row.url, 'dismissed');
      return 'Descartado.';
    });

  const linkKeys = Object.keys(row.candidate.links ?? {});

  return (
    <li className="space-y-3 p-3">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-white/70" aria-hidden="true">
          <Icon size={18} />
        </span>
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/50">
            {KIND_LABEL[row.kind]}
            {row.people > 1 ? ` · ${row.people} personas` : ''}
          </p>
          <a href={row.url} target="_blank" rel="noopener noreferrer" className="block truncate text-white/80 underline">
            {row.url}
          </a>
          {row.candidate.address ? <p className="truncate text-xs text-white/50">{row.candidate.address}</p> : null}
          {linkKeys.length ? <p className="truncate text-xs text-white/50">Enlaces: {linkKeys.join(', ')}</p> : null}
          {row.notes.map(note => (
            <p key={note} className="text-xs italic text-white/60">«{note}»</p>
          ))}
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputClass} value={name} onChange={event => setName(event.target.value)} placeholder="Nombre" aria-label="Nombre" />
        <input className={inputClass} value={city} onChange={event => setCity(event.target.value)} placeholder="Ciudad" aria-label="Ciudad" />
      </div>
      <div className="flex flex-wrap gap-2">
        {row.kind !== 'artist' ? (
          <button type="button" disabled={busy} onClick={createVenue} className="rounded-xl bg-app-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
            Crear sala
          </button>
        ) : null}
        {row.kind !== 'venue' ? (
          <button type="button" disabled={busy} onClick={createArtist} className="rounded-xl bg-app-accent px-3 py-2 text-xs font-semibold text-white disabled:opacity-60">
            Crear artista
          </button>
        ) : null}
        <button type="button" disabled={busy} onClick={dismiss} className="rounded-xl border border-white/15 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-60">
          Descartar
        </button>
      </div>
      {error ? <p className="text-xs text-white/70">{error}</p> : null}
    </li>
  );
};

const LinkCandidates: React.FC = () => {
  const [rows, setRows] = useState<LinkCandidateRow[] | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    listLinkCandidates()
      .then(setRows)
      .catch(() => {
        setRows([]);
        setMessage('No se han podido cargar las sugerencias.');
      });
  }, []);

  const done = (url: string, text: string) => {
    setRows(current => (current || []).filter(row => row.url !== url));
    setMessage(text);
  };

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div>
        <h2 className="text-sm font-semibold">Salas y artistas sugeridos</h2>
        <p className="text-sm text-white/70">
          Links de «¿Falta un concierto?» que son la web de una sala o de un artista, o un perfil. Al crearlo, quien lo mandó recibe un aviso.
        </p>
      </div>
      {message ? <p className="text-sm text-white/70">{message}</p> : null}
      {rows === null ? (
        <p className="text-sm text-white/50">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-white/50">No hay sugerencias pendientes.</p>
      ) : (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {rows.map(row => (
            <CandidateItem key={row.url} row={row} onDone={done} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default LinkCandidates;

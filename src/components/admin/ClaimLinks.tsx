import React, { useEffect, useState } from 'react';
import { IconCopy } from '../icons';
import { managementService } from '../../services/management.service';
import { teamService, type ClaimLink } from '../../services/team.service';
import { claimLinkUrl, linkStatus } from '../../features/management/profileForm';
import { copyLink } from '../../features/management/shareLink';
import { publicAppBaseUrl } from '../../lib/uploadQr';

// Admin → «Enlaces»: a personal, one-time link to claim a specific artist or
// venue, for one-to-one outreach. Whoever opens it signed in gets the profile
// without the manual review. Valid 30 days; every use is logged.

type Hit = { subjectId: string; name: string; city: string | null; kind: 'artist' | 'venue' };

const STATUS_LABEL: Record<string, string> = { open: 'Sin usar', used: 'Usado', expired: 'Caducado', revoked: 'Anulado' };

const ClaimLinks: React.FC = () => {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [picked, setPicked] = useState<Hit | null>(null);
  const [note, setNote] = useState('');
  const [created, setCreated] = useState<string | null>(null);
  const [links, setLinks] = useState<ClaimLink[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const reload = () => teamService.listClaimLinks().then(setLinks).catch(() => setLinks([]));
  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2 || picked) {
      setHits([]);
      return undefined;
    }
    let live = true;
    const timer = window.setTimeout(async () => {
      const [artists, venues] = await Promise.all([
        managementService.searchArtists(term).catch(() => []),
        managementService.searchVenues(term).catch(() => []),
      ]);
      if (!live) return;
      setHits([
        ...(venues || []).map(venue => ({ subjectId: venue.subject_id as string, name: venue.name, city: venue.city, kind: 'venue' as const })),
        ...(artists || []).map(artist => ({ subjectId: artist.subject_id as string, name: artist.name, city: artist.city, kind: 'artist' as const })),
      ].filter(hit => hit.subjectId));
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [query, picked]);

  const create = async () => {
    if (!picked) return;
    setBusy(true);
    setMessage('');
    try {
      const token = await teamService.createClaimLink(picked.subjectId, note);
      setCreated(claimLinkUrl(publicAppBaseUrl(), token));
      setNote('');
      await reload();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se ha podido crear el enlace.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <p className="text-sm text-white/70">Enlace personal para que una sala o artista reclame su perfil sin revisión. Un uso, 30 días.</p>

      {picked ? (
        <div className="flex items-center gap-3 rounded-xl border border-white/10 p-3">
          <span className="flex-1 text-sm">
            <strong>{picked.name}</strong>
            <span className="text-white/50"> · {picked.kind === 'venue' ? 'Sala' : 'Artista'}{picked.city ? ` · ${picked.city}` : ''}</span>
          </span>
          <button type="button" onClick={() => { setPicked(null); setCreated(null); }} className="text-xs font-semibold text-white/60">
            Cambiar
          </button>
        </div>
      ) : (
        <div>
          <input
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Buscar sala o artista"
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
          />
          {hits.length ? (
            <ul className="mt-2 max-h-64 overflow-y-auto rounded-xl border border-white/10">
              {hits.map(hit => (
                <li key={hit.subjectId}>
                  <button
                    type="button"
                    onClick={() => { setPicked(hit); setQuery(''); setCreated(null); }}
                    className="flex min-h-11 w-full items-center justify-between px-3 text-left text-sm hover:bg-white/5"
                  >
                    <span>{hit.name}</span>
                    <span className="text-xs text-white/50">{hit.kind === 'venue' ? 'Sala' : 'Artista'}{hit.city ? ` · ${hit.city}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}

      {picked ? (
        <>
          <input
            type="text"
            value={note}
            maxLength={200}
            onChange={event => setNote(event.target.value)}
            placeholder="Nota interna (a quién se lo mandas)"
            className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
          />
          <button
            type="button"
            disabled={busy}
            onClick={create}
            className="inline-flex w-full items-center justify-center rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? 'Creando…' : 'Crear enlace'}
          </button>
        </>
      ) : null}

      {created ? (
        <div className="rounded-xl border border-dashed border-white/25 p-3">
          <p className="break-all font-mono text-xs text-white/75">{created}</p>
          <button
            type="button"
            onClick={() => copyLink(created).then(ok => setMessage(ok ? 'Copiado.' : 'No se ha podido copiar.'))}
            className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-full border border-white/15 px-3.5 text-xs font-semibold"
          >
            <IconCopy size={14} /> Copiar
          </button>
          <p className="mt-1 text-xs text-white/45">Solo se muestra ahora: guárdalo donde vayas a enviarlo.</p>
        </div>
      ) : null}
      {message ? <p className="text-sm text-white/70">{message}</p> : null}

      {links.length ? (
        <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
          {links.map(link => {
            const status = linkStatus({ used_at: link.usedAt, revoked_at: link.revokedAt, expires_at: link.expiresAt });
            return (
              <li key={link.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{link.name ?? 'Perfil'}</span>
                  <span className="block truncate text-xs text-white/50">
                    {STATUS_LABEL[status]}{link.usedRole ? ` · ${link.usedRole}` : ''}{link.note ? ` · ${link.note}` : ''}
                  </span>
                </span>
                {status === 'open' ? (
                  <button
                    type="button"
                    onClick={() => teamService.revokeClaimLink(link.id).then(reload).catch(err => setMessage(err.message))}
                    className="text-xs font-semibold text-white/60"
                  >
                    Anular
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
};

export default ClaimLinks;

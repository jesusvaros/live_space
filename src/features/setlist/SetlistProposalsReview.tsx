import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../../components/ui/Button';
import { Spinner } from '../../components/ui/AppPrimitives';
import { listPendingProposals, reviewProposal, type PendingProposal } from './setlistProposals';

// Setlists proposed by the audience, waiting for a decision. In Gestión for
// the concerts of the managed venue / artist; in Admin as the moderation
// queue. Approving publishes the setlist (review_setlist_proposal). A
// manager's or setlist.fm's setlist is only replaced when the reviewer
// manages the concert and ticks «Sustituir»; moderation can only reject then.

type SetlistProposalsReviewProps =
  | { mode: 'venue'; venueId: string }
  | { mode: 'artist'; artistId: string }
  | { mode: 'moderation' };

const formatDate = (iso: string) =>
  new Date(iso)
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
    .replace(/\./g, '')
    .replace(',', '')
    .toUpperCase();

const SetlistProposalsReview: React.FC<SetlistProposalsReviewProps> = props => {
  const [rows, setRows] = useState<PendingProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [replace, setReplace] = useState<Record<string, boolean>>({});

  const venueId = props.mode === 'venue' ? props.venueId : null;
  const artistId = props.mode === 'artist' ? props.artistId : null;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setRows(await listPendingProposals({ venueId, artistId }));
    } catch {
      setRows([]);
      setError('No se han podido cargar los setlists propuestos.');
    } finally {
      setLoading(false);
    }
  }, [venueId, artistId]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (proposal: PendingProposal, approve: boolean) => {
    setBusyId(proposal.id);
    setError('');
    try {
      await reviewProposal(proposal.id, approve, approve ? null : note, Boolean(replace[proposal.id]));
      setRejectingId(null);
      setNote('');
      await load();
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar la decisión.');
    } finally {
      setBusyId(null);
    }
  };

  const moderation = props.mode === 'moderation';
  if (loading) return moderation ? <div className="flex justify-center py-8"><Spinner /></div> : null;
  if (!rows.length && !error) {
    return moderation ? <p className="text-sm text-white/60">No hay setlists pendientes de revisión.</p> : null;
  }

  return (
    <section className={moderation ? 'space-y-2' : 'mx-4 mt-4 space-y-2'}>
      <h2 className="font-mono text-[11px] font-semibold uppercase text-white/55">
        Setlists propuestos por el público · {rows.length}
      </h2>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map(proposal => {
          const busy = busyId === proposal.id;
          const blockedByOfficial = proposal.has_other_setlist && !proposal.can_manage;
          const needsReplace = proposal.has_other_setlist && proposal.can_manage;
          return (
            <li key={proposal.id} className="rounded-[18px] border border-app-line bg-app-surface p-3">
              <p className="font-mono text-[11px] font-semibold text-app-accent">{formatDate(proposal.starts_at)}</p>
              <p className="mt-0.5 truncate font-display text-base font-bold text-app-ink">
                <Link to={`/event/${proposal.event_id}`}>{proposal.event_name}</Link>
              </p>
              <p className="mt-0.5 truncate text-xs text-white/55">
                {[proposal.venue_name, proposal.proposer_username ? `Propuesto por @${proposal.proposer_username}` : 'Propuesto por alguien del público']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <ol className="mt-2 max-h-56 list-none overflow-y-auto rounded-xl bg-white/5 p-2.5">
                {proposal.titles.map((title, index) => (
                  <li key={`${index}-${title}`} className="flex gap-2.5 text-[13px] text-app-ink">
                    <span className="w-6 shrink-0 font-mono text-[11px] font-semibold text-[#8f8b84]">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0 break-words">{title}</span>
                  </li>
                ))}
              </ol>
              {blockedByOfficial ? (
                <p className="mt-2 text-[12px] text-amber-300">
                  El concierto ya tiene setlist de la sala, del artista o de setlist.fm: solo quien lo gestiona puede sustituirlo.
                </p>
              ) : null}
              {needsReplace ? (
                <label className="mt-2 flex min-h-11 items-center gap-2.5 text-[13px] text-app-ink">
                  <input
                    type="checkbox"
                    checked={Boolean(replace[proposal.id])}
                    onChange={event => setReplace(current => ({ ...current, [proposal.id]: event.target.checked }))}
                    className="h-5 w-5 accent-app-accent"
                  />
                  Sustituir el setlist actual del concierto por este
                </label>
              ) : null}
              {rejectingId === proposal.id ? (
                <div className="mt-3 space-y-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-[13px] font-semibold">Motivo (opcional, lo verá quien lo propuso)</span>
                    <input
                      className="min-h-11 w-full rounded-xl border border-app-line bg-app-bg px-3 text-[15px] text-app-ink focus:border-app-accent focus:outline-none"
                      value={note}
                      maxLength={280}
                      onChange={event => setNote(event.target.value)}
                      placeholder="Faltan canciones del bis"
                    />
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setRejectingId(null)} disabled={busy}>
                      Cancelar
                    </Button>
                    <Button size="sm" className="flex-1" onClick={() => decide(proposal, false)} disabled={busy}>
                      {busy ? <Spinner className="h-4 w-4" /> : null}
                      Confirmar rechazo
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setRejectingId(proposal.id);
                      setNote('');
                    }}
                    disabled={busy}
                  >
                    Rechazar
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => decide(proposal, true)}
                    disabled={busy || blockedByOfficial || (needsReplace && !replace[proposal.id])}
                  >
                    {busy ? <Spinner className="h-4 w-4" /> : null}
                    Aprobar
                  </Button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default SetlistProposalsReview;

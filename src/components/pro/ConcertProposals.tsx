import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';
import { Spinner } from '../ui/AppPrimitives';
import { ConcertProposal, concertsService } from '../../services/concerts.service';

type ConcertProposalsProps =
  | { mode: 'venue'; venueId: string; onDecided?: () => void }
  | { mode: 'artist'; artistId: string }
  | { mode: 'moderation' };

const formatDate = (iso: string) => {
  const date = new Date(iso);
  const day = date
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' })
    .replace(/\./g, '')
    .replace(',', '');
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Madrid' });
  return `${day} · ${time}`.toUpperCase();
};

const statusLabel = (proposal: ConcertProposal) => {
  switch (proposal.status) {
    case 'accepted':
      return { text: 'Aceptado', className: 'text-emerald-400' };
    case 'rejected':
      return { text: 'Rechazado', className: 'text-rose-300' };
    case 'withdrawn':
      return { text: 'Retirado', className: 'text-white/50' };
    default:
      return {
        text: proposal.reviewer === 'venue' ? 'Pendiente de la sala' : 'Pendiente de revisión',
        className: 'text-amber-300',
      };
  }
};

// Concert proposals from artists. Venue managers (and admins in the
// moderation queue) accept or reject them; the proposing artist follows
// their state. The decision runs in review_concert_proposal().
const ConcertProposals: React.FC<ConcertProposalsProps> = props => {
  const [rows, setRows] = useState<ConcertProposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const key = props.mode === 'venue' ? props.venueId : props.mode === 'artist' ? props.artistId : 'moderation';
  const canDecide = props.mode !== 'artist';
  const onDecided = props.mode === 'venue' ? props.onDecided : undefined;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (props.mode === 'venue') {
        setRows(await concertsService.listForVenue(key));
      } else if (props.mode === 'artist') {
        setRows(await concertsService.listForArtist(key));
      } else {
        setRows(await concertsService.listForModeration());
      }
    } catch (err: any) {
      setRows([]);
      setError(err?.message || 'No se han podido cargar las propuestas.');
    } finally {
      setLoading(false);
    }
  }, [props.mode, key]);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (proposal: ConcertProposal, accept: boolean) => {
    setBusyId(proposal.id);
    setError('');
    try {
      await concertsService.review(proposal.id, accept, accept ? null : note);
      setRejectingId(null);
      setNote('');
      await load();
      onDecided?.();
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar la decisión.');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return props.mode === 'moderation' ? <div className="flex justify-center py-8"><Spinner /></div> : null;
  }
  if (!rows.length && !error) {
    return props.mode === 'moderation' ? <p className="text-sm text-white/60">No hay conciertos pendientes de revisión.</p> : null;
  }

  const title =
    props.mode === 'venue'
      ? `Propuestas de artistas · ${rows.length}`
      : props.mode === 'artist'
        ? 'Tus propuestas a salas'
        : 'Conciertos pendientes';

  return (
    <section className={props.mode === 'moderation' ? 'space-y-2' : 'mx-4 mt-4 space-y-2'}>
      <h2 className="font-mono text-[11px] font-semibold uppercase text-white/55">{title}</h2>
      {error ? <p role="alert" className="text-sm text-rose-300">{error}</p> : null}
      <ul className="space-y-2">
        {rows.map(proposal => {
          const status = statusLabel(proposal);
          const pending = proposal.status === 'pending';
          const event = proposal.event;
          return (
            <li key={proposal.id} className="rounded-[18px] border border-app-line bg-app-surface p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  {event ? (
                    <p className="font-mono text-[11px] font-semibold text-app-accent">{formatDate(event.starts_at)}</p>
                  ) : null}
                  <p className="mt-0.5 truncate font-display text-base font-bold text-app-ink">
                    {event ? <Link to={`/event/${event.id}`}>{event.name}</Link> : 'Concierto'}
                  </p>
                  <p className="mt-0.5 truncate text-xs text-white/55">
                    {props.mode === 'artist'
                      ? [proposal.venue?.name, proposal.venue?.city].filter(Boolean).join(' · ')
                      : [
                          event?.lineup.length ? event.lineup.join(', ') : proposal.artist?.name,
                          props.mode === 'moderation' ? proposal.venue?.name : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                  </p>
                  {event?.ticket_url ? (
                    <a href={event.ticket_url} target="_blank" rel="noreferrer" className="mt-0.5 block truncate text-xs text-white/45 underline">
                      Entradas
                    </a>
                  ) : null}
                </div>
                {!canDecide || !pending ? (
                  <span className={`shrink-0 font-mono text-[11px] font-semibold uppercase ${status.className}`}>{status.text}</span>
                ) : null}
              </div>
              {proposal.status === 'rejected' && proposal.review_note ? (
                <p className="mt-2 rounded-lg bg-white/5 px-2.5 py-2 text-[13px] text-white/70">«{proposal.review_note}»</p>
              ) : null}
              {canDecide && pending ? (
                rejectingId === proposal.id ? (
                  <div className="mt-3 space-y-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="text-[13px] font-semibold">Motivo (opcional, lo verá el artista)</span>
                      <input
                        className="min-h-11 w-full rounded-xl border border-app-line bg-app-bg px-3 text-[15px] text-app-ink focus:border-app-accent focus:outline-none"
                        value={note}
                        maxLength={280}
                        onChange={e => setNote(e.target.value)}
                        placeholder="Esa noche ya tenemos programación"
                      />
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" onClick={() => setRejectingId(null)} disabled={busyId === proposal.id}>
                        Cancelar
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => decide(proposal, false)} disabled={busyId === proposal.id}>
                        {busyId === proposal.id ? <Spinner className="h-4 w-4" /> : null}
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
                      disabled={busyId === proposal.id}
                    >
                      Rechazar
                    </Button>
                    <Button size="sm" onClick={() => decide(proposal, true)} disabled={busyId === proposal.id}>
                      {busyId === proposal.id ? <Spinner className="h-4 w-4" /> : null}
                      Aceptar
                    </Button>
                  </div>
                )
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
};

export default ConcertProposals;

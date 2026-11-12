import React, { useEffect, useState } from 'react';
import { IconEdit, IconPlus } from '../../components/icons';
import { useAuth } from '../../contexts/AuthContext';
import type { EventSetlistEntry } from '../../lib/types';
import SetlistProposalSheet from './SetlistProposalSheet';
import { fetchAttendance, fetchMyLatestProposal, type MyProposal } from './setlistProposals';

// The audience's way in to a concert's setlist, on the concert page and in
// the uploader's «Aún no hay setlist» notice:
// - nothing for signed-out people, before the concert starts, or when the
//   setlist is the venue's / artist's / setlist.fm's (never overwritten);
// - «Marca que fuiste…» (concert page only) without attendance;
// - «Tu propuesta está pendiente» with their pending proposal (editable);
// - otherwise «¿Tienes el setlist? Propónlo», or «Corregir setlist» when
//   the current one came from the audience.

type SetlistProposalActionProps = {
  eventId: string;
  startsAt: string;
  setlist: readonly EventSetlistEntry[];
  /** Known attendance (concert page); undefined loads it. */
  attendance?: string | null;
  variant?: 'event' | 'upload';
  /** A manager's proposal is applied at once: reload the setlist. */
  onApplied?: () => void;
  className?: string;
};

const SetlistProposalAction: React.FC<SetlistProposalActionProps> = ({
  eventId,
  startsAt,
  setlist,
  attendance,
  variant = 'event',
  onApplied,
  className = '',
}) => {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [loadedAttendance, setLoadedAttendance] = useState<string | null | undefined>(undefined);
  const [proposal, setProposal] = useState<MyProposal | null>(null);
  const [open, setOpen] = useState(false);

  const started = new Date(startsAt).getTime() <= Date.now();
  const locked = setlist.some(entry => (entry.source ?? 'manual') !== 'audience');
  const relevant = Boolean(userId) && started && !locked;

  useEffect(() => {
    if (!relevant || !userId || attendance !== undefined) return undefined;
    let cancelled = false;
    fetchAttendance(eventId, userId).then(status => {
      if (!cancelled) setLoadedAttendance(status);
    });
    return () => {
      cancelled = true;
    };
  }, [relevant, userId, eventId, attendance]);

  useEffect(() => {
    setProposal(null);
    if (!relevant || !userId) return undefined;
    let cancelled = false;
    fetchMyLatestProposal(eventId, userId).then(row => {
      if (!cancelled) setProposal(row);
    });
    return () => {
      cancelled = true;
    };
  }, [relevant, userId, eventId]);

  if (!relevant) return null;
  const status = attendance !== undefined ? attendance : loadedAttendance;
  if (status === undefined) return null;
  const attended = status === 'attended' || status === 'going';

  if (!attended) {
    return variant === 'event' ? (
      <p className={`text-[13px] text-white/50 ${className}`}>Marca «Fui» para proponer el setlist.</p>
    ) : null;
  }

  const pending = proposal?.status === 'pending' ? proposal : null;
  const correcting = setlist.length > 0;
  const initialTitles = pending
    ? pending.titles
    : setlist.map(entry => entry.song_title || '').filter(Boolean);

  return (
    <div className={className}>
      {pending ? (
        <div className="flex items-center gap-3 rounded-2xl border border-dashed border-app-line px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block text-[14px] font-semibold text-app-ink">Tu propuesta está pendiente</span>
            <span className="block text-[12px] text-white/50">La verá el artista o moderación antes de publicarla.</span>
          </span>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="min-h-11 shrink-0 rounded-full border border-app-line px-3 text-xs font-semibold text-app-ink"
          >
            Editar
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={
            variant === 'upload'
              ? 'mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-full bg-app-accent px-3.5 text-[13px] font-bold text-[#14151a]'
              : 'inline-flex min-h-11 items-center gap-1.5 rounded-full border border-app-line px-3.5 text-[13px] font-semibold text-app-ink'
          }
        >
          {correcting ? <IconEdit size={15} /> : <IconPlus size={15} />}
          {correcting ? 'Corregir setlist' : '¿Tienes el setlist? Propónlo'}
        </button>
      )}
      {proposal?.status === 'rejected' && proposal.review_note && !pending ? (
        <p className="mt-1.5 text-[12px] text-white/50">Tu última propuesta no se aceptó: «{proposal.review_note}»</p>
      ) : null}
      <SetlistProposalSheet
        isOpen={open}
        onClose={() => setOpen(false)}
        eventId={eventId}
        initialTitles={initialTitles}
        correcting={correcting && !pending}
        onSubmitted={result => {
          if (result.kind === 'approved') {
            setProposal(null);
            onApplied?.();
            return;
          }
          setProposal({
            id: 'local',
            status: 'pending',
            titles: result.titles,
            review_note: null,
            created_at: new Date().toISOString(),
          });
        }}
      />
    </div>
  );
};

export default SetlistProposalAction;

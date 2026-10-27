import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import {
  fetchVenueFeedbackSummary,
  reportVenueFeedback,
  VENUE_FEEDBACK_MIN_VOTES,
  VENUE_TAG_LABELS,
  VENUE_TAG_WARNINGS,
  type VenueTagSummary,
} from './api';

const joinSpanish = (items: string[]) =>
  items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`;

// Words instead of numbers: the share of people who left tags for the venue.
const shareLabel = (row: VenueTagSummary) => {
  const share = row.total > 0 ? row.votes / row.total : 0;
  if (share >= 0.5) return 'la mayoría';
  if (share >= 0.25) return 'muchos';
  return 'algunos';
};

/**
 * "Lo que dice quien fue" for a venue. Only tags with at least five votes
 * come from the database; with none, it renders nothing.
 */
const VenueFeedbackSummary: React.FC<{ venueId: string; className?: string }> = ({ venueId, className = '' }) => {
  const { user } = useAuth();
  const [rows, setRows] = useState<VenueTagSummary[]>([]);
  const [reported, setReported] = useState<'idle' | 'sent' | 'error'>('idle');

  useEffect(() => {
    let cancelled = false;
    setRows([]);
    setReported('idle');
    if (!venueId) return undefined;
    fetchVenueFeedbackSummary(venueId)
      .then(data => {
        if (!cancelled) setRows(data);
      })
      .catch(error => console.warn('Venue feedback summary unavailable', error));
    return () => {
      cancelled = true;
    };
  }, [venueId]);

  if (rows.length === 0) return null;
  const majority = rows.filter(row => shareLabel(row) === 'la mayoría');
  const headline = (majority.length ? majority : rows.slice(0, 1)).map(row => VENUE_TAG_LABELS[row.tag].toLowerCase());

  const report = async () => {
    if (!user) return;
    try {
      await reportVenueFeedback(venueId, user.id);
      setReported('sent');
    } catch {
      setReported('error');
    }
  };

  return (
    <section aria-labelledby={`venue-feedback-summary-${venueId}`} className={`rounded-[18px] border border-app-line bg-app-surface p-4 ${className}`}>
      <h2 id={`venue-feedback-summary-${venueId}`} className="m-0 font-display text-lg font-bold text-app-ink">
        Lo que dice quien fue
      </h2>
      <p className="m-0 mt-1 text-sm text-[#c9c5bd]">
        {majority.length ? 'La mayoría dice: ' : 'Lo más repetido: '}
        <span className="font-semibold text-app-ink">{joinSpanish(headline)}</span>
      </p>
      <ul className="m-0 mt-3 flex list-none flex-col gap-2.5 p-0">
        {rows.map(row => (
          <li key={row.tag} className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: VENUE_TAG_WARNINGS.has(row.tag) ? '#ffb02e' : '#25d47b' }}
            />
            <span className="flex-1 font-semibold text-app-ink">{VENUE_TAG_LABELS[row.tag]}</span>
            <span className="font-mono text-xs font-semibold text-[#c9c5bd]">{shareLabel(row)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="m-0 text-xs text-[#8f8b84]">
          Solo cuenta quien marcó «Fui». Se muestra a partir de {VENUE_FEEDBACK_MIN_VOTES} votos.
        </p>
        {user && reported === 'idle' && (
          <button
            type="button"
            onClick={report}
            className="min-h-11 shrink-0 px-1 text-xs font-semibold text-[#8f8b84] underline-offset-2 hover:text-white hover:underline"
          >
            Reportar
          </button>
        )}
        {reported === 'sent' && <span className="shrink-0 text-xs text-[#8f8b84]" role="status">Gracias, lo revisaremos</span>}
        {reported === 'error' && <span className="shrink-0 text-xs text-rose-400" role="status">No se pudo reportar</span>}
      </div>
    </section>
  );
};

export default VenueFeedbackSummary;

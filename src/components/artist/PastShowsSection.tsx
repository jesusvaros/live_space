import React from 'react';
import EventPosterTile from '../../features/events/components/EventPosterTile';
import { ArtistProfileEvent } from './types';

type PastShowsSectionProps = {
  events: ArtistProfileEvent[];
  playedCount: number;
  isManager: boolean;
  onViewEvent: (id: string) => void;
  onCreateShow: () => void;
};

const PastShowsSection: React.FC<PastShowsSectionProps> = ({
  events,
  playedCount,
  isManager,
  onViewEvent,
  onCreateShow,
}) => (
  <section className="animate-fade-up space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Archivo</p>
        <h2 className="font-display text-xl font-bold text-white">Conciertos pasados</h2>
        <p className="text-sm text-white/55">Últimos {events.length || 3} conciertos.</p>
      </div>
      {playedCount > 0 && (
        <span className="rounded-full border border-white/20 bg-white/[0.04] px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/80">
          {playedCount} tocados
        </span>
      )}
    </div>
    {events.length === 0 ? (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
        <p className="font-semibold text-white">Aún no hay conciertos pasados</p>
        <p className="mt-1 text-sm text-white/55">
          El archivo aparecerá en cuanto termine el primer concierto.
        </p>
        {isManager ? (
          <button
            type="button"
            onClick={onCreateShow}
            className="mt-4 inline-flex items-center justify-center rounded-full border border-white/20 bg-white/[0.06] px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/[0.1]"
          >
            Crear concierto
          </button>
        ) : null}
      </div>
    ) : (
      <div className="flex gap-3 overflow-x-auto pb-1">
        {events.map(event => {
          const dateLabel = new Date(event.starts_at).toLocaleDateString('es-ES', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          });
          const venueName = event.venue_place?.name || event.address || 'Sala por confirmar';
          const city = event.venue_place?.city || event.city || 'Ciudad';
          return (
            <div key={event.id} className="w-[220px] shrink-0 overflow-hidden rounded-2xl border border-white/10">
              <EventPosterTile
                event={event}
                className="w-full"
                kicker={dateLabel}
                title={venueName}
                subtitle={city}
                onSelect={selected => onViewEvent(selected.id)}
              />
            </div>
          );
        })}
      </div>
    )}
  </section>
);

export default PastShowsSection;

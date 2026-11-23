import React from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { IconMap, IconMic } from '../../components/icons';
import { HistoryEntry, useConcertHistory } from './useConcertHistory';

// Each carousel shows the top ten.
const TOP = 10;

const timesLabel = (count: number) => `${count} ${count === 1 ? 'vez' : 'veces'}`;

// The stamps of the profile's passport (top of «Conciertos»): the venues the
// user goes to most and the artists they have seen most, ranked by visits.
// The totals live in the profile header, so they are not repeated here.
const ConcertHistorySection: React.FC<{ userId: string }> = ({ userId }) => {
  const navigate = useNavigate();
  const { history } = useConcertHistory(userId);

  if (history.concerts === 0) return null;

  const renderCarousel = (title: string, icon: React.ReactNode, entries: HistoryEntry[]) =>
    entries.length === 0 ? null : (
      <div className="flex flex-col gap-1.5">
        <h3 className="flex items-center gap-1.5 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">
          <span aria-hidden className="text-white/45">{icon}</span>
          {title}
        </h3>
        {/* A scrolling row also clips vertically: pt-2 keeps the rank badge
            (-top-1) and the first place's ring (2px + 2px offset) inside it. */}
        <ol className="flex gap-3 overflow-x-auto px-4 pb-1 pt-2 [scrollbar-width:none]">
          {entries.slice(0, TOP).map((entry, index) => (
            <li key={entry.id} className="shrink-0">
              <button
                type="button"
                onClick={() => navigate(`/tabs/${entry.kind}/${entry.id}`)}
                aria-label={`${index + 1}. ${entry.name}, ${timesLabel(entry.count)}`}
                className="flex w-[76px] flex-col items-center gap-1.5 text-center transition-transform active:scale-95 motion-reduce:transition-none"
              >
                <span className="relative">
                  <Avatar
                    name={entry.name}
                    src={entry.imageUrl}
                    kind={entry.kind}
                    className={`h-[68px] w-[68px] text-[22px] ${index === 0 ? 'ring-2 ring-app-accent ring-offset-2 ring-offset-app-bg' : ''}`}
                  />
                  <span
                    aria-hidden
                    className="absolute -left-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-app-bg bg-app-ink px-1 font-poster text-[13px] leading-none text-app-bg"
                  >
                    {index + 1}
                  </span>
                </span>
                <span className="w-full truncate text-xs font-semibold text-app-ink">{entry.name}</span>
                <span className="-mt-1 font-mono text-[10px] font-semibold uppercase text-white/45">×{entry.count}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );

  return (
    <section aria-label="Tus salas y artistas" className="flex flex-col gap-4">
      {renderCarousel('Tus salas', <IconMap size={13} />, history.venues)}
      {renderCarousel('Tus artistas', <IconMic size={13} />, history.artists)}
    </section>
  );
};

export default ConcertHistorySection;

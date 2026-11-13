import React from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { HistoryEntry, useConcertHistory } from './useConcertHistory';

// Each carousel shows the top ten.
const TOP = 10;

const timesLabel = (count: number) => `${count} ${count === 1 ? 'vez' : 'veces'}`;

// "Tu historial": how many concerts, venues and artists, then where the user
// goes most and who they have seen most, as photo carousels ranked by visits.
const ConcertHistorySection: React.FC<{ userId: string }> = ({ userId }) => {
  const navigate = useNavigate();
  const { history } = useConcertHistory(userId);

  if (history.concerts === 0) return null;

  const renderCarousel = (title: string, entries: HistoryEntry[]) =>
    entries.length === 0 ? null : (
      <div className="flex flex-col gap-2">
        <h3 className="px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">{title}</h3>
        <ol className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {entries.slice(0, TOP).map((entry, index) => (
            <li key={entry.id} className="shrink-0">
              <button
                type="button"
                onClick={() => navigate(`/tabs/${entry.kind}/${entry.id}`)}
                aria-label={`${index + 1}. ${entry.name}, ${timesLabel(entry.count)}`}
                className="flex w-[76px] flex-col items-center gap-1.5 text-center"
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
                <span className="-mt-1 font-mono text-[10px] font-semibold uppercase text-app-accent">{timesLabel(entry.count)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>
    );

  const stats = [
    { value: history.concerts, label: history.concerts === 1 ? 'concierto' : 'conciertos' },
    { value: history.venues.length, label: history.venues.length === 1 ? 'sala' : 'salas' },
    { value: history.artists.length, label: history.artists.length === 1 ? 'artista' : 'artistas' },
  ];

  return (
    <section aria-labelledby="tu-historial" className="mt-7 flex flex-col gap-3">
      <h2 id="tu-historial" className="px-4 font-display text-lg font-bold text-app-ink">Tu historial</h2>
      <div className="mx-4 grid grid-cols-3 divide-x divide-app-line rounded-2xl border border-app-line bg-app-surface py-3">
        {stats.map(stat => (
          <p key={stat.label} className="flex flex-col items-center">
            <span className="font-poster text-[30px] leading-none text-app-ink">{stat.value}</span>
            <span className="mt-1 text-xs text-[#c9c5bd]">{stat.label}</span>
          </p>
        ))}
      </div>
      {renderCarousel('Las salas a las que más vas', history.venues)}
      {renderCarousel('Los artistas que más has visto', history.artists)}
    </section>
  );
};

export default ConcertHistorySection;

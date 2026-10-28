import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import { HistoryEntry, useConcertHistory } from './useConcertHistory';

const COLLAPSED = 3;
const EXPANDED = 10;

const timesLabel = (count: number) => `${count} ${count === 1 ? 'vez' : 'veces'}`;

// "Tu historial": where the user goes most and who they have seen most.
const ConcertHistorySection: React.FC<{ userId: string }> = ({ userId }) => {
  const navigate = useNavigate();
  const { history } = useConcertHistory(userId);
  const [expanded, setExpanded] = useState(false);

  if (history.concerts === 0) return null;

  const limit = expanded ? EXPANDED : COLLAPSED;
  const canExpand = history.venues.length > COLLAPSED || history.artists.length > COLLAPSED;

  const renderList = (title: string, entries: HistoryEntry[]) =>
    entries.length === 0 ? null : (
      <div>
        <h3 className="px-0.5 pb-1 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/50">{title}</h3>
        <ol className="divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {entries.slice(0, limit).map((entry, index) => (
            <li key={entry.id}>
              <button
                type="button"
                onClick={() => navigate(`/tabs/${entry.kind}/${entry.id}`)}
                className="flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left"
              >
                <span className="w-5 shrink-0 text-center font-poster text-lg leading-none text-app-accent">{index + 1}</span>
                <Avatar name={entry.name} src={entry.imageUrl} kind={entry.kind} className="h-9 w-9 text-[13px]" />
                <span className="min-w-0 flex-1 truncate font-display text-[15px] font-bold text-app-ink">{entry.name}</span>
                <span className="shrink-0 font-mono text-xs text-white/55">{timesLabel(entry.count)}</span>
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
    <section aria-labelledby="tu-historial" className="mx-4 mt-[18px] flex flex-col gap-3">
      <h2 id="tu-historial" className="font-display text-lg font-bold text-app-ink">Tu historial</h2>
      <div className="grid grid-cols-3 gap-2">
        {stats.map(stat => (
          <p key={stat.label} className="rounded-2xl border border-app-line bg-app-surface px-3 py-2.5">
            <span className="block font-poster text-[28px] leading-none text-app-ink">{stat.value}</span>
            <span className="text-xs text-[#c9c5bd]">{stat.label}</span>
          </p>
        ))}
      </div>
      {renderList('Las salas a las que más vas', history.venues)}
      {renderList('Los artistas que más has visto', history.artists)}
      {canExpand ? (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          aria-expanded={expanded}
          className="min-h-11 self-start text-sm font-semibold text-app-accent"
        >
          {expanded ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </section>
  );
};

export default ConcertHistorySection;

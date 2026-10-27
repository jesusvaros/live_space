import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GeneratedPoster from '../../../components/ui/GeneratedPoster';
import { Festival, festivalDateRange, festivalService } from '../../../services/festival.service';

// Upcoming festivals in every city: poster, dates and place. Hidden while
// there are none.
const FestivalsSection: React.FC = () => {
  const navigate = useNavigate();
  const [festivals, setFestivals] = useState<Festival[]>([]);

  useEffect(() => {
    let cancelled = false;
    festivalService
      .listUpcoming()
      .then(list => {
        if (!cancelled) setFestivals(list);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  if (festivals.length === 0) return null;

  return (
    <section aria-labelledby="festivales" className="flex flex-col gap-3 px-4 pt-[22px]">
      <h2 id="festivales" className="font-display text-2xl font-bold text-app-ink">Festivales</h2>
      <div className="-mr-4 flex gap-3 overflow-x-auto pr-4">
        {festivals.map(festival => (
          <button
            key={festival.id}
            type="button"
            onClick={() => navigate(`/tabs/festival/${festival.id}`)}
            className="w-[220px] shrink-0 text-left text-app-ink"
          >
            <span className="relative block h-[140px] w-[220px] overflow-hidden rounded-2xl bg-app-surface">
              {festival.coverImageUrl ? (
                <img src={festival.coverImageUrl} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
              ) : (
                <GeneratedPoster title={festival.name} />
              )}
            </span>
            <span className="mt-1.5 block font-mono text-[11px] font-semibold text-app-accent">
              {festivalDateRange(festival)} · {festival.city.toUpperCase()}
            </span>
            <span className="block truncate font-display text-[15px] font-bold">{festival.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

export default FestivalsSection;

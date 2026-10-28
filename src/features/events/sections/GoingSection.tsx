import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import { fetchEventCards } from '../../../data/eventQueries';
import { useQuery } from '../../../shared/hooks/useQuery';
import EventPosterTile from '../components/EventPosterTile';
import { getEventCoverImage } from '../utils';
import { EventListItem } from '../types';

type GoingSectionProps = { userId: string | null };

type Plan = { event: EventListItem; going: boolean };

const EMPTY: Plan[] = [];

// "Voy": the concerts the user said they are going to, then the ones they
// saved, soonest first. Hidden while there are none.
const GoingSection: React.FC<GoingSectionProps> = ({ userId }) => {
  const navigate = useNavigate();
  // Tonight's concert stays listed for a few hours after doors.
  const fromIso = useMemo(() => new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), []);

  const { data } = useQuery<Plan[]>(
    ['home:going', userId ?? ''],
    async () => {
      if (!userId) return EMPTY;
      const [going, saved] = await Promise.all([
        supabase.from('event_attendance').select('event_id').eq('profile_id', userId).eq('status', 'going'),
        supabase.from('event_saves').select('event_id').eq('profile_id', userId),
      ]);
      if (going.error) throw going.error;
      if (saved.error) throw saved.error;
      const goingIds = new Set((going.data || []).map((row: any) => String(row.event_id)));
      const ids = [...new Set([...goingIds, ...(saved.data || []).map((row: any) => String(row.event_id))])];
      const events = await fetchEventCards({ eventIds: ids, startIso: fromIso });
      return events.map(event => ({ event, going: goingIds.has(event.id) }));
    },
    { enabled: Boolean(userId), ttlMs: 10_000, initialData: EMPTY },
  );

  const plans = data || EMPTY;
  if (!userId || plans.length === 0) return null;

  return (
    <section aria-labelledby="voy" className="flex flex-col gap-3 px-4 pt-[22px]">
      <h2 id="voy" className="font-display text-2xl font-bold text-app-ink">
        Voy
      </h2>
      <div className="-mr-4 flex gap-3 overflow-x-auto pr-4">
        {plans.map(({ event, going }) => (
          <EventPosterTile
            key={event.id}
            className="w-[140px] shrink-0"
            event={{ ...event, cover_image_url: getEventCoverImage(event) }}
            badge={going ? 'Voy' : 'Guardado'}
            onSelect={selected => navigate(`/event/${selected.id}`)}
          />
        ))}
      </div>
    </section>
  );
};

export default GoingSection;

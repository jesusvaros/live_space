import React from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { EventListItem } from '../types';
import { formatDate, getEventCoverImage, getPrimaryArtistName } from '../utils';
import EventPosterTile from '../../../components/EventPosterTile';

type TrendingSectionProps = {
  loading: boolean;
  trending: EventListItem[];
  meta: Record<string, { saves: number; going: number; attended: number; moments: number }>;
};

const TrendingSection: React.FC<TrendingSectionProps> = ({ loading, trending, meta }) => {
  const history = useHistory();

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Trending</p>
          <h3 className="mt-2 font-display text-xl text-slate-50">Trending this week</h3>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
          onClick={() => history.push('/tabs/map')}
        >
          Explore
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <IonSpinner name="crescent" />
        </div>
      ) : trending.length === 0 ? (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
          <p className="text-sm text-slate-200">No trending events yet</p>
          <p className="mt-1 text-xs text-slate-500">Check the map to discover what people are going to.</p>
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {trending.map(event => {
            const stats = meta[event.id];
            const parts = [
              stats?.saves ? `${stats.saves} likes` : null,
              stats?.going ? `${stats.going} going` : null,
              stats?.attended ? `${stats.attended} attended` : null,
              stats?.moments ? `${stats.moments} moments` : null,
            ].filter(Boolean) as string[];
            const badge = parts.slice(0, 2).join(' · ');
            return (
              <EventPosterTile
                key={event.id}
                event={{ ...event, cover_image_url: getEventCoverImage(event) }}
                className="w-[220px] shrink-0"
                kicker={formatDate(event.starts_at)}
                title={getPrimaryArtistName(event)}
                subtitle={event.venue_place?.name || event.city}
                badge={badge || undefined}
                onSelect={selected => history.push(`/event/${selected.id}`)}
              />
            );
          })}
        </div>
      )}
    </section>
  );
};

export default TrendingSection;

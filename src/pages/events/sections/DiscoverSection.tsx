import React from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';

type SuggestedArtist = {
  id: string;
  subject_id: string;
  name: string;
  avatar_url: string | null;
  upcomingCount: number;
};

type SuggestedVenue = {
  id: string;
  subject_id: string;
  name: string;
  city: string;
  upcomingCount: number;
};

type DiscoverSectionProps = {
  loading: boolean;
  canFollow: boolean;
  followedSubjectIds: Set<string>;
  suggestedArtists: SuggestedArtist[];
  suggestedVenues: SuggestedVenue[];
  onToggleFollowSubject: (subjectId: string) => void;
};

const DiscoverSection: React.FC<DiscoverSectionProps> = ({
  loading,
  canFollow,
  followedSubjectIds,
  suggestedArtists,
  suggestedVenues,
  onToggleFollowSubject,
}) => {
  const history = useHistory();

  return (
    <section className="space-y-6">
      <div>
        <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">Discover</p>
        <h3 className="mt-2 font-display text-xl text-slate-50">Discover artists & venues</h3>
        <p className="mt-1 text-sm text-slate-500">Follow to keep these shows on your radar.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <IonSpinner name="crescent" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Suggested Artists</p>
              <button
                type="button"
                className="text-xs font-semibold text-[#ffd1c4]"
                onClick={() => history.push('/tabs/discover', { initialTab: 'artists' })}
              >
                Explore
              </button>
            </div>
            {suggestedArtists.length === 0 ? (
              <p className="text-sm text-slate-500">No artist suggestions yet.</p>
            ) : (
              <div className="space-y-3">
                {suggestedArtists.slice(0, 6).map(artist => {
                  const isFollowing = followedSubjectIds.has(artist.subject_id);
                  return (
                    <div
                      key={artist.id}
                      className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#141824] p-4 shadow-[0_20px_44px_rgba(0,0,0,0.45)]"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => history.push(`/artist/${artist.id}`)}
                      >
                        <div className="h-11 w-11 shrink-0 overflow-hidden rounded-2xl bg-white/5">
                          {artist.avatar_url ? (
                            <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.25),rgba(255,255,255,0.04))]" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-50 line-clamp-1">{artist.name}</p>
                          <p className="text-xs text-slate-500">{artist.upcomingCount} upcoming</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`shrink-0 rounded-2xl px-3 py-1.5 text-xs font-semibold ${
                          isFollowing ? 'border border-white/10 bg-white/5 text-slate-100' : 'bg-[#ff6b4a] text-white'
                        }`}
                        onClick={() => onToggleFollowSubject(artist.subject_id)}
                        disabled={!canFollow}
                      >
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-slate-200">Suggested Venues</p>
              <button
                type="button"
                className="text-xs font-semibold text-[#ffd1c4]"
                onClick={() => history.push('/tabs/discover', { initialTab: 'venues' })}
              >
                Explore
              </button>
            </div>
            {suggestedVenues.length === 0 ? (
              <p className="text-sm text-slate-500">No venue suggestions yet.</p>
            ) : (
              <div className="space-y-3">
                {suggestedVenues.slice(0, 6).map(venue => {
                  const isFollowing = followedSubjectIds.has(venue.subject_id);
                  return (
                    <div
                      key={venue.id}
                      className="flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-[#141824] p-4 shadow-[0_20px_44px_rgba(0,0,0,0.45)]"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => history.push(`/venue/${venue.id}`)}
                      >
                        <p className="font-semibold text-slate-50 line-clamp-1">{venue.name}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {venue.city} · {venue.upcomingCount} upcoming
                        </p>
                      </button>
                      <button
                        type="button"
                        className={`shrink-0 rounded-2xl px-3 py-1.5 text-xs font-semibold ${
                          isFollowing ? 'border border-white/10 bg-white/5 text-slate-100' : 'bg-[#ff6b4a] text-white'
                        }`}
                        onClick={() => onToggleFollowSubject(venue.subject_id)}
                        disabled={!canFollow}
                      >
                        {isFollowing ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default DiscoverSection;

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
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Discover</p>
        <h3 className="mt-2 font-display text-xl font-bold text-white">Artists & venues</h3>
        <p className="mt-1 text-sm text-white/55">Follow to keep them close.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <IonSpinner name="crescent" />
        </div>
      ) : (
        <div className="space-y-6">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Artists</p>
              <button
                type="button"
                className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 hover:text-white"
                onClick={() => history.push('/tabs/discover', { initialTab: 'artists' })}
              >
                Explore
              </button>
            </div>
            {suggestedArtists.length === 0 ? (
              <p className="text-sm text-white/55">No suggestions yet.</p>
            ) : (
              <div className="space-y-2">
                {suggestedArtists.slice(0, 6).map(artist => {
                  const isFollowing = followedSubjectIds.has(artist.subject_id);
                  return (
                    <div
                      key={artist.id}
                      className="flex items-center justify-between gap-4 py-2"
                    >
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-3 text-left"
                        onClick={() => history.push(`/artist/${artist.id}`)}
                      >
                        <div className="h-14 w-14 shrink-0 overflow-hidden bg-white/5">
                          {artist.avatar_url ? (
                            <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full bg-white/10" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="font-display text-base font-bold text-white line-clamp-1">{artist.name}</p>
                          <p className="text-xs text-white/55">{artist.upcomingCount} upcoming</p>
                        </div>
                      </button>
                      <button
                        type="button"
                        className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60 ${
                          isFollowing ? 'bg-white/10 text-white/80' : 'bg-[#ff6b4a] text-white'
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
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Venues</p>
              <button
                type="button"
                className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/70 hover:text-white"
                onClick={() => history.push('/tabs/discover', { initialTab: 'venues' })}
              >
                Explore
              </button>
            </div>
            {suggestedVenues.length === 0 ? (
              <p className="text-sm text-white/55">No suggestions yet.</p>
            ) : (
              <div className="space-y-2">
                {suggestedVenues.slice(0, 6).map(venue => {
                  const isFollowing = followedSubjectIds.has(venue.subject_id);
                  return (
                    <div
                      key={venue.id}
                      className="flex items-center justify-between gap-4 py-2"
                    >
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => history.push(`/venue/${venue.id}`)}
                      >
                        <p className="font-display text-base font-bold text-white line-clamp-1">{venue.name}</p>
                        <p className="mt-1 text-xs text-white/55">
                          {venue.city} · {venue.upcomingCount} upcoming
                        </p>
                      </button>
                      <button
                        type="button"
                        className={`shrink-0 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] disabled:opacity-60 ${
                          isFollowing ? 'bg-white/10 text-white/80' : 'bg-[#ff6b4a] text-white'
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

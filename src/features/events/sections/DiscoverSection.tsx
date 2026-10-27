import React from 'react';
import { Spinner } from '../../../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../../components/ui/Avatar';

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
  city?: string;
  followedSubjectIds: Set<string>;
  suggestedArtists: SuggestedArtist[];
  suggestedVenues: SuggestedVenue[];
  onToggleFollowSubject: (subjectId: string) => void;
};

const DiscoverSection: React.FC<DiscoverSectionProps> = ({
  loading,
  canFollow,
  city,
  followedSubjectIds,
  suggestedArtists,
  suggestedVenues,
  onToggleFollowSubject,
}) => {
  const navigate = useNavigate();
  const follow = (subjectId: string) => (canFollow ? onToggleFollowSubject(subjectId) : navigate('/welcome'));
  const venues = suggestedVenues.filter(venue => !city || venue.city?.toLowerCase() === city.toLowerCase());

  if (loading) {
    return (
      <div className="flex items-center justify-center py-6">
        <Spinner />
      </div>
    );
  }

  return (
    <>
      {suggestedArtists.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-white">Artistas que tocan pronto</h2>
            <button
              type="button"
              className="min-h-11 shrink-0 text-sm font-semibold text-app-accent"
              onClick={() => navigate('/tabs/discover', { state: { initialTab: 'artists' } })}
            >
              Ver todos
            </button>
          </div>
          <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1">
            {suggestedArtists.slice(0, 12).map(artist => {
              const isFollowing = followedSubjectIds.has(artist.subject_id);
              return (
                <div key={artist.id} className="flex w-[104px] shrink-0 flex-col items-center text-center">
                  <button type="button" onClick={() => navigate(`/artist/${artist.id}`)} className="flex flex-col items-center">
                    <Avatar name={artist.name} src={artist.avatar_url} className="h-[88px] w-[88px] text-[26px]" />
                    <p className="mt-2 w-full text-[13px] font-semibold leading-tight text-white line-clamp-2">{artist.name}</p>
                    <p className="mt-0.5 text-[12px] text-white/50">
                      {artist.upcomingCount} {artist.upcomingCount === 1 ? 'concierto' : 'conciertos'}
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => follow(artist.subject_id)}
                    className={`mt-2 min-h-9 rounded-full px-3.5 text-[12px] font-semibold ${
                      isFollowing ? 'border border-app-line text-white/70' : 'bg-app-ink text-app-bg'
                    }`}
                  >
                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {venues.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h2 className="font-display text-xl font-bold text-white">Salas de {city}</h2>
            <button
              type="button"
              className="min-h-11 shrink-0 text-sm font-semibold text-app-accent"
              onClick={() => navigate('/tabs/discover', { state: { initialTab: 'venues' } })}
            >
              Ver todas
            </button>
          </div>
          <ul className="divide-y divide-app-line rounded-2xl border border-app-line bg-app-surface">
            {venues.slice(0, 5).map(venue => {
              const isFollowing = followedSubjectIds.has(venue.subject_id);
              return (
                <li key={venue.id} className="flex items-center gap-3 px-3 py-2">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 items-center gap-3 text-left"
                    onClick={() => navigate(`/venue/${venue.id}`)}
                  >
                    <Avatar name={venue.name} rounded="xl" className="h-11 w-11 text-[15px]" />
                    <div className="min-w-0">
                      <p className="font-display text-[15px] font-bold text-white line-clamp-1">{venue.name}</p>
                      <p className="text-[12px] text-white/55">
                        {venue.upcomingCount} {venue.upcomingCount === 1 ? 'concierto' : 'conciertos'}
                      </p>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => follow(venue.subject_id)}
                    className={`min-h-9 shrink-0 rounded-full px-3.5 text-[12px] font-semibold ${
                      isFollowing ? 'border border-app-line text-white/70' : 'bg-app-ink text-app-bg'
                    }`}
                  >
                    {isFollowing ? 'Siguiendo' : 'Seguir'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
};

export default DiscoverSection;

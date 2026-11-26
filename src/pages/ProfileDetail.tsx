import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, PostWithSetlist, Artist } from '../lib/types';
import { friendsService, groupByEvent, type Relation } from '../services/friends.service';
import Avatar from '../components/ui/Avatar';
import FollowPersonButton from '../features/friends/FollowPersonButton';
import { getEventCoverImage } from '../features/events/utils';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import EventPosterTile from '../features/events/components/EventPosterTile';
import MomentsByConcert from '../features/profile/MomentsByConcert';
import PhotoStatsRow from '../features/people/PhotoStatsRow';
import type { EventListItem } from '../features/events/types';
import { mapProfile } from '../data/canonicalMappers';
import { fetchEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import BlockUserButton from '../features/blocks/BlockUserButton';
import { blockTargetLabel } from '../features/blocks/blocking';
import { useBlockedUserIds } from '../features/blocks/useBlockedUsers';
import { useOwnPostPublished } from '../features/moments/livePosts';
import { usePullToRefresh } from '../shared/pullToRefresh/usePullToRefresh';
import PullToRefreshIndicator from '../shared/pullToRefresh/PullToRefreshIndicator';

type ProfileEvent = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const ProfileDetail: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const { user, profile: currentUserProfile } = useAuth();
  
  const [profile, setProfile] = useState<Profile | null>(null);
  const [venuePlaces, setVenuePlaces] = useState<VenuePlace[]>([]);
  const [events, setEvents] = useState<ProfileEvent[]>([]);
  const [moments, setMoments] = useState<PostWithSetlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  const [relation, setRelation] = useState<Relation>({ iFollow: false, followsMe: false });
  const [plans, setPlans] = useState<EventListItem[]>([]);
  const blocked = useBlockedUserIds();
  const isBlocked = Boolean(profile && blocked.has(profile.id));

  // `silent`: a refresh (pull to refresh, their new upload) keeps the page
  // on screen, and a failure keeps what is shown.
  const loadProfile = async (silent = false) => {
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const { data: subjectData, error: profileError } = await supabase
        .from('subjects')
        .select('id, profile:profiles!subjects_profile_id_fkey(*)')
        .eq('profile_id', id)
        .single();
      
      const profileRow = Array.isArray(subjectData?.profile)
        ? subjectData.profile[0]
        : subjectData?.profile;
      if (profileError || !profileRow) {
        throw profileError;
      }

      const profileData = mapProfile({ ...profileRow, subject_id: subjectData.id });
      setProfile(profileData);

      if (profileData.subject_id && user && currentUserProfile?.subject_id && profileData.id !== user.id) {
        const current = await friendsService.relation(currentUserProfile.subject_id, profileData.subject_id);
        setRelation(current);
      }

      const authoredMoments = await fetchPostCards({ authorId: profileData.id, from: 0, to: 59 });
      const eventIds = [...new Set(authoredMoments.map(moment => moment.event_id))];
      setMoments(authoredMoments as PostWithSetlist[]);
      setEvents((await fetchEventCards({ eventIds })) as ProfileEvent[]);
      setVenuePlaces([]);
    } catch (err) {
      if (!silent) setError('Perfil no encontrado.');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void loadProfile();
  }, [id, user, currentUserProfile?.subject_id]);
  useOwnPostPublished(post => {
    if (post.authorId === id) void loadProfile(true);
  });
  const contentRef = useRef<HTMLElement | null>(null);
  const pull = usePullToRefresh(contentRef, () => loadProfile(true));

  // Their upcoming concerts once you follow them (and only if they share
  // them): reloads right after tapping «Seguir» / «Siguiendo».
  const profileId = profile?.id ?? null;
  const iFollow = relation.iFollow;
  useEffect(() => {
    if (!profileId || !user || profileId === user.id || !iFollow) {
      setPlans([]);
      return undefined;
    }
    let live = true;
    friendsService
      .going({ friendId: profileId })
      .catch(() => [])
      .then(async rows => {
        const groups = groupByEvent(rows);
        const cards = groups.length ? await fetchEventCards({ eventIds: groups.map(group => group.eventId) }) : [];
        if (live) setPlans(cards);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [profileId, user, iFollow]);

  const eventCards = useMemo(() => new Map(events.map(event => [event.id, event as EventListItem])), [events]);

  const externalLinks = useMemo(() => {
    const links = (profile?.external_links || {}) as Record<string, string>;
    return Object.entries(links)
      .map(([key, value]) => ({ key, value }))
      .filter(link => Boolean(link.value));
  }, [profile]);

  return (
    <AppShell contentRef={contentRef}>
      <PullToRefreshIndicator {...pull} />
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && profile && (
        <>
          {/* A person: round face, name, @usuario and the follow button. */}
          <header className="flex items-center gap-4 px-4 pt-4">
            <Avatar
              name={profile.display_name || profile.username || 'Perfil'}
              src={profile.avatar_url}
              className="h-[72px] w-[72px] text-[24px]"
            />
            <div className="min-w-0 flex-1">
              <h1 className="truncate font-display text-[24px] font-bold leading-tight text-app-ink">
                {profile.display_name || profile.username || 'Desconocido'}
              </h1>
              {profile.username ? <p className="truncate text-sm text-white/55">@{profile.username}</p> : null}
              {relation.followsMe && !relation.iFollow ? <p className="text-[12px] text-white/45">Te sigue</p> : null}
            </div>
            {user && profile.id !== user.id && currentUserProfile?.subject_id && profile.subject_id ? (
              <FollowPersonButton
                mySubjectId={currentUserProfile.subject_id}
                theirSubjectId={profile.subject_id}
                relation={relation}
                onChange={setRelation}
              />
            ) : null}
            {!user ? (
              <button
                type="button"
                onClick={() => navigate('/welcome')}
                className="inline-flex min-h-10 items-center rounded-full bg-app-ink px-4 text-[13px] font-semibold text-app-bg"
              >
                Seguir
              </button>
            ) : null}
          </header>
          <PhotoStatsRow profileId={profile.id} className="px-4 pt-4" />

          {plans.length ? (
            <section aria-label="Sus planes" className="px-4 pt-6">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-white/45">Va a</p>
              <div className="-mr-4 mt-3 flex gap-3 overflow-x-auto pr-4 pt-1">
                {plans.map(event => (
                  <EventPosterTile
                    key={event.id}
                    className="w-[130px] shrink-0"
                    event={{ ...event, cover_image_url: getEventCoverImage(event) }}
                    onSelect={selected => navigate(`/event/${selected.id}`)}
                  />
                ))}
              </div>
            </section>
          ) : null}

              <div className="flex flex-col gap-8 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
                {isBlocked ? (
                  <p className="rounded-2xl border border-app-line bg-app-surface p-4 text-sm text-white/70">
                    Has bloqueado a {blockTargetLabel(profile)}. No ves sus momentos y no ve los tuyos.
                  </p>
                ) : null}
                {profile.bio && <p className="text-sm text-white/70">{profile.bio}</p>}

                {externalLinks.length > 0 && (
                  <section className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Enlaces</p>
                    <div className="space-y-2 text-sm">
                      {externalLinks.map(link => (
                        <a
                          key={link.key}
                          href={link.value}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-white/70 hover:text-white"
                        >
                          {link.value.replace(/^https?:\/\//, '')}
                        </a>
                      ))}
                    </div>
                  </section>
                )}

                {profile.role === 'venue' && venuePlaces.length > 0 && (
                  <section className="space-y-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Salas</p>
                    <div className="space-y-6">
                      {venuePlaces.map(venue => (
                        <div key={venue.id} className="space-y-2">
                          <div>
                            <p className="font-display text-lg font-bold text-white">{venue.name}</p>
                            <p className="text-sm text-white/70">{venue.address || venue.city}</p>
                            {(venue.venue_type || venue.capacity) && (
                              <p className="text-xs text-white/55">
                                {venue.venue_type || 'Sala'}{venue.capacity ? ` · aforo ${venue.capacity}` : ''}
                              </p>
                            )}
                          </div>
                          {venue.website_url && (
                            <a
                              href={venue.website_url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 hover:text-white"
                            >
                              {venue.website_url.replace(/^https?:\/\//, '')}
                            </a>
                          )}
                          {(venue.photos || []).length > 0 && (
                            <div className="-mx-4 flex gap-2 overflow-x-auto pb-1">
                              {venue.photos.slice(0, 8).map((url, index) => (
                                <div key={`${url}-${index}`} className="h-28 w-44 flex-shrink-0 overflow-hidden bg-white/5">
                                  <img src={url} alt="Sala" className="h-full w-full object-cover" />
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Eventos</p>
                    <p className="mt-1 text-sm text-white/55">Conciertos vinculados a este perfil.</p>
                  </div>
                  {events.length === 0 ? (
                    <p className="text-sm text-white/55">Aún no hay eventos.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {events.map(event => (
                        <EventPosterTile
                          key={event.id}
                          event={event}
                          className="w-full"
                          onSelect={selected => navigate(`/event/${selected.id}`)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {isBlocked ? null : <section className="space-y-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Momentos</p>
                    <p className="mt-1 text-sm text-white/55">Lo que ha subido, concierto a concierto.</p>
                  </div>
                  {moments.length === 0 ? (
                    <p className="text-sm text-white/55">Aún no hay momentos.</p>
                  ) : (
                    <div className="-mx-4">
                      <MomentsByConcert moments={moments} cards={eventCards} />
                    </div>
                  )}
                </section>}

                <BlockUserButton profileId={profile.id} label={blockTargetLabel(profile)} />

                <button
                  type="button"
                  className="bg-white/10 px-4 py-3 text-sm font-semibold text-white"
                  onClick={() => navigate(-1)}
                >
                  Volver
                </button>
              </div>
            </>
          )}
    </AppShell>
  );
};

export default ProfileDetail;

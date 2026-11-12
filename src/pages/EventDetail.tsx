import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DetailSkeleton } from '../components/ui/AppPrimitives';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, Profile, VenuePlace, EventSetlistEntry, Artist } from '../lib/types';
import { eventService } from '../services/event.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import { NAV_CLEARANCE } from '../components/BottomNav';
import ShareSheet from '../components/ShareSheet';
import { IconBookmark, IconBookmarkFilled, IconPlus, IconShare } from '../components/icons';
import DetailHeader from '../components/ui/DetailHeader';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { fetchEventCardById } from '../data/eventQueries';
import { eventCacheKey, readCache } from '../data/pageCache';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import { useEventUploads } from '../media/useUploadQueue';
import SetlistAttribution from '../components/event/SetlistAttribution';
import SetlistProposalAction from '../features/setlist/SetlistProposalAction';
import SetlistCredit from '../features/setlist/SetlistCredit';
import { enableMomentNudges } from '../features/moments/momentNudge';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { EventStatsCard, VenueFeedbackPrompt } from '../features/community';
import { festivalService } from '../services/festival.service';
import EventMerchSection from '../features/merch/EventMerchSection';
import AttendanceSuggestion from '../features/events/AttendanceSuggestion';
import EventUploadButton from '../features/events/EventUploadButton';
import { useEventUploadBar } from '../features/events/useEventUploadBar';
import ConcertPlayer, { type SeekRequest } from '../features/moments/ConcertPlayer';
import { useConcertMoments, useConcertTimeline } from '../features/moments/useConcertTimeline';
import type { Clip, TimelineMoment } from '../features/moments/concertTimeline';
import { useFirstContent } from '../lib/perfTiming';
import EventHero from '../features/events/EventHero';
import EventPhotos from '../features/photos/EventPhotos';
import { useHiddenPostIds } from '../features/photos/postCollections';
import { withoutHidden } from '../features/photos/photoAlbums';
import { heroParallaxOffset, stageIsMostlyVisible } from '../features/moments/stageParallax';

// Bottom of the screen, from the edge up: the app's floating nav (about 72 px
// over the safe area), then this page's action bar (about 60 px) right above
// it. Whatever sits at the bottom of the page clears both, or just the nav
// when there is no action bar.
const ACTION_BAR_BOTTOM = 'bottom-[calc(76px+env(safe-area-inset-bottom,0px))]';
const CLEAR_NAV = 'calc(84px + env(safe-area-inset-bottom, 0px))';
const CLEAR_NAV_AND_BAR = 'calc(146px + env(safe-area-inset-bottom, 0px))';

type EventDetailData = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

const pad = (value: number) => value.toString().padStart(2, '0');

const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();

const dayWord = (date: Date) => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(date, today)) return 'Hoy';
  if (sameDay(date, yesterday)) return 'Ayer';
  if (sameDay(date, tomorrow)) return 'Mañana';
  return null;
};

const kickerDate = (date: Date) => {
  const full = date
    .toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })
    .replace(/[.,]/g, '');
  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  return [dayWord(date), full, time].filter(Boolean).join(' · ').toUpperCase();
};

const thumbOf = (moment: TimelineMoment) =>
  moment.thumbnailUrl || (moment.mediaType === 'image' ? moment.mediaUrl : null);

const EventDetail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // Just published to a concert we recognised from their photos (Upload).
  const suggestAttendance = Boolean((location.state as { suggestAttendance?: boolean } | null)?.suggestAttendance);
  const id = useRouteEntityId() || '';
  const { user } = useAuth();
  // This concert's uploads show in its bottom button, not in the top pill.
  const eventUploads = useEventUploads(id);
  const uploadBar = useEventUploadBar(id, user?.id ?? null);
  const { isFollowing } = useFollowedSubjects();
  const [event, setEvent] = useState<EventDetailData | null>(() => readCache<EventDetailData>(eventCacheKey(id)) ?? null);
  const [festival, setFestival] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(() => !readCache(eventCacheKey(id)));
  const [error, setError] = useState('');
  const [setlist, setSetlist] = useState<EventSetlistEntry[]>([]);
  const [seekRequest, setSeekRequest] = useState<SeekRequest>(null);
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<'going' | 'attended' | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [engagementError, setEngagementError] = useState('');
  const contentRef = useRef<HTMLElement | null>(null);
  const { moments: loadedMoments, loading: momentsLoading, error: momentsError, removeMoment } = useConcertMoments(id);
  // What this viewer hid («Ocultar» on a photo) leaves the player and the albums.
  const hiddenIds = useHiddenPostIds();
  const moments = useMemo(() => withoutHidden(loadedMoments, hiddenIds, moment => moment.id), [loadedMoments, hiddenIds]);
  const heroRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLElement | null>(null);
  const [stageInView, setStageInView] = useState(false);
  const [pageVisible, setPageVisible] = useState(() => typeof document === 'undefined' || document.visibilityState !== 'hidden');
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  useFirstContent('concert', Boolean(event));
  const currentIdRef = useRef(id);
  currentIdRef.current = id;

  const scrollToTop = () => {
    document.querySelector<HTMLElement>('.event-detail-content')?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const reloadSetlist = () => {
    const requestedId = id;
    eventService
      .getEventSetlist(id)
      .then(entries => {
        if (currentIdRef.current === requestedId) setSetlist(entries);
      })
      .catch(() => undefined);
  };

  const loadEvent = async () => {
    // A concert listed on the previous screen paints at once; the fetch below
    // only refreshes it.
    const cached = readCache<EventDetailData>(eventCacheKey(id));
    setEvent(cached ?? null);
    setLoading(!cached);
    setError('');

    // The setlist only needs the id: asked for alongside the concert and
    // shown when it arrives, whichever answers first.
    reloadSetlist();
    try {
      const data = await fetchEventCardById(id);

      if (!data) {
        setError('No encontramos este evento.');
        setEvent(null);
        return;
      }

      setEvent(data as EventDetailData);
      setLoading(false);
    } catch (err) {
      // Offline with a cached copy: keep showing it.
      if (!cached) {
        setError('No se ha podido cargar este evento. Revisa tu conexión.');
        setEvent(null);
      }
    } finally {
      setLoading(false);
    }
  };

  // A festival set links back to its festival.
  useEffect(() => {
    if (!event?.festival_id) {
      setFestival(null);
      return undefined;
    }
    let cancelled = false;
    festivalService.forEvent(event.id).then(next => {
      if (!cancelled) setFestival(next);
    });
    return () => {
      cancelled = true;
    };
  }, [event?.id, event?.festival_id]);

  useEffect(() => {
    setSetlist([]);
    setSeekRequest(null);
    loadEvent();
    window.setTimeout(scrollToTop, 0);
  }, [id]);

  useEffect(() => {
    const loadEngagement = async () => {
      if (!user || !id) {
        setFollowed(false);
        setAttendanceStatus(null);
        return;
      }

      try {
        const [{ data: saveData }, { data: attendanceData }] = await Promise.all([
          supabase
            .from('event_saves')
            .select('event_id')
            .eq('event_id', id)
            .eq('profile_id', user.id)
            .limit(1),
          supabase
            .from('event_attendance')
            .select('status')
            .eq('event_id', id)
            .eq('profile_id', user.id)
            .limit(1),
        ]);

        setFollowed(Boolean(saveData && saveData.length > 0));
        setAttendanceStatus((attendanceData?.[0]?.status as 'going' | 'attended') ?? null);
      } catch {
        setFollowed(false);
        setAttendanceStatus(null);
      }
    };

    loadEngagement();
  }, [user, id]);

  const artists = useMemo(
    () => (event?.event_artists || []).map(entry => entry.artist).filter((artist): artist is Artist => Boolean(artist)),
    [event],
  );

  const heroTitle = useMemo(() => {
    if (!event) return 'Evento';
    if (artists[0]) return artists[0].name;
    const organizerName =
      event.organizer && event.organizer.role !== 'venue'
        ? (event.organizer.display_name || event.organizer.username)
        : null;
    return organizerName || event.name;
  }, [artists, event]);

  // "Morat - YEM World Tour" under a "Morat" title reads as "YEM World Tour".
  const tourName = useMemo(() => {
    if (!event) return '';
    const name = event.name.trim();
    if (name.toLowerCase() === heroTitle.toLowerCase()) return '';
    if (name.toLowerCase().startsWith(heroTitle.toLowerCase())) {
      return name.slice(heroTitle.length).replace(/^[\s\-–—:·|,]+/, '');
    }
    return name;
  }, [event, heroTitle]);

  const eventStart = useMemo(() => (event ? new Date(event.starts_at) : null), [event]);
  const eventEnd = useMemo(() => (event?.ends_at ? new Date(event.ends_at) : null), [event]);

  const { timeline, reportDuration } = useConcertTimeline({
    moments,
    setlist,
    startsAt: event?.starts_at ?? null,
    endsAt: event?.ends_at ?? null,
    currentUserId: user?.id ?? null,
  });

  // Clips per setlist song, in concert order (tapping a song plays its first).
  const clipsBySong = useMemo(() => {
    const map = new Map<string, Clip[]>();
    for (const clip of timeline?.clips || []) {
      const songId = clip.moment.songId;
      if (!songId) continue;
      map.set(songId, [...(map.get(songId) || []), clip]);
    }
    return map;
  }, [timeline]);

  const hasStage = Boolean(timeline && timeline.clips.length > 0);

  // The stage is exactly one screen of the page's scroller tall.
  useEffect(() => {
    const scroller = contentRef.current;
    if (!scroller) return undefined;
    const measure = () => setViewportHeight(scroller.clientHeight || null);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  // Plays only while most of the stage is on screen.
  useEffect(() => {
    const scroller = contentRef.current;
    const stage = stageRef.current;
    if (!hasStage || !scroller || !stage || typeof IntersectionObserver === 'undefined') {
      setStageInView(false);
      return undefined;
    }
    const observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) setStageInView(stageIsMostlyVisible(entry.intersectionRatio));
      },
      { root: scroller, threshold: [0, 0.3, 0.6, 0.9, 1] },
    );
    observer.observe(stage);
    return () => observer.disconnect();
  }, [hasStage, event?.id, loading]);

  // …and while the app is in front.
  useEffect(() => {
    const onVisibility = () => setPageVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  // Half-speed hero while the stage slides over it.
  useEffect(() => {
    const scroller = contentRef.current;
    const hero = heroRef.current;
    if (!hasStage || !scroller || !hero) return undefined;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let last = -1;
    const update = () => {
      frame = 0;
      const offset = heroParallaxOffset(scroller.scrollTop, hero.offsetHeight, { reducedMotion: Boolean(reduced?.matches) });
      if (offset === last) return;
      last = offset;
      hero.style.transform = offset ? `translate3d(0, ${offset}px, 0)` : '';
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    reduced?.addEventListener?.('change', update);
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      reduced?.removeEventListener?.('change', update);
      if (frame) cancelAnimationFrame(frame);
      hero.style.transform = '';
    };
  }, [hasStage, event?.id, loading]);

  const scrollToStage = () => {
    const stage = stageRef.current;
    if (!stage) return;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    contentRef.current?.scrollTo({ top: stage.offsetTop, behavior: reduced ? 'auto' : 'smooth' });
  };

  const playClip = (clip: Clip) => {
    setSeekRequest({ clipId: clip.id, nonce: Date.now() });
    scrollToStage();
  };

  const onActiveSongChange = useCallback((songId: string | null) => setPlayingSongId(songId), []);

  const openUpload = (songOrdinal?: number) => {
    if (!user) {
      navigate('/welcome');
      return;
    }
    const params = new URLSearchParams({ event: id });
    if (songOrdinal) params.set('song', String(songOrdinal));
    navigate(`/tabs/upload?${params.toString()}`);
  };

  const toggleFollow = async () => {
    if (!user || !event) return;
    setEngagementError('');
    setFollowLoading(true);
    try {
      if (followed) {
        const { error: deleteError } = await supabase
          .from('event_saves')
          .delete()
          .eq('event_id', event.id)
          .eq('profile_id', user.id);
        if (deleteError) throw deleteError;
        setFollowed(false);
      } else {
        const { error: insertError } = await supabase
          .from('event_saves')
          .insert({
            event_id: event.id,
            profile_id: user.id,
          });
        if (insertError) throw insertError;
        setFollowed(true);
        // Morning-after "¿Subes lo de anoche?" for saved concerts.
        void enableMomentNudges(user.id);
      }
    } catch (err: any) {
      setEngagementError(err?.message || 'No se ha podido actualizar el seguimiento.');
    } finally {
      setFollowLoading(false);
    }
  };

  const updateAttendance = async (status: 'going' | 'attended') => {
    if (!user || !event) return false;
    setEngagementError('');
    setAttendanceLoading(true);
    try {
      if (attendanceStatus === status) {
        const { error: deleteError } = await supabase
          .from('event_attendance')
          .delete()
          .eq('event_id', event.id)
          .eq('profile_id', user.id);
        if (deleteError) throw deleteError;
        setAttendanceStatus(null);
        return true;
      }

      const { error: upsertError } = await supabase
        .from('event_attendance')
        .upsert(
          {
            event_id: event.id,
            profile_id: user.id,
            status,
          },
          { onConflict: 'event_id,profile_id' }
        );
      if (upsertError) throw upsertError;
      setAttendanceStatus(status);
      if (status === 'going') void enableMomentNudges(user.id);
      return true;
    } catch (err: any) {
      setEngagementError(err?.message || 'No se ha podido actualizar la asistencia.');
      return false;
    } finally {
      setAttendanceLoading(false);
    }
  };

  // Merch is reserved by people going to the concert: «Voy» inline.
  const markGoingForMerch = () => (attendanceStatus ? Promise.resolve(true) : updateAttendance('going'));

  // Public link only: the QR upload token must never travel in a shared URL.
  const shareUrl = event ? `${window.location.origin}/event/${event.id}` : '';
  const now = new Date();
  const hasStarted = eventStart ? now >= eventStart : false;
  const isPastEvent = eventStart
    ? eventEnd
      ? now > eventEnd
      : now.getTime() > eventStart.getTime() + 6 * 60 * 60 * 1000
    : false;
  // After the concert, with something to show: the song-by-song view.
  const lived = hasStarted && (setlist.length > 0 || moments.length > 0);
  const attendanceTarget: 'going' | 'attended' = isPastEvent ? 'attended' : 'going';
  const attendanceActive = attendanceStatus === attendanceTarget;
  // After the concert the bottom bar is only «Sube lo que grabaste» (or its
  // progress / Reintentar): gone for someone who already uploaded here.
  const uploadMode = isPastEvent || lived;
  const showBottomBar = !uploadMode || uploadBar.visible;
  const bottomClearance = showBottomBar ? CLEAR_NAV_AND_BAR : CLEAR_NAV;
  const pagePadding = showBottomBar ? 'pb-[calc(156px+env(safe-area-inset-bottom,0px))]' : NAV_CLEARANCE;

  const handleFollowClick = () => {
    if (!user) {
      navigate('/welcome');
      return;
    }
    toggleFollow();
  };

  const handleAttendanceClick = () => {
    if (!user) {
      navigate('/welcome');
      return;
    }
    updateAttendance(attendanceTarget);
  };

  const venue = event?.venue_place || null;
  const shareButton = (
    <button
      type="button"
      aria-label="Compartir"
      className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md"
      onClick={() => setShowShare(true)}
    >
      <IconShare size={19} />
    </button>
  );

  const stageChip = eventStart ? (
    <span className="block truncate rounded-full bg-black/55 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase text-app-ink">
      {[heroTitle, venue?.name, dayWord(eventStart) || eventStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })]
        .filter(Boolean)
        .join(' · ')}
    </span>
  ) : null;

  const kicker = eventStart ? kickerDate(eventStart) : null;

  return (
    <AppShell
      headerProps={null}
      hideUploadPill={eventUploads.summary.state !== 'idle'}
      contentRef={contentRef}
      contentWrapperClassName={false}
      // A gentle pull towards the stage when you stop near it; never forced.
      contentClassName={`event-detail-content${hasStage ? ' snap-y snap-proximity' : ''}`}
    >
      {loading && <DetailSkeleton />}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && event && (
        <>
          <DetailHeader
            title={heroTitle}
            scrollRef={contentRef}
            overlay={stageInView}
            actions={shareButton}
          />

          {lived ? (
            <div className={pagePadding}>
              {/* The poster, as before the concert; it drifts at half speed
                  while the stage below slides over it. */}
              <div ref={heroRef} className="relative z-0 will-change-transform">
                <EventHero
                  event={event}
                  title={heroTitle}
                  tourName={tourName}
                  kicker={kicker}
                  artists={artists}
                  venue={venue}
                  festival={festival}
                  isFollowing={isFollowing}
                />
              </div>

              {hasStage && timeline ? (
                <section
                  ref={stageRef}
                  aria-label="El concierto, a pantalla completa"
                  className="relative z-10 mt-5 snap-start overflow-hidden bg-black"
                  style={{ height: viewportHeight ? `${viewportHeight}px` : '100dvh' }}
                >
                  <ConcertPlayer
                    timeline={timeline}
                    title={heroTitle}
                    stageChip={stageChip}
                    seekRequest={seekRequest}
                    onActiveSongChange={onActiveSongChange}
                    onDuration={reportDuration}
                    inView={stageInView && pageVisible}
                    bottomClearance={bottomClearance}
                  />
                </section>
              ) : null}

              <div className="relative z-10 bg-app-bg">
                {hasStage ? null : momentsLoading ? (
                  <div className="mx-4 mt-5 h-[120px] animate-pulse rounded-2xl bg-app-surface motion-reduce:animate-none" aria-label="Cargando momentos" />
                ) : (
                  <div className="px-4 pt-5">
                    <p className="font-display text-xl font-bold text-app-ink">Sube lo que grabaste</p>
                    <p className="mt-1 text-sm text-[#c9c5bd]">
                      {timeline && timeline.unplaced.length > 0
                        ? 'Los momentos de este concierto no tienen hora: están más abajo.'
                        : 'Aún no hay momentos. Lo que subáis se monta aquí como un solo vídeo, canción a canción.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => openUpload()}
                      className="mt-3 min-h-11 rounded-full bg-app-accent px-4 text-sm font-bold text-[#14151a]"
                    >
                      ¿La grabaste? Sube el primero
                    </button>
                  </div>
                )}

                {momentsError && <p className="px-4 pt-2 text-sm text-rose-400">{momentsError}</p>}

                <EventPhotos moments={moments} currentUserId={user?.id ?? null} onDeleted={removeMoment} />

                {timeline && timeline.unplaced.length > 0 ? (
                  <div className="px-4 pt-5">
                    <h2 className="font-display text-base font-bold text-app-ink">Sin hora exacta</h2>
                    <p className="mt-0.5 text-[12px] text-white/50">
                      No sabemos cuándo se grabaron, así que no están en la línea de tiempo.
                    </p>
                    <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                      {timeline.unplaced.map(moment => {
                        const thumb = thumbOf(moment);
                        return (
                          <button
                            key={moment.id}
                            type="button"
                            onClick={() => navigate(`/post/${moment.id}`)}
                            aria-label={`Ver momento de @${moment.userName || 'anónimo'}`}
                            className="relative h-[92px] w-[64px] shrink-0 overflow-hidden rounded-xl border border-app-line bg-app-surface"
                          >
                            {thumb ? (
                              <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                            ) : (
                              <GeneratedPoster title={heroTitle} variant="thumb" />
                            )}
                            <span className="absolute inset-x-1 bottom-1 truncate text-left text-[10px] font-semibold text-white drop-shadow">
                              @{moment.userName || 'anónimo'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}

                <div className="px-4 pt-4 empty:hidden">
                  <VenueFeedbackPrompt eventId={event.id} />
                </div>

                <div className="flex items-center justify-between px-4 pt-5">
                  <h2 className="font-display text-xl font-bold text-app-ink">El concierto, canción a canción</h2>
                  <button type="button" aria-label="Compartir" className="flex h-11 w-11 items-center justify-center text-white/70" onClick={() => setShowShare(true)}>
                    <IconShare size={19} />
                  </button>
                </div>

                {setlist.length === 0 ? (
                  <p className="px-4 pt-1 text-sm text-white/60">
                    Aún no hay setlist: los momentos van por orden de hora.
                  </p>
                ) : (
                  <ol className="mt-2.5 flex flex-col gap-1 px-4">
                    {setlist.map((entry, index) => {
                      const songClips = entry.song_id ? clipsBySong.get(entry.song_id) || [] : [];
                      const current = Boolean(entry.song_id && entry.song_id === playingSongId);
                      const last = index === setlist.length - 1;
                      return (
                        <li
                          key={entry.ordinal}
                          aria-current={current ? 'true' : undefined}
                          className={`flex min-h-[60px] items-center gap-3 ${
                            current
                              ? '-mx-2.5 rounded-xl bg-app-accent/[0.12] px-2.5 py-2'
                              : `py-2 ${last ? '' : 'border-b border-app-line'}`
                          }`}
                        >
                          <span className={`w-6 font-mono text-[12px] font-semibold ${current ? 'text-app-accent' : 'text-[#8f8b84]'}`}>
                            {pad(entry.ordinal)}
                          </span>
                          <span className={`min-w-0 flex-1 truncate text-[15px] ${current ? 'font-bold text-app-accent' : 'font-semibold text-app-ink'}`}>
                            {entry.song_title || 'Canción sin título'}
                          </span>
                          {songClips.length > 0 ? (
                            <button
                              type="button"
                              className="flex min-h-11 items-center"
                              aria-label={`Ver ${songClips.length} momentos de ${entry.song_title || 'esta canción'}`}
                              onClick={() => playClip(songClips[0])}
                            >
                              {songClips.slice(0, 3).map((clip, thumbIndex) => {
                                const thumb = thumbOf(clip.moment);
                                return (
                                  <span
                                    key={clip.id}
                                    className={`relative h-11 w-[34px] overflow-hidden rounded-md border-2 bg-app-surface ${
                                      current && thumbIndex === 0 ? 'border-app-accent' : 'border-app-bg'
                                    } ${thumbIndex > 0 ? '-ml-2.5' : ''}`}
                                  >
                                    {thumb ? (
                                      <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                                    ) : (
                                      <GeneratedPoster title={entry.song_title || heroTitle} variant="thumb" />
                                    )}
                                  </span>
                                );
                              })}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openUpload(entry.ordinal)}
                              className="min-h-11 shrink-0 rounded-full border border-dashed border-app-line px-3 text-xs font-semibold text-[#c9c5bd]"
                            >
                              ¿La grabaste?
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
                {setlist.some(entry => entry.source === 'setlistfm') && (
                  <div className="px-4">
                    <SetlistAttribution url={setlist.find(entry => entry.source_url)?.source_url} />
                  </div>
                )}
                <SetlistCredit setlist={setlist} className="px-4" />
                <SetlistProposalAction
                  eventId={event.id}
                  startsAt={event.starts_at}
                  setlist={setlist}
                  attendance={attendanceStatus}
                  onApplied={reloadSetlist}
                  className="px-4 pt-3"
                />
                <div className="px-4 pt-4">
                  <button
                    type="button"
                    onClick={() => navigate('/importar')}
                    className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border border-app-line bg-app-surface px-3.5 text-left"
                  >
                    <IconPlus size={18} className="shrink-0 text-app-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-app-ink">¿Lo subiste a Instagram, TikTok o YouTube?</span>
                      <span className="block text-[12px] text-white/50">Impórtalo y aparece en su sitio de la línea de tiempo</span>
                    </span>
                  </button>
                </div>
                {engagementError && <p className="px-4 pt-3 text-sm text-rose-400">{engagementError}</p>}
                <div className="px-4 pt-5 empty:hidden">
                  <EventMerchSection
                    eventId={event.id}
                    startsAt={event.starts_at}
                    endsAt={event.ends_at}
                    venueName={venue?.name ?? null}
                    attending={attendanceStatus !== null}
                    onAttend={markGoingForMerch}
                  />
                </div>
                <div className="px-4 pt-5 empty:hidden">
                  <EventStatsCard eventId={event.id} />
                </div>
              </div>
            </div>
          ) : (
            <div className={pagePadding}>
              <EventHero
                event={event}
                title={heroTitle}
                tourName={tourName}
                kicker={kicker}
                artists={artists}
                venue={venue}
                festival={festival}
                isFollowing={isFollowing}
              />

              <div className="flex flex-col gap-3 px-4 pt-3.5">
                <div className="pt-1">
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 font-mono text-[11px] font-bold tracking-[0.08em] ${
                      isPastEvent ? 'bg-app-line text-app-ink' : 'bg-app-accent text-[#14151a]'
                    }`}
                  >
                    {!isPastEvent && eventStart && sameDay(eventStart, now) ? (
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#14151a]/60" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-[#14151a]" />
                      </span>
                    ) : null}
                    {isPastEvent ? '¿ESTUVISTE?' : eventStart && sameDay(eventStart, now) ? 'ESTA NOCHE' : 'EL DÍA DEL CONCIERTO'}
                  </span>
                  <p className="mt-2 font-display text-xl font-bold text-app-ink">
                    {isPastEvent ? 'Sube lo que grabaste' : 'Graba lo que quieras recordar'}
                  </p>
                  <p className="mt-1 text-sm text-[#c9c5bd]">
                    Al subirlo lo colocamos en su canción, junto a lo que grabó el resto del público.
                  </p>
                </div>

                <EventMerchSection
                  eventId={event.id}
                  startsAt={event.starts_at}
                  endsAt={event.ends_at}
                  venueName={venue?.name ?? null}
                  attending={attendanceStatus !== null}
                  onAttend={markGoingForMerch}
                />

                <EventStatsCard eventId={event.id} />

                {event.description ? <p className="text-sm text-white/65 line-clamp-6">{event.description}</p> : null}
                {engagementError && <p className="text-sm text-rose-400">{engagementError}</p>}
              </div>
            </div>
          )}

          {suggestAttendance ? (
            <AttendanceSuggestion
              key={event.id}
              eventId={event.id}
              startsAt={event.starts_at}
              endsAt={event.ends_at}
              onMarked={status => setAttendanceStatus(status)}
              // Asked once: going back to this page does not ask again.
              onClose={() => navigate(`${location.pathname}${location.search}`, { replace: true, state: null })}
              className={`fixed inset-x-4 z-[1301] shadow-xl ${
                showBottomBar ? 'bottom-[calc(146px+env(safe-area-inset-bottom,0px))]' : 'bottom-[calc(84px+env(safe-area-inset-bottom,0px))]'
              }`}
            />
          ) : null}

          {showBottomBar ? (
            // Floats right above the app's bottom nav, never over it.
            <div className={`pointer-events-none fixed inset-x-0 z-[1300] flex justify-center px-3 ${ACTION_BAR_BOTTOM}`}>
              <div className="pointer-events-auto flex w-full max-w-[34rem] items-center gap-2 rounded-full border border-white/10 bg-app-bg/85 p-1 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                {uploadMode ? (
                  <EventUploadButton bar={uploadBar} onUpload={() => openUpload()} />
                ) : (
                  <>
                    <button
                      type="button"
                      aria-label={followed ? 'Quitar de guardados' : 'Guardar'}
                      aria-pressed={followed}
                      disabled={followLoading}
                      onClick={handleFollowClick}
                      className={`flex h-[50px] w-[50px] shrink-0 items-center justify-center rounded-full border transition ${
                        followed ? 'border-app-accent bg-app-accent/15 text-app-accent' : 'border-app-line bg-app-surface text-app-ink'
                      }`}
                    >
                      {followed ? <IconBookmarkFilled className="h-5 w-5" /> : <IconBookmark className="h-5 w-5" />}
                    </button>
                    <button
                      type="button"
                      aria-pressed={attendanceActive}
                      disabled={attendanceLoading}
                      onClick={handleAttendanceClick}
                      className={`h-[50px] shrink-0 rounded-full border px-4 text-[15px] font-semibold transition ${
                        attendanceActive
                          ? 'border-[#25d47b] bg-[#25d47b]/[0.12] text-[#25d47b]'
                          : 'border-app-line bg-app-surface text-app-ink'
                      } ${event.ticket_url ? '' : 'flex-1'}`}
                    >
                      Voy
                    </button>
                    {event.ticket_url ? (
                      <a
                        href={event.ticket_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex h-[50px] flex-1 items-center justify-center rounded-full border border-app-line text-[15px] font-semibold text-app-ink"
                      >
                        Entradas
                      </a>
                    ) : null}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </>
      )}

      <ShareSheet isOpen={showShare} onClose={() => setShowShare(false)} link={shareUrl} />
    </AppShell>
  );
};

export default EventDetail;

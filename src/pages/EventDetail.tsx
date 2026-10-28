import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithSetlist, Profile, VenuePlace, EventSetlistEntry, Artist } from '../lib/types';
import { eventService } from '../services/event.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import TimelinePlayer, { MediaFilter } from '../components/event/TimelinePlayer';
import { TimelineBucket } from '../components/event/TimelineScrubber';
import ShareSheet from '../components/ShareSheet';
import { IconBookmark, IconBookmarkFilled, IconFlag, IconPlus, IconShare } from '../components/icons';
import DetailHeader from '../components/ui/DetailHeader';
import Avatar from '../components/ui/Avatar';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { fetchEventCardById } from '../data/eventQueries';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import SetlistAttribution from '../components/event/SetlistAttribution';
import { enableMomentNudges } from '../features/moments/momentNudge';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { EventStatsCard, VenueFeedbackPrompt } from '../features/community';
import { EventTagBadge } from '../features/socialImport';
import { festivalService } from '../services/festival.service';
import EventMerchSection from '../features/merch/EventMerchSection';

type EventDetailData = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

// Just enough of every moment of the concert to group them by song.
type SongMoment = Pick<
  PostWithSetlist,
  'id' | 'song_id' | 'resolved_song_id' | 'media_type' | 'media_url' | 'thumbnail_url' | 'captured_at' | 'created_at'
>;

const pad = (value: number) => value.toString().padStart(2, '0');
const secondOf = (iso: string) => Math.floor(new Date(iso).getTime() / 1000);

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

const Chevron = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="shrink-0 text-white/50">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

const thumbOf = (moment: SongMoment) =>
  moment.thumbnail_url || (moment.media_type === 'image' ? moment.media_url : null);

const EventDetail: React.FC = () => {
  const navigate = useNavigate();
  const id = useRouteEntityId() || '';
  const { user } = useAuth();
  const { isFollowing } = useFollowedSubjects();
  const [event, setEvent] = useState<EventDetailData | null>(null);
  const [festival, setFestival] = useState<{ id: string; name: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [bucketsError, setBucketsError] = useState('');
  const [bucketMoments, setBucketMoments] = useState<PostWithSetlist[]>([]);
  const [setlist, setSetlist] = useState<EventSetlistEntry[]>([]);
  const [songMoments, setSongMoments] = useState<SongMoment[]>([]);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(0);
  const [selectedMomentIndex, setSelectedMomentIndex] = useState(0);
  const [pendingJump, setPendingJump] = useState<SongMoment | null>(null);
  const [showShare, setShowShare] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('video');
  const [mediaCounts, setMediaCounts] = useState({ all: 0, video: 0, image: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<'going' | 'attended' | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [engagementError, setEngagementError] = useState('');
  const contentRef = useRef<HTMLElement | null>(null);
  const bucketCacheRef = useRef<Record<string, PostWithSetlist[]>>({});
  const bucketLoadingRef = useRef<Record<string, boolean>>({});

  const scrollToTop = () => {
    document.querySelector<HTMLElement>('.event-detail-content')?.scrollTo({ top: 0, behavior: 'auto' });
  };

  const loadEvent = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await fetchEventCardById(id);

      if (!data) {
        setError('No encontramos este evento.');
        setEvent(null);
        return;
      }

      setEvent(data as EventDetailData);

      const [setlistData, momentsData] = await Promise.all([
        eventService.getEventSetlist(id),
        supabase
          .from('v_event_posts_with_setlist')
          .select('id,song_id,resolved_song_id,media_type,media_url,thumbnail_url,captured_at,created_at')
          .eq('event_id', id)
          .order('event_offset_ms', { ascending: true, nullsFirst: false })
          .limit(400),
      ]);
      setSetlist(setlistData);
      setSongMoments(((momentsData.data || []) as unknown) as SongMoment[]);
    } catch (err) {
      setError('No se ha podido cargar este evento. Revisa tu conexión.');
      setEvent(null);
    } finally {
      setLoading(false);
    }
  };

  const loadBuckets = async (filter: MediaFilter) => {
    setBucketsLoading(true);
    setBucketsError('');
    bucketCacheRef.current = {};
    bucketLoadingRef.current = {};
    try {
      let bucketDataResponse:
        | { data: TimelineBucket[] | null; error: { message: string } | null }
        | null = null;
      if (filter === 'all') {
        bucketDataResponse = await supabase.rpc('event_moment_buckets', { p_event_id: id });
      } else {
        const filteredResponse = await supabase.rpc('event_moment_buckets_filtered', {
          p_event_id: id,
          p_media_type: filter,
        });
        if (!filteredResponse.error) {
          bucketDataResponse = filteredResponse;
        } else {
          bucketDataResponse = await supabase.rpc('event_moment_buckets', { p_event_id: id });
        }
      }

      if (bucketDataResponse?.error) {
        throw bucketDataResponse.error;
      }

      const bucketData = (bucketDataResponse?.data || []) as TimelineBucket[];
      const lastIndex = bucketData.length > 0 ? bucketData.length - 1 : 0;
      setBuckets(bucketData);
      setSelectedBucketIndex(lastIndex);
      setSelectedMomentIndex(0);
    } catch (err: any) {
      setBuckets([]);
      setBucketsError(err?.message || 'No se ha podido cargar la línea de tiempo.');
    } finally {
      setBucketsLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const baseQuery = supabase
        .from('media_assets')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('status', 'published')
        .is('deleted_at', null);
      const videoQuery = supabase
        .from('media_assets')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('status', 'published')
        .eq('kind', 'video')
        .is('deleted_at', null);
      const imageQuery = supabase
        .from('media_assets')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('status', 'published')
        .eq('kind', 'image')
        .is('deleted_at', null);

      const [{ count: allCount }, { count: videoCount }, { count: imageCount }] = await Promise.all([
        baseQuery,
        videoQuery,
        imageQuery,
      ]);

      const nextCounts = {
        all: allCount ?? 0,
        video: videoCount ?? 0,
        image: imageCount ?? 0,
      };
      setMediaCounts(nextCounts);

      if (mediaFilter === 'video' && nextCounts.video === 0 && nextCounts.image > 0) {
        setMediaFilter('image');
      }
      if (mediaFilter === 'image' && nextCounts.image === 0 && nextCounts.video > 0) {
        setMediaFilter('video');
      }
      if (mediaFilter !== 'all' && nextCounts.video === 0 && nextCounts.image === 0) {
        setMediaFilter('all');
      }
    } catch {
      setMediaCounts({ all: 0, video: 0, image: 0 });
    }
  };

  const loadBucket = async (bucketTime: string, setAsSelected: boolean, filter: MediaFilter) => {
    if (!bucketTime) return;
    const cacheKey = `${filter}:${bucketTime}`;
    if (bucketCacheRef.current[cacheKey]) {
      if (setAsSelected) {
        setBucketMoments(bucketCacheRef.current[cacheKey]);
        setSelectedMomentIndex(0);
      }
      return;
    }

    if (bucketLoadingRef.current[cacheKey]) return;
    bucketLoadingRef.current[cacheKey] = true;
    if (setAsSelected) {
      setBucketLoading(true);
    }

    try {
      const bucketStart = new Date(bucketTime);
      const bucketEnd = new Date(bucketStart.getTime() + 1000);
      const bucketStartIso = bucketStart.toISOString();
      const bucketEndIso = bucketEnd.toISOString();

      let query = supabase
        .from('v_event_posts_with_setlist')
        .select('*')
        .eq('event_id', id)
        .or(
          `and(captured_at.gte.${bucketStartIso},captured_at.lt.${bucketEndIso}),and(captured_at.is.null,created_at.gte.${bucketStartIso},created_at.lt.${bucketEndIso})`
        )
        .order('event_offset_ms', { ascending: true, nullsFirst: false })
        .order('captured_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (filter !== 'all') {
        query = query.eq('media_type', filter);
      }

      const { data, error: bucketError } = await query;

      if (bucketError) {
        throw bucketError;
      }

      const moments = (data || []) as unknown as PostWithSetlist[];
      bucketCacheRef.current[cacheKey] = moments;
      if (setAsSelected) {
        setBucketMoments(moments);
        setSelectedMomentIndex(0);
      }
    } catch (err) {
      if (setAsSelected) {
        setBucketMoments([]);
      }
    } finally {
      bucketLoadingRef.current[cacheKey] = false;
      if (setAsSelected) {
        setBucketLoading(false);
      }
    }
  };

  const prefetchBucket = (index: number, filter: MediaFilter) => {
    if (index < 0 || index >= buckets.length) return;
    const bucket = buckets[index];
    loadBucket(bucket.bucket_time, false, filter);
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
    bucketCacheRef.current = {};
    bucketLoadingRef.current = {};
    setBuckets([]);
    setBucketMoments([]);
    setSongMoments([]);
    setSetlist([]);
    setSelectedBucketIndex(0);
    setSelectedMomentIndex(0);
    loadEvent();
    loadCounts();
    window.setTimeout(scrollToTop, 0);
  }, [id]);

  useEffect(() => {
    loadBuckets(mediaFilter);
  }, [id, mediaFilter]);

  useEffect(() => {
    if (selectedBucketIndex >= buckets.length && buckets.length > 0) {
      setSelectedBucketIndex(0);
    }
  }, [buckets, selectedBucketIndex]);

  const selectedBucket = buckets[selectedBucketIndex] ?? null;
  const totalMoments = useMemo(() => {
    const bucketTotal = buckets.reduce((sum, bucket) => sum + bucket.moment_count, 0);
    if (mediaFilter === 'video') {
      return mediaCounts.video || bucketTotal;
    }
    if (mediaFilter === 'image') {
      return mediaCounts.image || bucketTotal;
    }
    return mediaCounts.all || bucketTotal;
  }, [buckets, mediaCounts, mediaFilter]);

  useEffect(() => {
    if (!selectedBucket) {
      setBucketMoments([]);
      return;
    }
    loadBucket(selectedBucket.bucket_time, true, mediaFilter);
    prefetchBucket(selectedBucketIndex - 1, mediaFilter);
    prefetchBucket(selectedBucketIndex + 1, mediaFilter);
  }, [selectedBucket?.bucket_time, mediaFilter]);

  // Tapping a song's moments moves the player to that second of the timeline.
  useEffect(() => {
    if (!pendingJump || bucketsLoading) return;
    const second = secondOf(pendingJump.captured_at || pendingJump.created_at);
    const index = buckets.findIndex(bucket => secondOf(bucket.bucket_time) === second);
    if (index < 0) {
      setPendingJump(null);
      return;
    }
    if (index !== selectedBucketIndex) setSelectedBucketIndex(index);
  }, [buckets, bucketsLoading, pendingJump]);

  useEffect(() => {
    if (!pendingJump) return;
    const index = bucketMoments.findIndex(moment => moment.id === pendingJump.id);
    if (index < 0) return;
    setSelectedMomentIndex(index);
    setPendingJump(null);
  }, [bucketMoments, pendingJump]);

  const jumpTo = (moment: SongMoment) => {
    if (mediaFilter !== 'all' && moment.media_type !== mediaFilter) setMediaFilter('all');
    setPendingJump(moment);
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  };

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

  // Moments per setlist song, in the order they were recorded.
  const momentsBySong = useMemo(() => {
    const map = new Map<string, SongMoment[]>();
    for (const moment of songMoments) {
      const songId = moment.resolved_song_id || moment.song_id;
      if (!songId) continue;
      map.set(songId, [...(map.get(songId) || []), moment]);
    }
    return map;
  }, [songMoments]);

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
  const lived = hasStarted && (setlist.length > 0 || totalMoments > 0 || songMoments.length > 0);
  const attendanceTarget: 'going' | 'attended' = isPastEvent ? 'attended' : 'going';
  const attendanceActive = attendanceStatus === attendanceTarget;

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

  const handleAdvanceToNext = () => {
    if (bucketMoments.length > selectedMomentIndex + 1) {
      setSelectedMomentIndex(prev => prev + 1);
      return;
    }
    if (selectedBucketIndex + 1 < buckets.length) {
      setSelectedBucketIndex(prev => prev + 1);
      setSelectedMomentIndex(0);
    }
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

  const selectedMoment = bucketMoments[selectedMomentIndex] ?? null;
  const playingSongId = selectedMoment ? selectedMoment.resolved_song_id || selectedMoment.song_id : null;

  const renderCaption = (moment: PostWithSetlist | null) => {
    if (!moment) {
      return <p className="font-poster text-[34px] leading-[0.95] text-app-ink">{heroTitle}</p>;
    }
    const songId = moment.resolved_song_id || moment.song_id;
    const entry = songId ? setlist.find(item => item.song_id === songId) : null;
    const title = moment.resolved_song_title || moment.song_title || entry?.song_title;
    return (
      <>
        <p className="font-mono text-[12px] font-semibold text-app-accent">
          {title ? `SUENA AHORA${entry ? ` · ${pad(entry.ordinal)}` : ''}` : 'MOMENTO DEL PÚBLICO'}
        </p>
        <p className="mt-0.5 font-poster text-[34px] leading-[0.95] text-app-ink line-clamp-2">{title || heroTitle}</p>
      </>
    );
  };

  const stageChip = eventStart ? (
    <span className="block truncate rounded-full bg-black/55 px-2.5 py-1.5 font-mono text-[11px] font-semibold uppercase text-app-ink">
      {[heroTitle, venue?.name, dayWord(eventStart) || eventStart.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })]
        .filter(Boolean)
        .join(' · ')}
    </span>
  ) : null;

  return (
    <AppShell headerProps={null} contentRef={contentRef} contentWrapperClassName={false} contentClassName="event-detail-content">
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      )}

      {!loading && error && <div className="p-4"><p className="text-sm text-rose-400">{error}</p></div>}

      {!loading && event && (
        <>
          <DetailHeader title={heroTitle} scrollRef={contentRef} actions={lived ? null : shareButton} />

          {lived ? (
            <div className="pb-[calc(96px+env(safe-area-inset-bottom,0px))]">
              <TimelinePlayer
                buckets={buckets}
                selectedBucketIndex={selectedBucketIndex}
                selectedMomentIndex={selectedMomentIndex}
                moments={bucketMoments}
                loading={bucketLoading || (bucketsLoading && bucketMoments.length === 0)}
                totalMoments={totalMoments}
                eventStart={eventStart}
                mediaFilter={mediaFilter}
                onSelectBucket={index => {
                  setSelectedBucketIndex(index);
                  setSelectedMomentIndex(0);
                }}
                onSelectMoment={index => setSelectedMomentIndex(index)}
                onAddMoments={() => openUpload()}
                onFilterChange={setMediaFilter}
                autoAdvance={mediaFilter === 'video'}
                onRequestNext={handleAdvanceToNext}
                renderCaption={renderCaption}
                stageChip={stageChip}
              />

              {bucketsError && <p className="px-4 pt-2 text-sm text-rose-400">{bucketsError}</p>}

              <div className="px-4 pt-4 empty:hidden">
                <VenueFeedbackPrompt eventId={event.id} />
              </div>

              <div className="flex items-center justify-between px-4 pt-5">
                <h2 className="font-display text-xl font-bold text-app-ink">El concierto, canción a canción</h2>
                <button type="button" aria-label="Compartir" className="text-white/70" onClick={() => setShowShare(true)}>
                  <IconShare size={19} />
                </button>
              </div>

              {setlist.length === 0 ? (
                <p className="px-4 pt-2 text-sm text-white/60">
                  Aún no hay setlist: los momentos van por orden de hora.
                </p>
              ) : (
                <ol className="mt-2.5 flex flex-col gap-1 px-4">
                  {setlist.map((entry, index) => {
                    const moments = entry.song_id ? momentsBySong.get(entry.song_id) || [] : [];
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
                        {moments.length > 0 ? (
                          <button
                            type="button"
                            className="flex"
                            aria-label={`Ver ${moments.length} momentos de ${entry.song_title || 'esta canción'}`}
                            onClick={() => jumpTo(moments[0])}
                          >
                            {moments.slice(0, 3).map((moment, thumbIndex) => {
                              const thumb = thumbOf(moment);
                              return (
                                <span
                                  key={moment.id}
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
                            className="min-h-9 shrink-0 rounded-full border border-dashed border-app-line px-3 text-xs font-semibold text-[#c9c5bd]"
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
              {engagementError && <p className="px-4 pt-3 text-sm text-rose-400">{engagementError}</p>}
              <div className="px-4 pt-5 empty:hidden">
                <EventMerchSection eventId={event.id} startsAt={event.starts_at} />
              </div>
              <div className="px-4 pt-5 empty:hidden">
                <EventTagBadge eventId={event.id} event={event} className="mb-3" />
                <EventStatsCard eventId={event.id} />
              </div>
            </div>
          ) : (
            <div className="pb-[calc(96px+env(safe-area-inset-bottom,0px))]">
              <section className="relative h-[380px] overflow-hidden">
                {event.cover_image_url ? (
                  <img src={event.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <GeneratedPoster title={heroTitle} variant="hero" />
                )}
                <div className="absolute inset-0 bg-[linear-gradient(to_top,#0d0e12_4%,rgba(13,14,18,0.3)_55%,rgba(13,14,18,0.55))]" />
                <div className="absolute inset-x-4 bottom-1.5">
                  {eventStart ? (
                    <p className="font-mono text-[12px] font-semibold tracking-[0.06em] text-app-accent">{kickerDate(eventStart)}</p>
                  ) : null}
                  <h1 className={`mt-1.5 font-poster leading-[0.86] text-app-ink ${heroTitle.length > 14 ? 'text-[46px]' : 'text-[64px]'}`}>
                    {heroTitle}
                  </h1>
                  {tourName ? <p className="mt-1.5 text-[15px] text-[#e4e0d8] line-clamp-2">{tourName}</p> : null}
                </div>
              </section>

              <div className="flex flex-col gap-3 px-4 pt-3.5">
                {festival ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/tabs/festival/${festival.id}`)}
                    className="flex min-h-[52px] items-center gap-2.5 rounded-2xl border border-app-accent/50 bg-app-accent/10 px-3.5 text-left"
                  >
                    <IconFlag size={18} className="text-app-accent" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-app-accent">Parte del festival</span>
                      <span className="block truncate font-display text-[15px] font-bold text-app-ink">{festival.name}</span>
                    </span>
                  </button>
                ) : null}
                {venue ? (
                  <button
                    type="button"
                    onClick={() => navigate(`/tabs/venue/${venue.id}`)}
                    className="flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-3 text-left"
                  >
                    <Avatar name={venue.name} src={venue.cover_image_url || (venue.photos || [])[0]} kind="venue" badge className="h-11 w-11 text-[15px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-bold text-app-ink">{venue.name}</span>
                      <span className="block truncate text-[13px] text-[#c9c5bd]">
                        {[venue.address, venue.city].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    <Chevron />
                  </button>
                ) : null}

                {artists.map(artist => (
                  <button
                    key={artist.id}
                    type="button"
                    onClick={() => navigate(`/tabs/artist/${artist.id}`)}
                    className="flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-3 text-left"
                  >
                    <Avatar name={artist.name} src={artist.avatar_url} kind="artist" badge className="h-11 w-11 text-[15px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-[15px] font-bold text-app-ink">{artist.name}</span>
                      <span className="block truncate text-[13px] text-[#c9c5bd]">
                        {artist.subject_id && isFollowing(artist.subject_id) ? 'Lo sigues' : 'Artista'}
                      </span>
                    </span>
                    <Chevron />
                  </button>
                ))}

                <div className="rounded-[18px] border border-dashed border-app-accent bg-app-accent/[0.08] p-4">
                  <p className="font-mono text-[11px] font-semibold tracking-[0.06em] text-app-accent">
                    {isPastEvent ? '¿ESTUVISTE?' : eventStart && sameDay(eventStart, now) ? 'ESTA NOCHE' : 'EL DÍA DEL CONCIERTO'}
                  </p>
                  <p className="mt-1.5 font-display text-lg font-bold text-app-ink">
                    {isPastEvent ? 'Sube lo que grabaste' : 'Graba lo que quieras recordar'}
                  </p>
                  <p className="mt-1 text-sm text-[#c9c5bd]">
                    Al subirlo lo colocamos en su canción, junto a lo que grabó el resto del público.
                  </p>
                </div>

                <EventMerchSection eventId={event.id} startsAt={event.starts_at} />

                <EventTagBadge eventId={event.id} event={event} />

                <EventStatsCard eventId={event.id} />

                {event.description ? <p className="text-sm text-white/65 line-clamp-6">{event.description}</p> : null}
                {engagementError && <p className="text-sm text-rose-400">{engagementError}</p>}
              </div>
            </div>
          )}

          <div className="fixed inset-x-0 bottom-0 z-[1300] flex items-center gap-2 border-t border-app-line bg-app-bg/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2.5 backdrop-blur-xl">
            {isPastEvent || lived ? (
              <button
                type="button"
                onClick={() => openUpload()}
                className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-full bg-app-accent text-base font-bold text-[#14151a]"
              >
                <IconPlus className="h-5 w-5" />
                Sube lo que grabaste
              </button>
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
        </>
      )}

      <ShareSheet isOpen={showShare} onClose={() => setShowShare(false)} link={shareUrl} />
    </AppShell>
  );
};

export default EventDetail;

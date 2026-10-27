import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Content, Modal, Spinner } from '../components/ui/AppPrimitives';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithSetlist, Profile, VenuePlace, EventSetlistEntry, Artist } from '../lib/types';
import { clearCached } from '../lib/requestCache';
import { eventService } from '../services/event.service';
import { useAuth } from '../contexts/AuthContext';
import { buildMomentItems, parseDatetimeLocalValue, MomentItem } from '../lib/moments';
import AppShell from '../components/AppShell';
import EventHero, { EventEntity } from '../components/event/EventHero';
import TimelinePlayer, { MediaFilter } from '../components/event/TimelinePlayer';
import { TimelineBucket } from '../components/event/TimelineScrubber';
import ShareSheet from '../components/ShareSheet';
import { IconBookmark, IconBookmarkFilled, IconPlus, IconShare, IconTicket } from '../components/icons';
import Button from '../components/ui/Button';
import DetailHeader from '../components/ui/DetailHeader';
import { fetchEventCardById } from '../data/eventQueries';
import { createConfiguredCloudinaryMediaProvider, uploadEventPost } from '../media';
import { useRouteEntityId } from '../hooks/useRouteEntityId';
import SetlistAttribution from '../components/event/SetlistAttribution';
import { enableMomentNudges } from '../features/moments/momentNudge';

type EventDetailData = Event & {
  organizer?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Artist | null }[];
};

type EventDetailLocationState = {
  openAddMoments?: boolean;
};

const EventDetail: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as EventDetailLocationState | null;
  const id = useRouteEntityId() || '';
  const { user } = useAuth();
  const [event, setEvent] = useState<EventDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [bucketsError, setBucketsError] = useState('');
  const [bucketMoments, setBucketMoments] = useState<PostWithSetlist[]>([]);
  const [setlist, setSetlist] = useState<EventSetlistEntry[]>([]);
  const [bucketLoading, setBucketLoading] = useState(false);
  const [selectedBucketIndex, setSelectedBucketIndex] = useState(0);
  const [selectedMomentIndex, setSelectedMomentIndex] = useState(0);
  const [showAddMoments, setShowAddMoments] = useState(false);
  const [momentItems, setMomentItems] = useState<MomentItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [showShare, setShowShare] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('video');
  const [mediaCounts, setMediaCounts] = useState({ all: 0, video: 0, image: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<'going' | 'attended' | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [followAnimating, setFollowAnimating] = useState(false);
  const [attendanceAnimating, setAttendanceAnimating] = useState(false);
  const [engagementError, setEngagementError] = useState('');
  const [showReliveBanner, setShowReliveBanner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);
  const momentItemsRef = useRef<MomentItem[]>([]);
  const followFxTimerRef = useRef<number | null>(null);
  const attendanceFxTimerRef = useRef<number | null>(null);
  const bucketCacheRef = useRef<Record<string, PostWithSetlist[]>>({});
  const bucketLoadingRef = useRef<Record<string, boolean>>({});

  const scrollToTop = () => {
    document.querySelector<HTMLElement>('.event-detail-content')?.scrollTo({ top: 0, behavior: 'auto' });
  };

  useEffect(() => {
    if (!locationState?.openAddMoments) return;
    setShowReliveBanner(true);
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: {} },
    );
  }, [location.hash, location.pathname, location.search, locationState?.openAddMoments, navigate]);

  useEffect(() => {
    momentItemsRef.current = momentItems;
  }, [momentItems]);

  useEffect(() => {
    return () => {
      momentItemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
      if (followFxTimerRef.current) window.clearTimeout(followFxTimerRef.current);
      if (attendanceFxTimerRef.current) window.clearTimeout(attendanceFxTimerRef.current);
    };
  }, []);

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

      // Load setlist
      const setlistData = await eventService.getEventSetlist(id);
      setSetlist(setlistData);
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

  useEffect(() => {
    bucketCacheRef.current = {};
    bucketLoadingRef.current = {};
    setBuckets([]);
    setBucketMoments([]);
    setSelectedBucketIndex(0);
    setSelectedMomentIndex(0);
    setMomentItems([]);
    setShowAddMoments(false);
    loadEvent();
    loadCounts();
    window.setTimeout(scrollToTop, 0);
  }, [id]);

  useEffect(() => {
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

  const entities = useMemo<EventEntity[]>(() => {
    if (!event) return [];
    const list: EventEntity[] = [];
    const seen = new Set<string>();
    const pushProfile = (profile: Profile | null | undefined) => {
      if (!profile || seen.has(profile.id)) return;
      list.push({
        id: profile.id,
        name: profile.display_name || profile.username || 'Desconocido',
        role: profile.role,
      });
      seen.add(profile.id);
    };

    const pushArtist = (artist: Artist | null | undefined) => {
      if (!artist || seen.has(artist.id)) return;
      list.push({
        id: artist.id,
        name: artist.name || 'Artista desconocido',
        role: 'artist_entity',
      });
      seen.add(artist.id);
    };

    pushProfile(event.organizer);
    event.event_artists?.forEach(item => pushArtist(item.artist));
    return list;
  }, [event]);

  const heroTitle = useMemo(() => {
    if (!event) return 'Evento';
    const artist = event.event_artists?.find(item => item.artist)?.artist;
    if (artist) return artist.name;
    const organizerName =
      event.organizer && event.organizer.role !== 'venue' 
        ? (event.organizer.display_name || event.organizer.username) 
        : null;
    return organizerName || event.name;
  }, [event]);

  const heroMeta = useMemo(() => {
    if (!event) return null;
    const venueName =
      event.venue_place?.name ||
      event.address ||
      'Sala por confirmar';
    const timeLabel = new Date(event.starts_at).toLocaleString('es-ES', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <span className="flex flex-wrap items-center gap-2">
        {event.venue_place ? (
          <button type="button" className="font-semibold text-white transition-colors hover:text-app-accent" onClick={() => navigate(`/tabs/venue/${event.venue_place?.id}`)}>
            {venueName}
          </button>
        ) : (
          <span className="font-semibold text-white">{venueName}</span>
        )}
        <span className="text-white/50">·</span>
        <span className="text-white/80">{timeLabel}</span>
      </span>
    );
  }, [event, navigate]);

  const eventStart = useMemo(() => (event ? new Date(event.starts_at) : null), [event]);
  const eventEnd = useMemo(() => (event?.ends_at ? new Date(event.ends_at) : null), [event]);

  const handleSelectEntity = (id: string, role: EventEntity['role']) => {
    if (role === 'artist_entity') {
      navigate(`/tabs/artist/${id}`);
    } else {
      navigate(`/profile/${id}`);
    }
  };

  const formatEntityRole = (role: EventEntity['role']) => {
    if (role === 'artist' || role === 'artist_entity') return 'Artista';
    if (role === 'venue') return 'Sala';
    if (role === 'label') return 'Sello';
    return 'Usuario';
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handlePrimaryCtaClick = () => {
    setUploadError('');
    setUploadSuccess('');

    if (!user) {
      navigate('/welcome');
      return;
    }

    if (!event) {
      setUploadError('No encontramos este evento.');
      return;
    }

    openFilePicker();
  };

  const handleMomentFilesSelected = async (eventInput: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(eventInput.target.files || []);
    if (!files.length) return;
    const items = await buildMomentItems(files);
    setMomentItems(prev => [...prev, ...items]);
    setShowAddMoments(true);
    eventInput.target.value = '';
  };

  const handleMomentTimeChange = (momentId: string, value: string) => {
    const parsed = parseDatetimeLocalValue(value);
    setMomentItems(prev =>
      prev.map(item =>
        item.id === momentId
          ? {
              ...item,
              manualValue: value,
              captureAt: parsed,
              captureSource: value ? 'manual' : null,
            }
          : item
      )
    );
  };

  const handleUseUploadTime = (momentId: string) => {
    setMomentItems(prev =>
      prev.map(item =>
        item.id === momentId
          ? {
              ...item,
              manualValue: '',
              captureAt: null,
              captureSource: null,
            }
          : item
      )
    );
  };

  const handleRemoveMoment = (momentId: string) => {
    setMomentItems(prev => {
      const target = prev.find(item => item.id === momentId);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(item => item.id !== momentId);
    });
  };

  const handleUploadMoments = async () => {
    setUploadError('');
    setUploadSuccess('');

    if (!user) {
      setUploadError('Entra para subir momentos.');
      return;
    }

    if (!event) {
      setUploadError('No encontramos este evento.');
      return;
    }

    if (momentItems.length === 0) {
      setUploadError('Elige al menos una foto o un vídeo.');
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: momentItems.length });

    try {
      const mediaProvider = createConfiguredCloudinaryMediaProvider();
      for (let i = 0; i < momentItems.length; i += 1) {
        const item = momentItems[i];
        setUploadProgress({ current: i + 1, total: momentItems.length });
        await uploadEventPost({
          provider: mediaProvider,
          file: item.file,
          kind: item.mediaType,
          eventId: event.id,
          authorId: user.id,
          capturedAt: item.captureAt ? item.captureAt.toISOString() : null,
        });
      }

      await updateAttendance('attended', { force: true });
      setUploadSuccess('¡Momentos subidos!');
      clearCached(`posts:count:user:${user.id}:event:${event.id}`);
      setMomentItems(prev => {
        prev.forEach(item => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      setShowAddMoments(false);
      loadCounts();
      loadBuckets(mediaFilter);
    } catch (err: any) {
      setUploadError(err?.message || 'No se ha podido subir. Inténtalo de nuevo.');
    } finally {
      setUploading(false);
    }
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

  const updateAttendance = async (
    status: 'going' | 'attended',
    options?: { force?: boolean }
  ) => {
    if (!user || !event) return false;
    setEngagementError('');
    setAttendanceLoading(true);
    try {
      if (!options?.force && attendanceStatus === status) {
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
            status 
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
  const isPastEvent = eventStart
    ? eventEnd
      ? now > eventEnd
      : now.getTime() > eventStart.getTime() + 6 * 60 * 60 * 1000
    : false;
  const attendanceTarget: 'going' | 'attended' = isPastEvent ? 'attended' : 'going';
  const attendanceLabel = isPastEvent ? 'Fui' : 'Voy';
  const attendanceActive = attendanceStatus === attendanceTarget;

  const triggerEngagementFx = (action: 'follow' | 'attendance') => {
    if (action === 'follow') {
      setFollowAnimating(false);
      if (followFxTimerRef.current) window.clearTimeout(followFxTimerRef.current);
      window.requestAnimationFrame(() => {
        setFollowAnimating(true);
        followFxTimerRef.current = window.setTimeout(() => setFollowAnimating(false), 420);
      });
      return;
    }

    setAttendanceAnimating(false);
    if (attendanceFxTimerRef.current) window.clearTimeout(attendanceFxTimerRef.current);
    window.requestAnimationFrame(() => {
      setAttendanceAnimating(true);
      attendanceFxTimerRef.current = window.setTimeout(() => setAttendanceAnimating(false), 420);
    });
  };

  const handleFollowClick = () => {
    triggerEngagementFx('follow');
    if (!user) {
      navigate('/welcome');
      return;
    }
    toggleFollow();
  };

  const handleAttendanceClick = () => {
    triggerEngagementFx('attendance');
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
              <DetailHeader
                title={heroTitle}
                scrollRef={contentRef}
                actions={(
                  <button
                    type="button"
                    aria-label="Compartir"
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-black/45 text-white backdrop-blur-md"
                    onClick={() => setShowShare(true)}
                  >
                    <IconShare size={19} />
                  </button>
                )}
              />
              <EventHero title={heroTitle} coverImageUrl={event.cover_image_url} />

              <div className="relative z-10 -mt-10">
                <div className="flex flex-col gap-6 p-4 pb-[calc(110px+env(safe-area-inset-bottom,0px))]">
                  <div className="space-y-3">
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">Concierto</p>
                    <h1 className="font-poster text-[44px] leading-[0.9] text-white">{heroTitle}</h1>
                    {!event.name.toLowerCase().includes(heroTitle.toLowerCase()) ? <p className="text-sm text-white/70">{event.name}</p> : null}
                    {heroMeta ? <div className="text-sm text-white/80">{heroMeta}</div> : null}
                    {entities.length > 0 && (
                      <div className="flex flex-wrap gap-2 pt-1">
                        {entities.map(entity => (
                          <button
                            key={entity.id}
                            type="button"
                            className="inline-flex items-center rounded-full border border-white/20 bg-black/25 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/80 transition-colors hover:border-white/40 hover:text-white"
                            onClick={() => handleSelectEntity(entity.id, entity.role)}
                          >
                            {entity.name} · {formatEntityRole(entity.role)}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {showReliveBanner && (
                    <div className="rounded-2xl border border-app-accent/30 bg-[linear-gradient(135deg,rgba(255,91,46,0.18),rgba(255,91,46,0.06)_60%,rgba(255,255,255,0.02))] p-4 shadow-[0_8px_18px_rgba(0,0,0,0.18)]">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-app-accent">Revívelo</p>
                      <p className="mt-2 font-display text-lg font-bold text-white">Añade tus momentos</p>
                      <p className="mt-1 text-xs text-white/70">Comparte lo que viviste antes de que se te olvide.</p>
                      <div className="mt-4 flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex flex-1 items-center justify-center rounded-full bg-app-accent px-4 py-2 text-sm font-semibold text-white"
                          onClick={handlePrimaryCtaClick}
                        >
                          Añade tus momentos
                        </button>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
                          onClick={() => setShowReliveBanner(false)}
                        >
                          Ahora no
                        </button>
                      </div>
                    </div>
                  )}

                {engagementError && <p className="text-sm text-rose-400">{engagementError}</p>}
                {bucketsError && <p className="text-sm text-rose-400">{bucketsError}</p>}

                {setlist.length > 0 && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                    <h3 className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/60">Setlist oficial</h3>
                    <div className="mt-3 flex flex-col gap-2">
                      {setlist.map((entry) => (
                        <div key={entry.ordinal} className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2 text-xs">
                          <span className="text-white/80">
                            <span className="mr-2 text-white/45">{entry.ordinal}.</span>
                            {entry.song_title || 'Canción desconocida'}
                          </span>
                        </div>
                      ))}
                    </div>
                    {setlist.some(entry => entry.source === 'setlistfm') && (
                      <SetlistAttribution url={setlist.find(entry => entry.source_url)?.source_url} />
                    )}
                  </div>
                )}

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
                  onAddMoments={handlePrimaryCtaClick}
                  onFilterChange={setMediaFilter}
                  autoAdvance={mediaFilter === 'video'}
                  onRequestNext={handleAdvanceToNext}
                />
                </div>
              </div>

              <div className="fixed inset-x-0 bottom-0 z-[1300] flex items-center gap-2 border-t border-app-line bg-app-bg/95 px-4 pb-[calc(10px+env(safe-area-inset-bottom,0px))] pt-2.5 backdrop-blur-xl">
                <button
                  type="button"
                  aria-label={followed ? 'Quitar de guardados' : 'Guardar'}
                  aria-pressed={followed}
                  disabled={followLoading}
                  onClick={handleFollowClick}
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition ${
                    followed ? 'border-app-accent bg-app-accent/15 text-app-accent' : 'border-app-line bg-app-surface text-white'
                  } ${followAnimating ? 'scale-105' : ''}`}
                >
                  {followed ? <IconBookmarkFilled className="h-5 w-5" /> : <IconBookmark className="h-5 w-5" />}
                </button>
                <button
                  type="button"
                  aria-pressed={attendanceActive}
                  disabled={attendanceLoading}
                  onClick={handleAttendanceClick}
                  className={`flex h-12 shrink-0 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition ${
                    attendanceActive
                      ? isPastEvent
                        ? 'border-[#f3bf4a] bg-[#f3bf4a]/15 text-[#f3bf4a]'
                        : 'border-[#25d47b] bg-[#25d47b]/15 text-[#25d47b]'
                      : 'border-app-line bg-app-surface text-white'
                  } ${attendanceAnimating ? 'scale-105' : ''}`}
                >
                  <IconTicket className="h-5 w-5" />
                  {attendanceLabel}
                </button>
                <Button size="lg" className="flex-1" icon={<IconPlus className="h-5 w-5" />} onClick={handlePrimaryCtaClick}>
                  Momento
                </Button>
              </div>
            </>
          )}
        <Modal isOpen={showAddMoments} onDidDismiss={() => setShowAddMoments(false)} title="Añadir momentos">
          <Content fullscreen>
            <div className="min-h-full bg-app-bg p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-bold text-white">Añadir momentos</h2>
                <button
                  type="button"
                  className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
                  onClick={() => setShowAddMoments(false)}
                  disabled={uploading}
                >
                  Cerrar
                </button>
              </div>
              {momentItems.length === 0 && (
                <p className="text-sm text-white/55">Elige fotos o vídeos para añadir momentos.</p>
              )}

              {momentItems.map(item => (
                <div
                  key={item.id}
                  className="mt-4 space-y-3 bg-white/5 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-20 w-20 overflow-hidden bg-black">
                      {item.mediaType === 'video' ? (
                        <video className="h-full w-full object-cover" muted>
                          <source src={item.previewUrl} />
                        </video>
                      ) : (
                        <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-white">{item.file.name}</p>
                      <p className="text-xs text-white/55">
                        {item.captureAt
                          ? item.captureAt.toLocaleString('es-ES', {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Hora de subida'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
                      onClick={() => handleRemoveMoment(item.id)}
                    >
                      Quitar
                    </button>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
                      Hora de captura
                    </span>
                    <input
                      type="datetime-local"
                      className="w-full bg-white/10 px-4 py-3 text-sm text-white/85 focus:outline-none"
                      value={item.manualValue}
                      onChange={e => handleMomentTimeChange(item.id, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
                    onClick={() => handleUseUploadTime(item.id)}
                  >
                    Usar hora de subida
                  </button>
                </div>
              ))}

              {uploadError && (
                <p className="text-sm text-rose-400">{uploadError}</p>
              )}
              {uploadSuccess && (
                <p className="text-sm text-emerald-400">{uploadSuccess}</p>
              )}

              {uploading && (
                <p className="text-xs text-white/55">
                  Subiendo {uploadProgress.current}/{uploadProgress.total}
                </p>
              )}

              <button
                type="button"
                className="mt-4 inline-flex w-full items-center justify-center bg-[#ff5b2e] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleUploadMoments}
                disabled={uploading || momentItems.length === 0}
              >
                {uploading ? 'Subiendo...' : 'Subir momentos'}
              </button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center bg-white/10 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={openFilePicker}
                disabled={uploading}
              >
                Añadir más
              </button>
            </div>
          </Content>
        </Modal>

        <ShareSheet isOpen={showShare} onClose={() => setShowShare(false)} link={shareUrl} />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleMomentFilesSelected}
          className="hidden"
        />
    </AppShell>
  );
};

export default EventDetail;

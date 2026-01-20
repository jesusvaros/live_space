import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonPage,
  IonContent,
  IonSpinner,
  IonModal,
} from '@ionic/react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithSetlist, Profile, VenuePlace, EventSetlistEntry } from '../lib/types';
import { eventService } from '../services/event.service';
import { useAuth } from '../contexts/AuthContext';
import { buildMomentItems, parseDatetimeLocalValue, MomentItem } from '../lib/moments';
import AppHeader from '../components/AppHeader';
import EventHero, { EventEntity } from '../components/event/EventHero';
import TimelinePlayer, { MediaFilter } from '../components/event/TimelinePlayer';
import { TimelineBucket } from '../components/event/TimelineScrubber';
import ShareSheet from '../components/ShareSheet';
import { IconCheckCircle, IconHeart, IconHeartFilled } from '../components/icons';

type EventDetailData = Event & {
  organizer?: Profile | null;
  venue?: Profile | null;
  venue_place?: VenuePlace | null;
  event_artists?: { artist: Profile | null }[];
};

const EventDetail: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user, profile, isManagementMode, activeEntity } = useAuth();
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
  const [showGatePrompt, setShowGatePrompt] = useState(false);
  const [followed, setFollowed] = useState(false);
  const [mediaFilter, setMediaFilter] = useState<MediaFilter>('video');
  const [mediaCounts, setMediaCounts] = useState({ all: 0, video: 0, image: 0 });
  const [followLoading, setFollowLoading] = useState(false);
  const [attendanceStatus, setAttendanceStatus] = useState<'going' | 'attended' | null>(null);
  const [attendanceLoading, setAttendanceLoading] = useState(false);
  const [engagementError, setEngagementError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const momentItemsRef = useRef<MomentItem[]>([]);
  const bucketCacheRef = useRef<Record<string, PostWithSetlist[]>>({});
  const bucketLoadingRef = useRef<Record<string, boolean>>({});

  const arrivedViaQr = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return Boolean(params.get('token'));
  }, [location.search]);

  useEffect(() => {
    momentItemsRef.current = momentItems;
  }, [momentItems]);

  useEffect(() => {
    return () => {
      momentItemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const loadEvent = async () => {
    setLoading(true);
    setError('');

    try {
      const { data, error: eventError } = await supabase
        .from('events')
        .select(
          `
          *,
          organizer:profiles!events_organizer_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            role
          ),
          venue:profiles!events_venue_id_fkey (
            id,
            username,
            display_name,
            avatar_url,
            role
          ),
          venue_place:venue_places!events_venue_place_id_fkey (
            id,
            name,
            city,
            address,
            latitude,
            longitude,
            website_url,
            photos
          ),
          event_artists (
            artist:profiles!event_artists_artist_id_fkey (
              id,
              username,
              display_name,
              avatar_url,
              role
            )
          )
        `
        )
        .eq('id', id)
        .single();

      if (eventError || !data) {
        setError('Event not found.');
        setEvent(null);
        return;
      }

      setEvent(data as EventDetailData);

      // Load setlist
      const setlistData = await eventService.getEventSetlist(id);
      setSetlist(setlistData);
    } catch (err) {
      setError('Could not load this event. Check your Supabase connection.');
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
      setBucketsError(err?.message || 'Could not load the timeline.');
    } finally {
      setBucketsLoading(false);
    }
  };

  const loadCounts = async () => {
    try {
      const baseQuery = supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id);
      const videoQuery = supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('media_type', 'video');
      const imageQuery = supabase
        .from('posts')
        .select('id', { count: 'exact', head: true })
        .eq('event_id', id)
        .eq('media_type', 'image');

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
        .select(
          `
          *,
          profiles:profiles!posts_user_id_fkey (
            id,
            username,
            display_name,
            avatar_url
          )
        `
        )
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
    setShowGatePrompt(false);
    loadEvent();
    loadCounts();
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
        const targetSubjectId = isManagementMode && activeEntity 
          ? activeEntity.subject_id 
          : profile?.subject_id;

        const [{ data: saveData }, { data: attendanceData }] = await Promise.all([
          supabase
            .from('event_saves')
            .select('event_id')
            .eq('event_id', id)
            .eq(targetSubjectId ? 'subject_id' : 'user_id', targetSubjectId || user.id)
            .limit(1),
          supabase
            .from('event_attendance')
            .select('status')
            .eq('event_id', id)
            .eq(targetSubjectId ? 'subject_id' : 'user_id', targetSubjectId || user.id)
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
    const pushEntity = (profile: Profile | null | undefined) => {
      if (!profile || seen.has(profile.id)) return;
      list.push({
        id: profile.id,
        name: profile.display_name || profile.username || 'Unknown',
        role: profile.role,
      });
      seen.add(profile.id);
    };

    pushEntity(event.organizer);
    pushEntity(event.venue);
    event.event_artists?.forEach(item => pushEntity(item.artist));
    return list;
  }, [event]);

  const heroTitle = useMemo(() => {
    if (!event) return 'Event';
    const getName = (profile: Profile | null | undefined) =>
      profile?.display_name || profile?.username || null;
    const artist = event.event_artists?.find(item => item.artist)?.artist;
    const artistName = getName(artist);
    const organizerName =
      event.organizer && event.organizer.role !== 'venue' ? getName(event.organizer) : null;
    return artistName || organizerName || event.name;
  }, [event]);

  const heroMeta = useMemo(() => {
    if (!event) return null;
    const venueName =
      event.venue_place?.name ||
      event.venue?.display_name ||
      event.venue?.username ||
      event.address ||
      'Venue TBA';
    const venueCity = event.venue_place?.city || event.city;
    const timeLabel = new Date(event.starts_at).toLocaleString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <span className="flex flex-wrap items-center gap-2 text-sm text-slate-400">
        {event.venue_place ? (
          <button
            type="button"
            className="font-semibold text-slate-50"
            onClick={() => history.push(`/venue/${event.venue_place?.id}`)}
          >
            {venueName}
          </button>
        ) : (
          <span className="font-semibold text-slate-50">{venueName}</span>
        )}
        <span className="text-slate-500">•</span>
        <span>{venueCity}</span>
        <span className="text-slate-500">•</span>
        <span>{timeLabel}</span>
      </span>
    );
  }, [event, history]);

  const eventStart = useMemo(() => (event ? new Date(event.starts_at) : null), [event]);
  const eventEnd = useMemo(() => (event?.ends_at ? new Date(event.ends_at) : null), [event]);

  const handleSelectEntity = (profileId: string) => {
    history.push(`/profile/${profileId}`);
  };

  const canAddMoments = Boolean(user && (arrivedViaQr || attendanceStatus));

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handlePrimaryCtaClick = () => {
    setUploadError('');
    setUploadSuccess('');

    if (!user) {
      history.push('/welcome');
      return;
    }

    if (!event) {
      setUploadError('Event not found.');
      return;
    }

    if (!canAddMoments) {
      setShowGatePrompt(true);
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
      setUploadError('Sign in to upload moments.');
      return;
    }

    if (!event) {
      setUploadError('Event not found.');
      return;
    }

    if (momentItems.length === 0) {
      setUploadError('Select at least one photo or video.');
      return;
    }

    setUploading(true);
    setUploadProgress({ current: 0, total: momentItems.length });

    try {
      for (let i = 0; i < momentItems.length; i += 1) {
        const item = momentItems[i];
        setUploadProgress({ current: i + 1, total: momentItems.length });
        const isVideo = item.mediaType === 'video';
        const ext = item.file.name.split('.').pop() || (isVideo ? 'mp4' : 'jpg');
        const folder = isVideo ? 'videos' : 'images';
        const path = `${folder}/${user.id}/${event.id}/${Date.now()}-${item.id}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('media')
          .upload(path, item.file, { cacheControl: '3600', upsert: false });

        if (uploadError) {
          throw uploadError;
        }

        const { data: publicUrl } = supabase.storage.from('media').getPublicUrl(path);

        const actorSubjectId = isManagementMode && activeEntity 
          ? activeEntity.subject_id 
          : profile?.subject_id;

        const { error: insertError } = await supabase.from('posts').insert({
          user_id: user.id,
          actor_subject_id: actorSubjectId,
          event_id: event.id,
          media_url: publicUrl.publicUrl,
          media_type: item.mediaType,
          captured_at: item.captureAt ? item.captureAt.toISOString() : null,
          capture_source: item.captureSource,
        });

        if (insertError) {
          throw insertError;
        }
      }

      setUploadSuccess('Moments uploaded!');
      setMomentItems(prev => {
        prev.forEach(item => URL.revokeObjectURL(item.previewUrl));
        return [];
      });
      setShowAddMoments(false);
      loadCounts();
      loadBuckets(mediaFilter);
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const toggleFollow = async () => {
    if (!user || !event) return;
    setEngagementError('');
    setFollowLoading(true);
    try {
      const targetSubjectId = isManagementMode && activeEntity 
        ? activeEntity.subject_id 
        : profile?.subject_id;

      if (followed) {
        const { error: deleteError } = await supabase
          .from('event_saves')
          .delete()
          .eq('event_id', event.id)
          .eq(targetSubjectId ? 'subject_id' : 'user_id', targetSubjectId || user.id);
        if (deleteError) throw deleteError;
        setFollowed(false);
      } else {
        const { error: insertError } = await supabase
          .from('event_saves')
          .insert({ 
            event_id: event.id, 
            user_id: user.id, // Keep user_id for legacy/auth tracking
            subject_id: targetSubjectId || null 
          });
        if (insertError) throw insertError;
        setFollowed(true);
      }
    } catch (err: any) {
      setEngagementError(err?.message || 'Could not update follow state.');
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
      const targetSubjectId = isManagementMode && activeEntity 
        ? activeEntity.subject_id 
        : profile?.subject_id;

      if (!options?.force && attendanceStatus === status) {
        const { error: deleteError } = await supabase
          .from('event_attendance')
          .delete()
          .eq('event_id', event.id)
          .eq(targetSubjectId ? 'subject_id' : 'user_id', targetSubjectId || user.id);
        if (deleteError) throw deleteError;
        setAttendanceStatus(null);
        return true;
      }

      const { error: upsertError } = await supabase
        .from('event_attendance')
        .upsert(
          { 
            event_id: event.id, 
            user_id: user.id, 
            subject_id: targetSubjectId || null,
            status 
          },
          { onConflict: 'event_id,subject_id' }
        );
      if (upsertError) throw upsertError;
      setAttendanceStatus(status);
      return true;
    } catch (err: any) {
      setEngagementError(err?.message || 'Could not update attendance.');
      return false;
    } finally {
      setAttendanceLoading(false);
    }
  };

  const handleGateConfirm = async () => {
    if (!user) {
      history.push('/welcome');
      return;
    }
    const success = await updateAttendance('attended', { force: true });
    if (success) {
      setShowGatePrompt(false);
      openFilePicker();
    }
  };

  const shareUrl = event
    ? `${window.location.origin}/event/${event.id}${event.qr_token ? `?token=${event.qr_token}` : ''}`
    : '';
  const now = new Date();
  const isPastEvent = eventStart
    ? eventEnd
      ? now > eventEnd
      : now.getTime() > eventStart.getTime() + 6 * 60 * 60 * 1000
    : false;
  const attendanceTarget: 'going' | 'attended' = isPastEvent ? 'attended' : 'going';
  const attendanceLabel = isPastEvent ? 'I went' : "I'm here";
  const attendanceActive = attendanceStatus === attendanceTarget;

  const handleFollowClick = () => {
    if (!user) {
      history.push('/welcome');
      return;
    }
    toggleFollow();
  };

  const handleAttendanceClick = () => {
    if (!user) {
      history.push('/welcome');
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
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <IonSpinner name="crescent" />
              </div>
            )}

            {!loading && error && (
              <p className="text-sm text-rose-400">{error}</p>
            )}

            {!loading && event && (
              <>
                <EventHero
                  title={heroTitle}
                  meta={heroMeta}
                  entities={entities}
                  onSelectEntity={handleSelectEntity}
                  coverImageUrl={event.cover_image_url ?? undefined}
                  actions={
                    <>
                      <button
                        type="button"
                        className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold text-white transition ${
                          followed ? 'bg-white/20' : 'bg-white/10'
                        }`}
                        onClick={handleFollowClick}
                        disabled={followLoading}
                        aria-pressed={followed}
                      >
                        {followed ? <IconHeartFilled className="h-4 w-4" /> : <IconHeart className="h-4 w-4" />}
                        <span>Like</span>
                      </button>
                      <button
                        type="button"
                        className={`flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-semibold text-white transition ${
                          attendanceActive ? 'bg-white/20' : 'bg-white/10'
                        }`}
                        onClick={handleAttendanceClick}
                        disabled={attendanceLoading}
                        aria-pressed={attendanceActive}
                      >
                        <IconCheckCircle className="h-4 w-4" />
                        <span>{attendanceLabel}</span>
                      </button>
                    </>
                  }
                />

                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    className={`inline-flex w-full items-center justify-center rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                      canAddMoments
                        ? 'bg-[#ff6b4a] text-white'
                        : 'border border-[#ff6b4a]/40 text-[#ffd1c4]'
                    }`}
                    onClick={handlePrimaryCtaClick}
                  >
                    Add moments
                  </button>
                  {user && !canAddMoments && (
                    <p className="text-xs text-slate-400">
                      Mark "I went" to unlock uploads.
                    </p>
                  )}
                </div>

                {engagementError && (
                  <p className="text-sm text-rose-400">{engagementError}</p>
                )}

                {bucketsError && (
                  <p className="text-sm text-rose-400">{bucketsError}</p>
                )}

                {setlist.length > 0 && (
                  <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/5 p-4">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                      Official Setlist
                    </h3>
                    <div className="flex flex-col gap-2 mt-1">
                      {setlist.map((entry) => (
                        <div key={entry.ordinal} className="flex items-center justify-between text-xs">
                          <span className="text-slate-300">
                            <span className="text-slate-500 mr-2">{entry.ordinal}.</span>
                            {entry.song_title || 'Unknown Song'}
                          </span>
                        </div>
                      ))}
                    </div>
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
              </>
            )}
          </div>
        </div>

        <IonModal isOpen={showAddMoments} onDidDismiss={() => setShowAddMoments(false)}>
          <IonContent fullscreen>
            <div className="flex flex-col gap-4 rounded-3xl bg-[#141824] p-5 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-semibold text-slate-50">Add moments</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                  onClick={() => setShowAddMoments(false)}
                  disabled={uploading}
                >
                  Close
                </button>
              </div>
              {momentItems.length === 0 && (
                <p className="text-sm text-slate-400">Select photos or videos to add moments.</p>
              )}

              {momentItems.map(item => (
                <div
                  key={item.id}
                  className="space-y-3 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-20 w-20 overflow-hidden rounded-2xl bg-slate-900">
                      {item.mediaType === 'video' ? (
                        <video className="h-full w-full object-cover" muted>
                          <source src={item.previewUrl} />
                        </video>
                      ) : (
                        <img src={item.previewUrl} alt={item.file.name} className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="text-sm font-semibold text-slate-50">{item.file.name}</p>
                      <p className="text-xs text-slate-400">
                        {item.captureAt
                          ? item.captureAt.toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : 'Upload time'}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                      onClick={() => handleRemoveMoment(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Captured time
                    </span>
                    <input
                      type="datetime-local"
                      className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                      value={item.manualValue}
                      onChange={e => handleMomentTimeChange(item.id, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                    onClick={() => handleUseUploadTime(item.id)}
                  >
                    Use upload time
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
                <p className="text-xs text-slate-400">
                  Uploading {uploadProgress.current}/{uploadProgress.total}
                </p>
              )}

              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleUploadMoments}
                disabled={uploading || momentItems.length === 0}
              >
                {uploading ? 'Uploading...' : 'Upload moments'}
              </button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-[#ff6b4a]/40 px-4 py-2 text-sm font-semibold text-[#ffd1c4] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={openFilePicker}
                disabled={uploading}
              >
                Add more
              </button>
            </div>
          </IonContent>
        </IonModal>

        <IonModal
          isOpen={showGatePrompt}
          onDidDismiss={() => setShowGatePrompt(false)}
          initialBreakpoint={0.45}
          breakpoints={[0, 0.45, 0.7]}
          className="gate-sheet"
        >
          <IonContent fullscreen>
            <div className="flex flex-col gap-4 rounded-3xl bg-[#141824] p-5 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-semibold text-slate-50">Unlock moments</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-transparent px-3 py-1.5 text-xs font-semibold text-[#ffd1c4]"
                  onClick={() => setShowGatePrompt(false)}
                  disabled={attendanceLoading}
                >
                  Close
                </button>
              </div>
              <p className="text-sm text-slate-400">
                Mark "I went" to add moments for this event.
              </p>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleGateConfirm}
                disabled={attendanceLoading}
              >
                {attendanceLoading ? 'Marking...' : 'Mark I went'}
              </button>
              <button
                type="button"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-[#ffd1c4] disabled:cursor-not-allowed disabled:opacity-60"
                onClick={() => setShowGatePrompt(false)}
                disabled={attendanceLoading}
              >
                Not now
              </button>
            </div>
          </IonContent>
        </IonModal>

        <ShareSheet isOpen={showShare} onClose={() => setShowShare(false)} link={shareUrl} />

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleMomentFilesSelected}
          className="hidden"
        />
      </IonContent>
    </IonPage>
  );
};

export default EventDetail;

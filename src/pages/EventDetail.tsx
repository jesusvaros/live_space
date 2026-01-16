import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IonPage,
  IonContent,
  IonSpinner,
  IonModal,
} from '@ionic/react';
import { useHistory, useLocation, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithRelations, Profile, VenuePlace } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { buildMomentItems, parseDatetimeLocalValue, MomentItem } from '../lib/moments';
import AppHeader from '../components/AppHeader';
import EventHero, { EventEntity } from '../components/event/EventHero';
import TimelinePlayer, { MediaFilter } from '../components/event/TimelinePlayer';
import SecondaryActions from '../components/event/SecondaryActions';
import { TimelineBucket } from '../components/event/TimelineScrubber';
import ShareSheet from '../components/ShareSheet';

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
  const { user, profile } = useAuth();
  const [event, setEvent] = useState<EventDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buckets, setBuckets] = useState<TimelineBucket[]>([]);
  const [bucketsLoading, setBucketsLoading] = useState(false);
  const [bucketsError, setBucketsError] = useState('');
  const [bucketMoments, setBucketMoments] = useState<PostWithRelations[]>([]);
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
  const bucketCacheRef = useRef<Record<string, PostWithRelations[]>>({});
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
        .from('posts')
        .select(
          `
          id,
          media_url,
          media_type,
          thumbnail_url,
          caption,
          captured_at,
          capture_source,
          created_at,
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
        .order('captured_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });

      if (filter !== 'all') {
        query = query.eq('media_type', filter);
      }

      const { data, error: bucketError } = await query;

      if (bucketError) {
        throw bucketError;
      }

      const moments = (data || []) as PostWithRelations[];
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
        const [{ data: saveData }, { data: attendanceData }] = await Promise.all([
          supabase
            .from('event_saves')
            .select('event_id')
            .eq('event_id', id)
            .eq('user_id', user.id)
            .limit(1),
          supabase
            .from('event_attendance')
            .select('status')
            .eq('event_id', id)
            .eq('user_id', user.id)
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
      <span className="event-meta-line">
        {event.venue_place ? (
          <button
            type="button"
            className="event-meta-link"
            onClick={() => history.push(`/venue/${event.venue_place?.id}`)}
          >
            {venueName}
          </button>
        ) : (
          <span>{venueName}</span>
        )}
        <span className="event-meta-dot">•</span>
        <span>{venueCity}</span>
        <span className="event-meta-dot">•</span>
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

        const { error: insertError } = await supabase.from('posts').insert({
          user_id: user.id,
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
      if (followed) {
        const { error: deleteError } = await supabase
          .from('event_saves')
          .delete()
          .eq('event_id', event.id)
          .eq('user_id', user.id);
        if (deleteError) throw deleteError;
        setFollowed(false);
      } else {
        const { error: insertError } = await supabase
          .from('event_saves')
          .insert({ event_id: event.id, user_id: user.id });
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
      if (!options?.force && attendanceStatus === status) {
        const { error: deleteError } = await supabase
          .from('event_attendance')
          .delete()
          .eq('event_id', event.id)
          .eq('user_id', user.id);
        if (deleteError) throw deleteError;
        setAttendanceStatus(null);
        return true;
      }

      const { error: upsertError } = await supabase
        .from('event_attendance')
        .upsert(
          { event_id: event.id, user_id: user.id, status },
          { onConflict: 'event_id,user_id' }
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
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
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
                />

                <div className="event-cta">
                  <button
                    type="button"
                    className={`app-button app-button--block primary-cta ${canAddMoments ? '' : 'is-muted'} ${
                      canAddMoments ? '' : 'app-button--outline'
                    }`}
                    onClick={handlePrimaryCtaClick}
                  >
                    Add moments
                  </button>
                  {user && !canAddMoments && (
                    <p className="event-cta-hint">
                      Mark "I went" to unlock uploads.
                    </p>
                  )}
                </div>

                <SecondaryActions
                  followed={followed}
                  attendanceActive={attendanceActive}
                  attendanceLabel={attendanceLabel}
                  followLoading={followLoading}
                  attendanceLoading={attendanceLoading}
                  onToggleFollow={handleFollowClick}
                  onToggleAttendance={handleAttendanceClick}
                  onShare={() => setShowShare(true)}
                />

                {engagementError && (
                  <p className="text-sm text-rose-400">{engagementError}</p>
                )}

                {bucketsError && (
                  <p className="text-sm text-rose-400">{bucketsError}</p>
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
            <div className="app-modal">
              <div className="app-modal-header">
                <h2 className="app-modal-title">Add moments</h2>
                <button
                  type="button"
                  className="app-button app-button--ghost app-button--small"
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
                <div key={item.id} className="app-card space-y-3 p-4">
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
                      className="app-button app-button--ghost app-button--small"
                      onClick={() => handleRemoveMoment(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                  <label className="app-field">
                    <span className="app-label">Captured time</span>
                    <input
                      type="datetime-local"
                      className="app-input"
                      value={item.manualValue}
                      onChange={e => handleMomentTimeChange(item.id, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="app-button app-button--ghost app-button--small"
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
                className="app-button app-button--block"
                onClick={handleUploadMoments}
                disabled={uploading || momentItems.length === 0}
              >
                {uploading ? 'Uploading...' : 'Upload moments'}
              </button>
              <button
                type="button"
                className="app-button app-button--outline app-button--block"
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
            <div className="app-modal">
              <div className="app-modal-header">
                <h2 className="app-modal-title">Unlock moments</h2>
                <button
                  type="button"
                  className="app-button app-button--ghost app-button--small"
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
                className="app-button app-button--block"
                onClick={handleGateConfirm}
                disabled={attendanceLoading}
              >
                {attendanceLoading ? 'Marking...' : 'Mark I went'}
              </button>
              <button
                type="button"
                className="app-button app-button--ghost app-button--block"
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

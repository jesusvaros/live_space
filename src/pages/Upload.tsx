import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  IonPage,
  IonContent,
  IonSpinner,
  IonModal,
} from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, VenuePlace } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import QrScanner from '../components/QrScanner';
import { buildMomentItems, parseDatetimeLocalValue, MomentItem } from '../lib/moments';
import AppHeader from '../components/AppHeader';
import EventPosterTile from '../components/EventPosterTile';

type NearbyEvent = {
  event: EventWithVenue;
  distanceKm: number | null;
};

type EventWithVenue = Event & {
  venue_place?: VenuePlace | null;
};

const toNumber = (value: number | string | null) => {
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return value;
};

const toRadians = (value: number) => (value * Math.PI) / 180;

const distanceKm = (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  const earthRadiusKm = 6371;
  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a));
};

const formatEventDate = (event: Event) =>
  new Date(event.starts_at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatMomentTime = (value: Date | null) => {
  if (!value) return 'Upload time';
  if (Number.isNaN(value.getTime())) return 'Upload time';
  return value.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getCaptureLabel = (source: string | null, capturedAt: Date | null) => {
  if (!capturedAt) return 'Upload time';
  if (source === 'exif') return 'EXIF';
  if (source === 'file.lastModified') return 'Device time';
  if (source === 'video.metadata') return 'Video metadata';
  if (source === 'manual') return 'Manual';
  return 'Captured';
};

const Upload: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { user, profile, isManagementMode, activeEntity } = useAuth();
  const [events, setEvents] = useState<EventWithVenue[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [eventsError, setEventsError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedEvent, setSelectedEvent] = useState<EventWithVenue | null>(null);
  const [showScanner, setShowScanner] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState('');
  const [momentItems, setMomentItems] = useState<MomentItem[]>([]);
  const [showAddMoments, setShowAddMoments] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadError, setUploadError] = useState('');
  const [uploadSuccess, setUploadSuccess] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const momentItemsRef = useRef<MomentItem[]>([]);
  const selectedFromQueryRef = useRef(false);

  useEffect(() => {
    const loadEvents = async () => {
      setLoadingEvents(true);
      setEventsError('');
      try {
        const { data, error } = await supabase
          .from('events')
          .select(
            `
            *,
            venue_place:venue_places!events_venue_place_id_fkey (
              id,
              name,
              city,
              address,
              latitude,
              longitude
            )
            `
          )
          .order('starts_at', { ascending: true });
        if (error) throw error;
        setEvents((data || []) as Event[]);
      } catch (err) {
        setEvents([]);
        setEventsError('Could not load events. Check your Supabase connection.');
      } finally {
        setLoadingEvents(false);
      }
    };
    loadEvents();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Location not available.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      position => {
        setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
      },
      () => setLocationError('Enable location to see nearby events.'),
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const eventParam = params.get('event');
    if (!eventParam || selectedFromQueryRef.current) return;
    const selectFromQuery = async () => {
      await selectEventById(eventParam);
      selectedFromQueryRef.current = true;
    };
    if (!loadingEvents) {
      selectFromQuery();
    }
  }, [location.search, loadingEvents]);

  useEffect(() => {
    momentItemsRef.current = momentItems;
  }, [momentItems]);

  useEffect(() => {
    return () => {
      momentItemsRef.current.forEach(item => URL.revokeObjectURL(item.previewUrl));
    };
  }, []);

  const filteredEvents = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return events.filter(event =>
      event.name.toLowerCase().includes(query) ||
      event.city.toLowerCase().includes(query) ||
      event.venue_place?.name?.toLowerCase().includes(query) ||
      event.venue_place?.city?.toLowerCase().includes(query) ||
      event.address?.toLowerCase().includes(query)
    );
  }, [events, search]);

  const recentEvents = useMemo(() => {
    const now = new Date();
    return events
      .filter(event => new Date(event.starts_at) >= now)
      .slice(0, 6);
  }, [events]);

  const nearbyEvents = useMemo<NearbyEvent[]>(() => {
    if (userLocation) {
      return events
        .flatMap(event => {
          const lat = toNumber(event.latitude);
          const lng = toNumber(event.longitude);
          if (lat === null || lng === null) return [];
          return [{ event, distanceKm: distanceKm(userLocation, { lat, lng }) }];
        })
        .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
        .slice(0, 6);
    }

    if (profile?.primary_city) {
      const city = profile.primary_city.toLowerCase();
      return events
        .filter(event => event.city.toLowerCase() === city)
        .slice(0, 6)
        .map(event => ({ event, distanceKm: null }));
    }

    return [];
  }, [events, userLocation, profile]);

  const handleSelectEvent = (event: Event) => {
    setSelectedEvent(event);
    setMomentItems(prev => {
      prev.forEach(item => URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setUploadError('');
    setUploadSuccess('');
  };

  const selectEventById = async (eventId: string) => {
    const existing = events.find(event => event.id === eventId);
    if (existing) {
      handleSelectEvent(existing);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('events')
        .select(
          `
          *,
          venue_place:venue_places!events_venue_place_id_fkey (
            id,
            name,
            city,
            address,
            latitude,
            longitude
          )
          `
        )
        .eq('id', eventId)
        .single();
      if (error || !data) throw error;
      handleSelectEvent(data as EventWithVenue);
    } catch {
      setEventsError('Event not found for that QR code.');
    }
  };

  const handleQrDetected = async (value: string) => {
    setEventsError('');
    let eventId = value.trim();
    try {
      const url = new URL(value);
      const parts = url.pathname.split('/').filter(Boolean);
      eventId = parts[parts.length - 1] || '';
    } catch {
      // Not a URL, treat as raw event id.
    }

    if (!eventId) {
      setEventsError('Invalid QR code.');
      return;
    }

    await selectEventById(eventId);
    setShowScanner(false);
  };

  const handleAddMomentsClick = () => {
    setUploadError('');
    setUploadSuccess('');

    if (!user) {
      setUploadError('Sign in to upload moments.');
      return;
    }

    if (!selectedEvent) {
      setUploadError('Select an event first.');
      return;
    }

    fileInputRef.current?.click();
  };

  const handleMomentFilesSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const items = await buildMomentItems(files);
    setMomentItems(prev => [...prev, ...items]);
    setShowAddMoments(true);
    event.target.value = '';
  };

  const handleMomentTimeChange = (id: string, value: string) => {
    const parsed = parseDatetimeLocalValue(value);
    setMomentItems(prev =>
      prev.map(item =>
        item.id === id
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

  const handleUseUploadTime = (id: string) => {
    setMomentItems(prev =>
      prev.map(item =>
        item.id === id
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

  const handleRemoveMoment = (id: string) => {
    setMomentItems(prev => {
      const target = prev.find(item => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter(item => item.id !== id);
    });
  };

  const handleUploadMoments = async () => {
    setUploadError('');
    setUploadSuccess('');

    if (!user || !selectedEvent) {
      setUploadError('Sign in and select an event first.');
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
        const path = `${folder}/${user.id}/${selectedEvent.id}/${Date.now()}-${item.id}.${ext}`;

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
          event_id: selectedEvent.id,
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
    } catch (err: any) {
      setUploadError(err?.message || 'Upload failed. Try again.');
    } finally {
      setUploading(false);
    }
  };

  const renderEventTile = (event: EventWithVenue, opts?: { badge?: string; className?: string }) => (
    <EventPosterTile
      key={event.id}
      event={event}
      className={opts?.className}
      title={event.name}
      subtitle={event.venue_place?.name || event.address || 'Venue'}
      kicker={formatEventDate(event)}
      badge={opts?.badge}
      onSelect={selected => handleSelectEvent(selected)}
    />
  );

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="animate-fade-up motion-reduce:animate-none">
              <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Add moments</p>
              <h2 className="mt-2 font-display text-2xl font-bold text-white">What did it feel like?</h2>
              <p className="mt-2 text-sm text-white/70">Pick the show, then drop your photos and clips.</p>
            </div>

          {loadingEvents && (
            <div className="flex items-center justify-center py-8">
              <IonSpinner name="crescent" />
            </div>
          )}

          {eventsError && (
            <p className="text-sm text-rose-400">{eventsError}</p>
          )}

          {!selectedEvent && !loadingEvents && (
            <div className="mt-4 space-y-6">
              <div className="space-y-3">
                <input
                  type="search"
                  placeholder="Search events"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                />
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                  onClick={() => setShowScanner(true)}
                >
                  Scan event QR
                </button>
              </div>

              {search.trim() ? (
                <section className="space-y-3">
                  <h3 className="font-display text-lg font-bold text-white">Search results</h3>
                  {filteredEvents.length === 0 ? (
                    <p className="text-sm text-white/60">No events match that search.</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {filteredEvents.map(event => renderEventTile(event, { className: 'w-full' }))}
                    </div>
                  )}
                </section>
              ) : (
                <>
                  <section className="space-y-3">
                    <div>
                      <h3 className="font-display text-lg font-bold text-white">Nearby</h3>
                      <p className="text-xs text-white/60">
                        {userLocation ? 'Closest to you.' : locationError || 'Based on your profile city.'}
                      </p>
                    </div>
                    {nearbyEvents.length === 0 ? (
                      <p className="text-sm text-white/60">
                        No nearby events yet. Try searching or scanning a QR.
                      </p>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {nearbyEvents.map(item =>
                          renderEventTile(item.event, {
                            badge: item.distanceKm ? `${item.distanceKm.toFixed(1)} km` : undefined,
                          })
                        )}
                      </div>
                    )}
                  </section>

                  <section className="space-y-3">
                    <div>
                      <h3 className="font-display text-lg font-bold text-white">Upcoming</h3>
                      <p className="text-xs text-white/60">Shows worth remembering.</p>
                    </div>
                    {recentEvents.length === 0 ? (
                      <p className="text-sm text-white/60">No upcoming events yet.</p>
                    ) : (
                      <div className="flex gap-3 overflow-x-auto pb-1">
                        {recentEvents.map(event => renderEventTile(event))}
                      </div>
                    )}
                  </section>
                </>
              )}
            </div>
          )}

          {selectedEvent && (
            <div className="mt-4 space-y-4">
              <div className="relative -mx-4 aspect-[16/9] overflow-hidden bg-black">
                {selectedEvent.cover_image_url ? (
                  <img src={selectedEvent.cover_image_url} alt={selectedEvent.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="absolute inset-0 bg-black" />
                )}
                <div className="absolute inset-x-0 bottom-0 bg-black/70 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">
                    {selectedEvent.venue_place?.city || selectedEvent.city}
                  </p>
                  <h3 className="mt-2 font-display text-xl font-bold text-white">{selectedEvent.name}</h3>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-white/75">
                    {selectedEvent.venue_place?.name || selectedEvent.address || 'Venue'} · {formatEventDate(selectedEvent)}
                  </p>
                </div>
              </div>

              {user ? (
                <>
                  <button
                    type="button"
                    className="inline-flex w-full items-center justify-center rounded-2xl bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white"
                    onClick={handleAddMomentsClick}
                  >
                    Add moments
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={handleMomentFilesSelected}
                    className="hidden"
                  />
                </>
              ) : (
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
                  onClick={() => history.push('/welcome')}
                >
                  Sign in to upload
                </button>
              )}

              <button
                type="button"
                className="inline-flex w-full items-center justify-center px-4 py-2 text-sm font-semibold text-white/70 transition hover:text-white"
                onClick={() => setSelectedEvent(null)}
              >
                Choose another event
              </button>

              {uploadError && (
                <p className="text-sm text-rose-400">{uploadError}</p>
              )}
              {uploadSuccess && (
                <p className="text-sm text-emerald-400">{uploadSuccess}</p>
              )}
            </div>
          )}
          </div>
        </div>

        <IonModal isOpen={showScanner} onDidDismiss={() => setShowScanner(false)}>
          <IonContent fullscreen>
            <div className="flex flex-col gap-4 rounded-3xl bg-app-bg p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-bold text-white">Scan QR</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  onClick={() => setShowScanner(false)}
                >
                  Close
                </button>
              </div>
              <QrScanner onDetected={handleQrDetected} />
            </div>
          </IonContent>
        </IonModal>

        <IonModal isOpen={showAddMoments} onDidDismiss={() => setShowAddMoments(false)}>
          <IonContent fullscreen>
            <div className="flex flex-col gap-4 rounded-3xl bg-app-bg p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="font-display text-lg font-bold text-white">Add moments</h2>
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-white/15"
                  onClick={() => setShowAddMoments(false)}
                  disabled={uploading}
                >
                  Close
                </button>
              </div>
              {momentItems.length === 0 && (
                <p className="text-sm text-white/70">Select photos or videos to add moments.</p>
              )}

              {momentItems.map(item => {
                const captureTimeLabel = formatMomentTime(item.captureAt);
                return (
                  <div
                    key={item.id}
                    className="space-y-3 rounded-2xl bg-white/5 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-20 w-20 overflow-hidden rounded-2xl bg-black/30">
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
                        <p className="text-xs text-white/60">
                          {captureTimeLabel} · {getCaptureLabel(item.captureSource, item.captureAt)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
                        onClick={() => handleRemoveMoment(item.id)}
                      >
                        Remove
                      </button>
                    </div>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                        Captured time
                      </span>
                      <input
                        type="datetime-local"
                        value={item.manualValue}
                        onChange={e => handleMomentTimeChange(item.id, e.target.value)}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
                      />
                    </label>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
                      onClick={() => handleUseUploadTime(item.id)}
                    >
                      Use upload time
                    </button>
                  </div>
                );
              })}

              {uploadError && (
                <p className="text-sm text-rose-400">{uploadError}</p>
              )}
              {uploadSuccess && (
                <p className="text-sm text-emerald-400">{uploadSuccess}</p>
              )}

              {uploading && (
                <p className="text-xs text-white/60">
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
                className="inline-flex w-full items-center justify-center rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                onClick={handleAddMomentsClick}
                disabled={uploading}
              >
                Add more
              </button>
            </div>
          </IonContent>
        </IonModal>
      </IonContent>
    </IonPage>
  );
};

export default Upload;

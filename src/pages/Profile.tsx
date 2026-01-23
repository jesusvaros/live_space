import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithSetlist, ProfileRole } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import AppHeader from '../components/AppHeader';
import EventPosterTile from '../components/EventPosterTile';
import { IconCalendar, IconEdit, IconHeart, IconLogout, IconPlay, IconBriefcase } from '../components/icons';

const Profile: React.FC = () => {
  const { 
    user, 
    profile, 
    updateProfile, 
    signOut, 
    refreshProfile
  } = useAuth();

  const {
    managedEntities,
    activeWorkspace: activeEntity,
    setActiveWorkspace: setActiveEntity,
  } = useWorkspace();

  const [isManagementMode, setIsManagementMode] = useState(false);
  const setManagementMode = (val: boolean) => setIsManagementMode(val);

  const history = useHistory();
  const location = useLocation();
  const isDev = Boolean((import.meta as any).env?.DEV);

  const [posts, setPosts] = useState<PostWithSetlist[]>([]);
  const [likedEvents, setLikedEvents] = useState<Event[]>([]);
  const [attendedEvents, setAttendedEvents] = useState<Event[]>([]);
  const [artistEvents, setArtistEvents] = useState<Event[]>([]);
  const [venueEvents, setVenueEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState<'liked' | 'attended' | 'moments'>('liked');
  const [showEdit, setShowEdit] = useState(false);
  const [displayName, setDisplayName] = useState(profile?.display_name || '');
  const [username, setUsername] = useState(profile?.username || '');
  const [primaryCity, setPrimaryCity] = useState(profile?.primary_city || '');
  const [bio, setBio] = useState(profile?.bio || '');
  const [role, setRole] = useState<ProfileRole>(profile?.role || 'user');
  const [linkWebsite, setLinkWebsite] = useState(profile?.external_links?.website || '');
  const [linkInstagram, setLinkInstagram] = useState(profile?.external_links?.instagram || '');
  const [linkSpotify, setLinkSpotify] = useState(profile?.external_links?.spotify || '');
  
  const [selectedVenuePlaceId, setSelectedVenuePlaceId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueWebsite, setVenueWebsite] = useState('');
  const [venueCapacity, setVenueCapacity] = useState('');
  const [venueType, setVenueType] = useState('');
  const [venueLatitude, setVenueLatitude] = useState('');
  const [venueLongitude, setVenueLongitude] = useState('');
  const [venuePhotos, setVenuePhotos] = useState('');
  const [message, setMessage] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    setIsManagementMode(Boolean(activeEntity));
  }, [activeEntity]);

  useEffect(() => {
    if (!activeEntity) return;
    // Route to entity-specific profile pages when acting as an entity
    if (activeEntity.type === 'artist' && activeEntity.artist?.id) {
      const artistPath = `/tabs/artist/${activeEntity.artist.id}`;
      if (!location.pathname.startsWith(artistPath)) {
        history.replace(artistPath);
      }
    } else if (activeEntity.type === 'venue' && activeEntity.venue?.id) {
      const venuePath = `/tabs/venue/${activeEntity.venue.id}`;
      if (!location.pathname.startsWith(venuePath)) {
        history.replace(venuePath);
      }
    }
  }, [activeEntity, history, location.pathname]);

  const activeProfile = isManagementMode && activeEntity 
    ? (activeEntity.type === 'user' ? activeEntity.profile : null)
    : profile;

  const lastLoadedRef = React.useRef<string>('');

  const loadProfileData = async (isManualRefresh = false) => {
    if (!user?.id) return;
    
    const loadContext = `${user.id}-${isManagementMode}-${activeEntity?.subject_id}`;
    if (!isManualRefresh && lastLoadedRef.current === loadContext) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const eventCardSelect = `
        id,
        name,
        city,
        address,
        starts_at,
        cover_image_url,
        venue_place:venue_places!events_venue_place_id_fkey (
          id,
          name,
          city,
          address
        ),
        event_artists (
          artist:artists!event_artists_artist_entity_fk (
            id,
            name,
            avatar_url
          )
        )
      `;

      // Use a local variable to check if we're still relevant after async calls
      const currentContext = loadContext;

      // Load posts (moments shared) - if management mode, show posts BY that actor
      let postsQuery = supabase
        .from('posts')
        .select('id, media_url, media_type, caption, created_at, event_offset_ms, song_title');
      
      if (isManagementMode && activeEntity) {
        postsQuery = postsQuery.eq('actor_subject_id', activeEntity.subject_id);
      } else {
        postsQuery = postsQuery.eq('user_id', user.id);
      }

      const [postsRes, likedRes, attendedRes] = await Promise.all([
        postsQuery.order('created_at', { ascending: false }).limit(12),
        supabase.from('event_saves').select(`events!inner (${eventCardSelect})`).eq('user_id', user.id),
        supabase.from('event_attendance').select(`status, events!inner (${eventCardSelect})`).eq('user_id', user.id)
      ]);

      if (lastLoadedRef.current !== currentContext && !isManualRefresh) return;

      const postsData = postsRes.data;
      const likedData = likedRes.data;
      const attendedData = attendedRes.data;

      // Load role-specific data based on ACTIVE role
      let artistEvents: Event[] = [];
      let venueEvents: Event[] = [];

      const activeRole = isManagementMode && activeEntity ? activeEntity.type : profile?.role;

      if (activeRole === 'artist') {
        const artistEntityId = isManagementMode && activeEntity ? activeEntity.artist?.id : null;
        if (artistEntityId) {
          const { data: artistEventData } = await supabase
            .from('event_artists')
            .select(`
                events!inner (
                  ${eventCardSelect}
                )
              `)
            .eq('artist_entity_id', artistEntityId);

          artistEvents = (artistEventData || [])
            .map((item: any) => item.events)
            .filter((event: any): event is Event => Boolean(event));
        }
      }

      if (activeRole === 'venue') {
        const venuePlaceId = isManagementMode && activeEntity 
          ? activeEntity.venue?.id 
          : null;

        if (venuePlaceId) {
          const { data: venueEventData } = await supabase
            .from('events')
            .select(eventCardSelect)
            .eq('venue_place_id', venuePlaceId)
            .order('starts_at', { ascending: false });

          venueEvents = (venueEventData || []) as unknown as Event[];
        }
      }

      if (lastLoadedRef.current !== currentContext && !isManualRefresh) return;

      setPosts((postsData || []) as PostWithSetlist[]);
      const liked = (likedData || [])
        .map((item: any) => item.events)
        .filter((event: any): event is Event => Boolean(event));
      const attended = (attendedData || [])
        .map((item: any) => item.events)
        .filter((event: any): event is Event => Boolean(event));
      
      setLikedEvents(liked);
      setAttendedEvents([...attended, ...artistEvents]);
      setArtistEvents(artistEvents);
      setVenueEvents(venueEvents);
      lastLoadedRef.current = currentContext;
    } catch (err) {
      setError('Could not load profile data. Check your Supabase connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      loadProfileData();
    }
  }, [user?.id, profile?.role, isManagementMode, activeEntity?.subject_id]);

  useEffect(() => {
    setDisplayName(profile?.display_name || '');
    setUsername(profile?.username || '');
    setPrimaryCity(profile?.primary_city || '');
    setBio(profile?.bio || '');
    setRole(profile?.role || 'user');
    setLinkWebsite(profile?.external_links?.website || '');
    setLinkInstagram(profile?.external_links?.instagram || '');
    setLinkSpotify(profile?.external_links?.spotify || '');
  }, [profile]);

  const selectedVenuePlace = managedEntities.find(ent => ent.venue?.id === selectedVenuePlaceId)?.venue || null;
  const displayVenue = selectedVenuePlace ?? managedEntities.find(ent => ent.type === 'venue')?.venue ?? null;

  useEffect(() => {
    if (!selectedVenuePlace) {
      setVenueName('');
      setVenueCity('');
      setVenueAddress('');
      setVenueWebsite('');
      setVenueCapacity('');
      setVenueType('');
      setVenueLatitude('');
      setVenueLongitude('');
      setVenuePhotos('');
      return;
    }
    setVenueName(selectedVenuePlace.name || '');
    setVenueCity(selectedVenuePlace.city || '');
    setVenueAddress(selectedVenuePlace.address || '');
    setVenueWebsite(selectedVenuePlace.website_url || '');
    setVenueCapacity(
      selectedVenuePlace.capacity !== null ? selectedVenuePlace.capacity.toString() : ''
    );
    setVenueType(selectedVenuePlace.venue_type || '');
    setVenueLatitude(
      selectedVenuePlace.latitude !== null ? selectedVenuePlace.latitude.toString() : ''
    );
    setVenueLongitude(
      selectedVenuePlace.longitude !== null ? selectedVenuePlace.longitude.toString() : ''
    );
    setVenuePhotos((selectedVenuePlace.photos || []).join('\n'));
  }, [selectedVenuePlace]);

  const parseCoordinate = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? null : parsed;
  };

  const parseInteger = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return null;
    return Math.round(parsed);
  };

  const handleSave = async () => {
    setFormError('');
    setMessage('');
    setSaving(true);

    const nextLinks: any = {
      ...(activeProfile?.external_links || {}),
    };

    const applyLink = (key: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        nextLinks[key] = trimmed;
      } else {
        delete nextLinks[key];
      }
    };

    applyLink('website', linkWebsite);
    applyLink('instagram', linkInstagram);
    applyLink('spotify', linkSpotify);

    const updates: any = {
      display_name: displayName || null,
      username: username || null,
      primary_city: primaryCity || null,
      bio: bio || null,
      external_links: nextLinks,
    };

    if (isDev) {
      updates.role = role;
    }

    // If management mode, we should update the entity instead of the user profile
    // For now, let's keep it simple and update the personal profile.
    // TODO: Implement entity update logic (artist/venue)

    const { error: updateError } = await updateProfile(updates);

    if (updateError) {
      setFormError(updateError.message);
      setSaving(false);
      return;
    }

    if (profile?.role === 'venue' && user && selectedVenuePlaceId) {
      if (!venueName.trim() || !venueCity.trim()) {
        setFormError('Venue name and city are required.');
        setSaving(false);
        return;
      }
      const photoList = venuePhotos
        .split(/\n|,/)
        .map(item => item.trim())
        .filter(Boolean);

      const { error: venueError } = await supabase
        .from('venue_places')
        .update({
          name: venueName.trim() || null,
          city: venueCity.trim() || primaryCity || '',
          address: venueAddress.trim() || null,
          website_url: venueWebsite.trim() || null,
          capacity: parseInteger(venueCapacity),
          venue_type: venueType.trim() || null,
          latitude: parseCoordinate(venueLatitude),
          longitude: parseCoordinate(venueLongitude),
          photos: photoList,
        })
        .eq('id', selectedVenuePlaceId);

      if (venueError) {
        setFormError(venueError.message);
        setSaving(false);
        return;
      }
    }

    await refreshProfile();
    await loadProfileData();
    setMessage('Profile updated.');
    setShowEdit(false);
    setSaving(false);
  };

  const handleSignOut = async () => {
    setFormError('');
    setMessage('');
    setSigningOut(true);
    try {
      await signOut();
      history.replace('/welcome');
    } catch (err) {
      setFormError('Sign out failed. Check your Supabase connection.');
    } finally {
      setSigningOut(false);
    }
  };

  // Get tab label based on user role
  const getAttendedTabLabel = () => {
    if (profile?.role === 'artist') return 'Concerts';
    if (profile?.role === 'venue') return 'Events';
    return 'Attended';
  };

  const getAttendedTabIcon = () => {
    if (profile?.role === 'artist') return IconPlay; // Music/concert icon
    return IconCalendar; // Calendar for regular attendance
  };

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <IonSpinner name="crescent" />
        </div>
      );
    }

    if (error) {
      return <p className="text-sm text-rose-400">{error}</p>;
    }

    // For artists, show their concerts in the "attended" tab
    if (profile?.role === 'artist' && selectedTab === 'attended') {
      return artistEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No concerts yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {artistEvents.map(event => (
            <EventPosterTile
              key={event.id}
              event={event}
              className="w-full"
              onSelect={selected => history.push(`/event/${selected.id}`)}
            />
          ))}
        </div>
      );
    }

    // For venues, show all their events in the "attended" tab
    if (profile?.role === 'venue' && selectedTab === 'attended') {
      return venueEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No events at this venue yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {venueEvents.map(event => (
            <EventPosterTile
              key={event.id}
              event={event}
              className="w-full"
              onSelect={selected => history.push(`/event/${selected.id}`)}
            />
          ))}
        </div>
      );
    }

    // For regular users or other roles
    if (selectedTab === 'liked') {
      return likedEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No liked events yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {likedEvents.map(event => (
            <EventPosterTile
              key={event.id}
              event={event}
              className="w-full"
              onSelect={selected => history.push(`/event/${selected.id}`)}
            />
          ))}
        </div>
      );
    }

    if (selectedTab === 'attended') {
      return attendedEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No attended events yet.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {attendedEvents.map(event => (
            <EventPosterTile
              key={event.id}
              event={event}
              className="w-full"
              onSelect={selected => history.push(`/event/${selected.id}`)}
            />
          ))}
        </div>
      );
    }

    // Moments tab - show all moments from events they participated in
    return posts.length === 0 ? (
      <p className="text-sm text-slate-500">No moments shared yet.</p>
    ) : (
      <div className="grid grid-cols-3 gap-2">
        {posts.map(post => (
          <button
            key={post.id}
            type="button"
            onClick={() => history.push(`/post/${post.id}`)}
            className="overflow-hidden rounded-2xl bg-slate-900 hover:ring-2 hover:ring-slate-600 transition-all"
          >
            {post.media_type === 'video' ? (
              <video className="h-full w-full object-cover" muted>
                <source src={post.media_url} />
              </video>
            ) : (
              <img src={post.media_url} alt={post.caption || 'Moment'} className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
    );
  };

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="min-h-full">
          <AppHeader />
          <div className="flex flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-center gap-4 animate-fade-up motion-reduce:animate-none">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-800 ring-2 ring-white/5">
                <img
                  src={
                    isManagementMode && activeEntity
                      ? activeEntity.type === 'artist'
                        ? activeEntity.artist?.avatar_url || `https://picsum.photos/seed/artist-${activeEntity.subject_id}/120/120`
                        : activeEntity.venue?.photos?.[0] || `https://picsum.photos/seed/venue-${activeEntity.subject_id}/120/120`
                      : profile?.avatar_url || `https://picsum.photos/seed/${profile?.id}/120/120`
                  }
                  alt="Profile avatar"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-xl text-slate-50">
                  {isManagementMode && activeEntity
                    ? activeEntity.type === 'artist'
                      ? activeEntity.artist?.name
                      : activeEntity.venue?.name
                    : profile?.display_name || profile?.username || 'Your profile'}
                </h2>
                <p className="text-sm text-slate-400">
                  {isManagementMode && activeEntity
                    ? activeEntity.type === 'artist'
                      ? 'Managed Artist'
                      : 'Managed Venue'
                    : (profile?.primary_city || 'City') + ' · @' + (profile?.username || 'user')}
                </p>
              </div>
              <div className="flex flex-col gap-2">
                {activeEntity?.type === 'artist' && activeEntity.artist?.id && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-white/50"
                    onClick={() => history.push(`/tabs/artist/${(activeEntity.artist as any).id || (activeEntity.artist as any).artist_id}`)}
                  >
                    View artist profile
                  </button>
                )}
                {activeEntity?.type === 'venue' && activeEntity.venue?.id && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/5 px-3 py-1.5 text-xs font-semibold text-slate-100 transition hover:border-white/50"
                    onClick={() => history.push(`/tabs/venue/${(activeEntity.venue as any).id || (activeEntity.venue as any).venue_place_id}`)}
                  >
                    View venue profile
                  </button>
                )}
                {profile?.role === 'admin' && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-xl border border-app-ink/40 bg-app-ink/10 px-3 py-1.5 text-xs font-semibold text-app-ink transition hover:bg-app-ink/20"
                    onClick={() => history.push('/admin/grants')}
                  >
                    Admin Grants
                  </button>
                )}
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-xl border border-[#ff6b4a]/40 px-3 py-1.5 text-xs font-semibold text-[#ffd1c4] transition hover:bg-[#ff6b4a]/10"
                  onClick={() => setShowEdit(prev => !prev)}
                >
                  <IconEdit className="h-4 w-4" />
                  Edit
                </button>
              </div>
            </div>

            {isManagementMode && managedEntities.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 animate-fade-in">
                {managedEntities.map(ent => (
                  <button
                    key={ent.subject_id}
                    type="button"
                    className={`flex-shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition ${
                      activeEntity?.subject_id === ent.subject_id
                        ? 'bg-white text-[#141824]'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10'
                    }`}
                    onClick={() => setActiveEntity(ent)}
                  >
                    {ent.type === 'artist' ? ent.artist?.name : ent.venue?.name}
                  </button>
                ))}
              </div>
            )}

            <div
              className="grid grid-cols-3 gap-3 text-center animate-fade-up motion-reduce:animate-none"
              style={{ animationDelay: '0.08s' }}
            >
              {[
                { label: 'Posts', value: posts.length.toString() },
                { 
                  label: 'Role', 
                  value: isManagementMode && activeEntity 
                    ? activeEntity.type.charAt(0).toUpperCase() + activeEntity.type.slice(1)
                    : profile?.role || 'user' 
                },
                { 
                  label: 'Verified', 
                  value: isManagementMode && activeEntity 
                    ? (activeEntity.type === 'artist' ? 'Yes' : 'No') // Artists are usually verified in this context
                    : profile?.is_verified ? 'Yes' : 'No' 
                },
              ].map(stat => (
                <div
                  key={stat.label}
                  className="rounded-2xl bg-slate-900/70 px-2 py-3 text-sm shadow-sm"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{stat.label}</p>
                  <p className="mt-2 font-display text-lg text-slate-50">{stat.value}</p>
                </div>
              ))}
            </div>

            {profile?.role === 'artist' && (linkWebsite || linkInstagram || linkSpotify) && (
              <div
                className="space-y-3 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]"
                style={{ animationDelay: '0.16s' }}
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Artist links</p>
                <div className="space-y-2 text-sm text-slate-300">
                  {linkWebsite && (
                    <a
                      href={linkWebsite}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-200 hover:text-slate-50"
                    >
                      {linkWebsite.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {linkInstagram && (
                    <a
                      href={linkInstagram}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-200 hover:text-slate-50"
                    >
                      {linkInstagram.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {linkSpotify && (
                    <a
                      href={linkSpotify}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-200 hover:text-slate-50"
                    >
                      {linkSpotify.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            )}

            {profile?.role === 'venue' && displayVenue && (
              <div
                className="space-y-3 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]"
                style={{ animationDelay: '0.16s' }}
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Venue details</p>
                <div className="space-y-2 text-sm text-slate-300">
                  {(displayVenue.address || profile.primary_city) && (
                    <p>{displayVenue.address || profile.primary_city}</p>
                  )}
                  {displayVenue.website_url && (
                    <a
                      href={displayVenue.website_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-200 hover:text-slate-50"
                    >
                      {displayVenue.website_url.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
                {(displayVenue.photos ?? []).length > 0 && (
                  <div className="flex gap-3 overflow-x-auto pb-1">
                    {(displayVenue.photos ?? []).map((url: string, index: number) => (
                      <div
                        key={`${url}-${index}`}
                        className="h-24 w-40 flex-shrink-0 overflow-hidden rounded-2xl bg-[#0f1320]"
                      >
                        <img src={url} alt="Venue" className="h-full w-full object-cover" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showEdit && (
              <div
                className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.35)]"
                style={{ animationDelay: '0.16s' }}
              >
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Display name
                  </span>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Username
                  </span>
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Primary city
                  </span>
                  <input
                    value={primaryCity}
                    onChange={e => setPrimaryCity(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Bio
                  </span>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                  />
                </label>
                {isDev && (
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                      Role (dev)
                    </span>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as ProfileRole)}
                      className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100"
                    >
                      <option value="user">User</option>
                      <option value="artist">Artist</option>
                      <option value="venue">Venue</option>
                      <option value="label">Label</option>
                    </select>
                    <span className="text-xs text-slate-500">
                      Solo para testing. En prod queda bloqueado.
                    </span>
                  </label>
                )}
                {profile?.role === 'artist' && (
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Artist links</p>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Website
                      </span>
                      <input
                        value={linkWebsite}
                        onChange={e => setLinkWebsite(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="https://your-site.com"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Instagram
                      </span>
                      <input
                        value={linkInstagram}
                        onChange={e => setLinkInstagram(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="https://instagram.com/you"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                        Spotify
                      </span>
                      <input
                        value={linkSpotify}
                        onChange={e => setLinkSpotify(e.target.value)}
                        className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                        placeholder="https://open.spotify.com/artist/..."
                      />
                    </label>
                  </div>
                )}

                {profile?.role === 'venue' && (
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Venue management</p>
                    {managedEntities.filter(e => e.type === 'venue').length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No managed venue place yet. Create or claim a venue to edit its details.
                      </p>
                    ) : (
                      <>
                        {managedEntities.filter(e => e.type === 'venue').length > 1 && (
                          <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              Managed venue
                            </span>
                            <select
                              value={selectedVenuePlaceId || ''}
                              onChange={e => setSelectedVenuePlaceId(e.target.value || null)}
                              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100"
                            >
                              {managedEntities
                                .filter(e => e.type === 'venue')
                                .map(ent => (
                                  <option key={ent.venue?.id} value={ent.venue?.id}>
                                    {ent.venue?.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Venue name
                          </span>
                          <input
                            value={venueName}
                            onChange={e => setVenueName(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="Venue name"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            City
                          </span>
                          <input
                            value={venueCity}
                            onChange={e => setVenueCity(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="City"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Venue type
                          </span>
                          <input
                            value={venueType}
                            onChange={e => setVenueType(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="Club, hall, theatre..."
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Capacity
                          </span>
                          <input
                            value={venueCapacity}
                            onChange={e => setVenueCapacity(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="450"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Address
                          </span>
                          <input
                            value={venueAddress}
                            onChange={e => setVenueAddress(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="Street address"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Website
                          </span>
                          <input
                            value={venueWebsite}
                            onChange={e => setVenueWebsite(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="https://venue-site.com"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              Latitude
                            </span>
                            <input
                              value={venueLatitude}
                              onChange={e => setVenueLatitude(e.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100"
                            />
                          </label>
                          <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                              Longitude
                            </span>
                            <input
                              value={venueLongitude}
                              onChange={e => setVenueLongitude(e.target.value)}
                              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                            Venue photos (URLs)
                          </span>
                          <textarea
                            value={venuePhotos}
                            onChange={e => setVenuePhotos(e.target.value)}
                            className="min-h-[96px] w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
                            placeholder="One URL per line"
                          />
                        </label>
                      </>
                    )}
                  </div>
                )}

                {formError && <p className="text-sm text-rose-400">{formError}</p>}
                {message && <p className="text-sm text-emerald-400">{message}</p>}

                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-2xl bg-[#ff6b4a] px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-2xl border border-transparent px-4 py-2 text-sm font-semibold text-[#ffd1c4]"
                  onClick={() => setShowEdit(false)}
                >
                  Cancel
                </button>
              </div>
            )}

            <div
              className="flex gap-2 animate-fade-up motion-reduce:animate-none"
              style={{ animationDelay: '0.16s' }}
            >
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  selectedTab === 'liked'
                    ? 'border-[#ff6b4a]/40 bg-[#ff6b4a]/20 text-[#ffd1c4]'
                    : 'border-white/10 bg-white/5 text-slate-300'
                }`}
                onClick={() => setSelectedTab('liked')}
              >
                <IconHeart className="h-4 w-4" />
                Liked
              </button>
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  selectedTab === 'attended'
                    ? 'border-[#ff6b4a]/40 bg-[#ff6b4a]/20 text-[#ffd1c4]'
                    : 'border-white/10 bg-white/5 text-slate-300'
                }`}
                onClick={() => setSelectedTab('attended')}
              >
                {React.createElement(getAttendedTabIcon(), { className: 'h-4 w-4' })}
                {getAttendedTabLabel()}
              </button>
              <button
                type="button"
                className={`flex flex-1 items-center justify-center gap-2 rounded-2xl border px-3 py-2 text-xs font-semibold transition ${
                  selectedTab === 'moments'
                    ? 'border-[#ff6b4a]/40 bg-[#ff6b4a]/20 text-[#ffd1c4]'
                    : 'border-white/10 bg-white/5 text-slate-300'
                }`}
                onClick={() => setSelectedTab('moments')}
              >
                <IconPlay className="h-4 w-4" />
                Moments
              </button>
            </div>

            <div
              className="animate-fade-up motion-reduce:animate-none"
              style={{ animationDelay: '0.24s' }}
            >
              {renderTabContent()}
            </div>

            {!showEdit && formError && <p className="text-sm text-rose-400">{formError}</p>}
            {!showEdit && message && <p className="text-sm text-emerald-400">{message}</p>}

            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-[#ff6b4a]/40 px-4 py-2 text-sm font-semibold text-[#ffd1c4] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <IconLogout className="h-4 w-4" />
              {signingOut ? 'Signing out...' : 'Log out'}
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Profile;

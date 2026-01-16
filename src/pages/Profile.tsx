import React, { useEffect, useState } from 'react';
import { IonPage, IonContent, IonSpinner } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithRelations, Profile as ProfileRecord, ProfileRole, VenuePlace } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import AppHeader from '../components/AppHeader';
import EventCard from '../components/EventCard';
import { IconCalendar, IconEdit, IconHeart, IconLogout, IconPlay } from '../components/icons';

const Profile: React.FC = () => {
  const { user, profile, updateProfile, signOut, refreshProfile } = useAuth();
  const isDev = Boolean((import.meta as any).env?.DEV);
  const history = useHistory();
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
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
  const [managedVenues, setManagedVenues] = useState<VenuePlace[]>([]);
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

  const loadProfileData = async () => {
    if (!user) return;
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
        organizer:profiles!events_organizer_id_fkey (
          id,
          username,
          display_name,
          role
        ),
        venue:profiles!events_venue_id_fkey (
          id,
          username,
          display_name,
          role
        ),
        venue_place:venue_places!events_venue_place_id_fkey (
          id,
          name,
          city,
          address
        ),
        event_artists (
          artist:profiles!event_artists_artist_id_fkey (
            id,
            username,
            display_name,
            role
          )
        )
      `;

      // Load posts (moments shared)
      const { data: postsData } = await supabase
        .from('posts')
        .select('id, media_url, media_type, caption, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(12);

      // Load liked events (event_saves)
      const { data: likedData } = await supabase
        .from('event_saves')
        .select(
          `
            events!inner (
              ${eventCardSelect}
            )
          `
        )
        .eq('user_id', user.id);

      // Load attended events (event_attendance)
      const { data: attendedData } = await supabase
        .from('event_attendance')
        .select(
          `
            status,
            events!inner (
              ${eventCardSelect}
            )
          `
        )
        .eq('user_id', user.id);

      // Load role-specific data
      let artistEvents: Event[] = [];
      let venueEvents: Event[] = [];

      if (profile?.role === 'artist') {
        // Load events where this artist participated
        const { data: artistEventData } = await supabase
          .from('event_artists')
          .select(`
              events!inner (
                ${eventCardSelect}
              )
            `)
          .eq('artist_id', user.id);

        artistEvents = (artistEventData || [])
          .map((item: any) => item.events)
          .filter((event: any): event is Event => Boolean(event));
      }

      if (profile?.role === 'venue') {
        // Load events at this venue
        const { data: venueEventData } = await supabase
          .from('events')
          .select(eventCardSelect)
          .eq('venue_id', user.id)
          .order('starts_at', { ascending: false });

        venueEvents = (venueEventData || []) as Event[];
      }

      setPosts((postsData || []) as PostWithRelations[]);
      const liked = (likedData || [])
        .map((item: any) => item.events)
        .filter((event: any): event is Event => Boolean(event));
      const attended = (attendedData || [])
        .map((item: any) => item.events)
        .filter((event: any): event is Event => Boolean(event));
      setLikedEvents(liked);
      setAttendedEvents([...attended, ...artistEvents]); // Combine attended + artist events
      setArtistEvents(artistEvents);
      setVenueEvents(venueEvents);
      if (profile?.role === 'venue') {
        const { data: venuePlaceData } = await supabase
          .from('venue_places')
          .select('*')
          .eq('created_by', user.id)
          .order('name', { ascending: true });
        const venueList = (venuePlaceData || []) as VenuePlace[];
        setManagedVenues(venueList);
        if (venueList.length > 0) {
          setSelectedVenuePlaceId(prev =>
            prev && venueList.some(venue => venue.id === prev) ? prev : venueList[0].id
          );
        } else {
          setSelectedVenuePlaceId(null);
        }
      } else {
        setManagedVenues([]);
        setSelectedVenuePlaceId(null);
      }
    } catch (err) {
      setError('Could not load profile data. Check your Supabase connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProfileData();
  }, [user, profile?.role]);

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

  const selectedVenuePlace = managedVenues.find(venue => venue.id === selectedVenuePlaceId) || null;

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

    const nextLinks: ProfileRecord['external_links'] = {
      ...(profile?.external_links || {}),
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

    const updates: Partial<ProfileRecord> = {
      display_name: displayName || null,
      username: username || null,
      primary_city: primaryCity || null,
      bio: bio || null,
      external_links: nextLinks,
    };

    if (isDev) {
      updates.role = role;
    }

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
        <div className="space-y-4">
          {artistEvents.map(event => (
            <EventCard key={event.id} event={event} onSelect={() => history.push(`/event/${event.id}`)} />
          ))}
        </div>
      );
    }

    // For venues, show all their events in the "attended" tab
    if (profile?.role === 'venue' && selectedTab === 'attended') {
      return venueEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No events at this venue yet.</p>
      ) : (
        <div className="space-y-4">
          {venueEvents.map(event => (
            <EventCard key={event.id} event={event} onSelect={() => history.push(`/event/${event.id}`)} />
          ))}
        </div>
      );
    }

    // For regular users or other roles
    if (selectedTab === 'liked') {
      return likedEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No liked events yet.</p>
      ) : (
        <div className="space-y-4">
          {likedEvents.map(event => (
            <EventCard key={event.id} event={event} onSelect={() => history.push(`/event/${event.id}`)} />
          ))}
        </div>
      );
    }

    if (selectedTab === 'attended') {
      return attendedEvents.length === 0 ? (
        <p className="text-sm text-slate-500">No attended events yet.</p>
      ) : (
        <div className="space-y-4">
          {attendedEvents.map(event => (
            <EventCard key={event.id} event={event} onSelect={() => history.push(`/event/${event.id}`)} />
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
        <div className="app-layout">
          <AppHeader />
          <div className="app-screen">
            <div className="flex items-center gap-4 fade-up">
              <div className="h-16 w-16 overflow-hidden rounded-full bg-slate-800">
                <img
                  src={profile?.avatar_url || `https://picsum.photos/seed/${profile?.id}/120/120`}
                  alt="Profile avatar"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex-1">
                <h2 className="font-display text-xl text-slate-50">
                  {profile?.display_name || profile?.username || 'Your profile'}
                </h2>
                <p className="text-sm text-slate-400">
                  {profile?.primary_city || 'City'} · @{profile?.username || 'user'}
                </p>
              </div>
              <button
                type="button"
                className="app-button app-button--outline app-button--small"
                onClick={() => setShowEdit(prev => !prev)}
              >
                <IconEdit className="app-icon" />
                Edit
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3 text-center fade-up fade-up-delay-1">
              {[
                { label: 'Posts', value: posts.length.toString() },
                { label: 'Role', value: profile?.role || 'user' },
                { label: 'Verified', value: profile?.is_verified ? 'Yes' : 'No' },
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
              <div className="app-card space-y-3 p-4 fade-up fade-up-delay-2">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Artist links</p>
                <div className="space-y-2 text-sm text-slate-300">
                  {linkWebsite && (
                    <a href={linkWebsite} target="_blank" rel="noreferrer" className="venue-link">
                      {linkWebsite.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {linkInstagram && (
                    <a href={linkInstagram} target="_blank" rel="noreferrer" className="venue-link">
                      {linkInstagram.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  {linkSpotify && (
                    <a href={linkSpotify} target="_blank" rel="noreferrer" className="venue-link">
                      {linkSpotify.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
              </div>
            )}

            {profile?.role === 'venue' && venueProfile && (
              <div className="app-card space-y-3 p-4 fade-up fade-up-delay-2">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Venue details</p>
                <div className="space-y-2 text-sm text-slate-300">
                  {(venueProfile.address || profile.primary_city) && (
                    <p>{venueProfile.address || profile.primary_city}</p>
                  )}
                  {venueProfile.website_url && (
                    <a href={venueProfile.website_url} target="_blank" rel="noreferrer" className="venue-link">
                      {venueProfile.website_url.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                </div>
                {venueProfile.photos.length > 0 && (
                  <div className="venue-photo-row">
                    {venueProfile.photos.map((url, index) => (
                      <div key={`${url}-${index}`} className="venue-photo">
                        <img src={url} alt="Venue" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showEdit && (
              <div className="app-card space-y-4 p-4 fade-up fade-up-delay-2">
                <label className="app-field">
                  <span className="app-label">Display name</span>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Username</span>
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Primary city</span>
                  <input
                    value={primaryCity}
                    onChange={e => setPrimaryCity(e.target.value)}
                    className="app-input"
                  />
                </label>
                <label className="app-field">
                  <span className="app-label">Bio</span>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    className="app-textarea"
                  />
                </label>
                {isDev && (
                  <label className="app-field">
                    <span className="app-label">Role (dev)</span>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as ProfileRole)}
                      className="app-select"
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
                    <label className="app-field">
                      <span className="app-label">Website</span>
                      <input
                        value={linkWebsite}
                        onChange={e => setLinkWebsite(e.target.value)}
                        className="app-input"
                        placeholder="https://your-site.com"
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-label">Instagram</span>
                      <input
                        value={linkInstagram}
                        onChange={e => setLinkInstagram(e.target.value)}
                        className="app-input"
                        placeholder="https://instagram.com/you"
                      />
                    </label>
                    <label className="app-field">
                      <span className="app-label">Spotify</span>
                      <input
                        value={linkSpotify}
                        onChange={e => setLinkSpotify(e.target.value)}
                        className="app-input"
                        placeholder="https://open.spotify.com/artist/..."
                      />
                    </label>
                  </div>
                )}

                {profile?.role === 'venue' && (
                  <div className="space-y-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Venue management</p>
                    {managedVenues.length === 0 ? (
                      <p className="text-sm text-slate-500">
                        No managed venue place yet. Create or claim a venue to edit its details.
                      </p>
                    ) : (
                      <>
                        {managedVenues.length > 1 && (
                          <label className="app-field">
                            <span className="app-label">Managed venue</span>
                            <select
                              value={selectedVenuePlaceId || ''}
                              onChange={e => setSelectedVenuePlaceId(e.target.value || null)}
                              className="app-select"
                            >
                              {managedVenues.map(venue => (
                                <option key={venue.id} value={venue.id}>
                                  {venue.name}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label className="app-field">
                          <span className="app-label">Venue name</span>
                          <input
                            value={venueName}
                            onChange={e => setVenueName(e.target.value)}
                            className="app-input"
                            placeholder="Venue name"
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-label">City</span>
                          <input
                            value={venueCity}
                            onChange={e => setVenueCity(e.target.value)}
                            className="app-input"
                            placeholder="City"
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-label">Venue type</span>
                          <input
                            value={venueType}
                            onChange={e => setVenueType(e.target.value)}
                            className="app-input"
                            placeholder="Club, hall, theatre..."
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-label">Capacity</span>
                          <input
                            value={venueCapacity}
                            onChange={e => setVenueCapacity(e.target.value)}
                            className="app-input"
                            placeholder="450"
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-label">Address</span>
                          <input
                            value={venueAddress}
                            onChange={e => setVenueAddress(e.target.value)}
                            className="app-input"
                            placeholder="Street address"
                          />
                        </label>
                        <label className="app-field">
                          <span className="app-label">Website</span>
                          <input
                            value={venueWebsite}
                            onChange={e => setVenueWebsite(e.target.value)}
                            className="app-input"
                            placeholder="https://venue-site.com"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="app-field">
                            <span className="app-label">Latitude</span>
                            <input
                              value={venueLatitude}
                              onChange={e => setVenueLatitude(e.target.value)}
                              className="app-input"
                            />
                          </label>
                          <label className="app-field">
                            <span className="app-label">Longitude</span>
                            <input
                              value={venueLongitude}
                              onChange={e => setVenueLongitude(e.target.value)}
                              className="app-input"
                            />
                          </label>
                        </div>
                        <label className="app-field">
                          <span className="app-label">Venue photos (URLs)</span>
                          <textarea
                            value={venuePhotos}
                            onChange={e => setVenuePhotos(e.target.value)}
                            className="app-textarea"
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
                  className="app-button app-button--block"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  className="app-button app-button--ghost app-button--block"
                  onClick={() => setShowEdit(false)}
                >
                  Cancel
                </button>
              </div>
            )}

            <div className="profile-tabs fade-up fade-up-delay-2">
              <button
                type="button"
                className={`profile-tab ${selectedTab === 'liked' ? 'is-active' : ''}`}
                onClick={() => setSelectedTab('liked')}
              >
                <IconHeart className="app-icon" />
                Liked
              </button>
              <button
                type="button"
                className={`profile-tab ${selectedTab === 'attended' ? 'is-active' : ''}`}
                onClick={() => setSelectedTab('attended')}
              >
                {React.createElement(getAttendedTabIcon(), { className: 'app-icon' })}
                {getAttendedTabLabel()}
              </button>
              <button
                type="button"
                className={`profile-tab ${selectedTab === 'moments' ? 'is-active' : ''}`}
                onClick={() => setSelectedTab('moments')}
              >
                <IconPlay className="app-icon" />
                Moments
              </button>
            </div>

            <div className="fade-up fade-up-delay-3">{renderTabContent()}</div>

            {!showEdit && formError && <p className="text-sm text-rose-400">{formError}</p>}
            {!showEdit && message && <p className="text-sm text-emerald-400">{message}</p>}

            <button
              type="button"
              className="app-button app-button--outline app-button--block"
              onClick={handleSignOut}
              disabled={signingOut}
            >
              <IconLogout className="app-icon" />
              {signingOut ? 'Signing out...' : 'Log out'}
            </button>
          </div>
        </div>
      </IonContent>
    </IonPage>
  );
};

export default Profile;

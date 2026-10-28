import React, { useEffect, useState } from 'react';
import Avatar from '../components/ui/Avatar';
import { Content, Modal, Spinner } from '../components/ui/AppPrimitives';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Event, PostWithSetlist, ProfileRole } from '../lib/types';
import { useAuth } from '../contexts/AuthContext';
import { useWorkspace } from '../contexts/WorkspaceContext';
import AppShell from '../components/AppShell';
import ConcertRow from '../components/ui/ConcertRow';
import MomentGrid from '../components/ui/MomentGrid';
import GeneratedPoster from '../components/ui/GeneratedPoster';
import { NAV_CLEARANCE } from '../components/BottomNav';
import { useFollowedSubjects } from '../hooks/useFollowedSubjects';
import { useFollowedEntities } from '../hooks/useFollowedEntities';
import { IconLogout } from '../components/icons';
import { useAppResume } from '../shared/hooks/useAppResume';
import { fetchQuery } from '../lib/queryClient';
import { fetchEventCards } from '../data/eventQueries';
import { fetchPostCards } from '../data/postQueries';
import ConcertHistorySection from '../features/agenda/ConcertHistorySection';

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

  const navigate = useNavigate();
  const location = useLocation();
  const isDev = Boolean((import.meta as any).env?.DEV);

  const [posts, setPosts] = useState<PostWithSetlist[]>([]);
  const [likedEvents, setLikedEvents] = useState<Event[]>([]);
  const [attendedEvents, setAttendedEvents] = useState<Event[]>([]);
  const [artistEvents, setArtistEvents] = useState<Event[]>([]);
  const [venueEvents, setVenueEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedTab, setSelectedTab] = useState<'moments' | 'concerts' | 'following'>(
    (location.state as { profileTab?: string } | null)?.profileTab === 'following' ? 'following' : 'moments'
  );
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
  const [editModalTab, setEditModalTab] = useState<'config' | 'logout' | 'premium'>('config');
  const resumeTick = useAppResume();

  const searchParams = new URLSearchParams(location.search);
  const editTarget = searchParams.get('edit');
  const showEdit = editTarget === 'profile' || editTarget === 'artist' || editTarget === 'venue';

  const closeEditModal = () => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.delete('edit');
    navigate({
      pathname: location.pathname,
      search: nextParams.toString(),
    }, { replace: true });
  };

  const openEditModal = (target: 'profile' | 'artist' | 'venue') => {
    const nextParams = new URLSearchParams(location.search);
    nextParams.set('edit', target);
    navigate({
      pathname: location.pathname,
      search: nextParams.toString(),
    }, { replace: true });
  };

  const openContextualEditModal = () => {
    if (activeEntity?.type === 'artist' || profile?.role === 'artist') {
      openEditModal('artist');
      return;
    }
    if (activeEntity?.type === 'venue' || profile?.role === 'venue') {
      openEditModal('venue');
      return;
    }
    openEditModal('profile');
  };

  const editModalTitle =
    editTarget === 'artist'
      ? 'Editar perfil de artista'
      : editTarget === 'venue'
        ? 'Editar perfil de sala'
        : 'Editar perfil';

  useEffect(() => {
    setIsManagementMode(Boolean(activeEntity));
  }, [activeEntity]);

  useEffect(() => {
    if (!activeEntity) return;
    if (location.pathname.startsWith('/tabs/profile')) return;
    // Route to entity-specific profile pages when acting as an entity
    if (activeEntity.type === 'artist' && activeEntity.artist?.id) {
      const artistPath = `/tabs/artist/${activeEntity.artist.id}`;
      if (!location.pathname.startsWith(artistPath)) {
        navigate(artistPath, { replace: true });
      }
    } else if (activeEntity.type === 'venue' && activeEntity.venue?.id) {
      const venuePath = `/tabs/venue/${activeEntity.venue.id}`;
      if (!location.pathname.startsWith(venuePath)) {
        navigate(venuePath, { replace: true });
      }
    }
  }, [activeEntity, location.pathname, navigate]);

  const activeProfile = isManagementMode && activeEntity 
    ? (activeEntity.type === 'user' ? activeEntity.profile : null)
    : profile;

  const loadProfileData = async (isManualRefresh = false) => {
    if (!user?.id) return;
    const loadContext = `${user.id}-${isManagementMode}-${activeEntity?.subject_id || 'none'}-${profile?.role || 'user'}`;

    setLoading(true);
    setError('');

    try {
      const data = await fetchQuery<{
        posts: PostWithSetlist[];
        liked: Event[];
        attended: Event[];
        artistEvents: Event[];
        venueEvents: Event[];
      }>(
        ['profile:data', loadContext],
        async () => {
          const [personalPosts, likedRes, attendedRes] = await Promise.all([
            isManagementMode ? Promise.resolve([]) : fetchPostCards({ authorId: user.id }),
            supabase.from('event_saves').select('event_id').eq('profile_id', user.id),
            supabase.from('event_attendance').select('event_id,status').eq('profile_id', user.id),
          ]);

          const likedIds = (likedRes.data || []).map(row => row.event_id).filter(Boolean);
          const attendedIds = (attendedRes.data || []).map(row => row.event_id).filter(Boolean);

          let artistEvents: Event[] = [];
          let venueEvents: Event[] = [];

          const activeRole = isManagementMode && activeEntity ? activeEntity.type : profile?.role;
          if (activeRole === 'artist') {
            const artistEntityId = isManagementMode && activeEntity ? activeEntity.artist?.id : null;
            if (artistEntityId) {
              const { data: artistEventData, error: artistEventError } = await supabase
                .from('event_artists')
                .select('event_id')
                .eq('artist_id', artistEntityId);
              if (artistEventError) throw artistEventError;
              artistEvents = await fetchEventCards({
                eventIds: (artistEventData || []).map(row => row.event_id),
              });
            }
          }

          if (activeRole === 'venue') {
            const venuePlaceId = isManagementMode && activeEntity ? activeEntity.venue?.id : null;
            if (venuePlaceId) {
              venueEvents = await fetchEventCards({ venueId: venuePlaceId });
            }
          }

          const entityEventIds = [...artistEvents, ...venueEvents].map(event => event.id);
          const [liked, attended, entityPosts] = await Promise.all([
            fetchEventCards({ eventIds: likedIds }),
            fetchEventCards({ eventIds: attendedIds }),
            isManagementMode ? fetchPostCards({ eventIds: entityEventIds }) : Promise.resolve([]),
          ]);
          const posts = (isManagementMode ? entityPosts : personalPosts).slice(0, 12) as PostWithSetlist[];

          return { posts, liked, attended, artistEvents, venueEvents };
        },
        {
          ttlMs: 10_000,
          force: isManualRefresh,
        }
      );

      setPosts(data.posts);
      setLikedEvents(data.liked);
      setAttendedEvents([...data.attended, ...data.artistEvents]);
      setArtistEvents(data.artistEvents);
      setVenueEvents(data.venueEvents);
    } catch (err) {
      setError('No se ha podido cargar tu perfil. Revisa tu conexión.');
      setPosts([]);
      setLikedEvents([]);
      setAttendedEvents([]);
      setArtistEvents([]);
      setVenueEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.id) {
      void loadProfileData(true);
    }
  }, [activeEntity?.subject_id, isManagementMode, profile?.role, resumeTick, user?.id]);

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

  useEffect(() => {
    if (!showEdit) return;
    setEditModalTab('config');
    setFormError('');
    setMessage('');
  }, [showEdit, editTarget]);

  const selectedVenuePlace = managedEntities.find(ent => ent.venue?.id === selectedVenuePlaceId)?.venue || null;

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
        setFormError('El nombre de la sala y la ciudad son obligatorios.');
        setSaving(false);
        return;
      }
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
        })
        .eq('id', selectedVenuePlaceId);

      if (venueError) {
        setFormError(venueError.message);
        setSaving(false);
        return;
      }
    }

    await refreshProfile();
    await loadProfileData(true);
    setMessage('Perfil actualizado.');
    closeEditModal();
    setSaving(false);
  };

  const handleSignOut = async () => {
    setFormError('');
    setMessage('');
    setSigningOut(true);
    try {
      await signOut();
      navigate('/welcome', { replace: true });
    } catch (err) {
      setFormError('No se ha podido cerrar sesión. Revisa tu conexión.');
    } finally {
      setSigningOut(false);
    }
  };

  const { followedSubjectIds } = useFollowedSubjects();
  const { entities: followedEntities } = useFollowedEntities(followedSubjectIds);

  const renderEmpty = (title: string, description: string) => (
    <div className="mx-4 rounded-2xl border border-dashed border-app-line p-5">
      <p className="font-display text-base font-bold text-app-ink">{title}</p>
      <p className="mt-1 text-sm text-white/60">{description}</p>
    </div>
  );

  // Saved and attended concerts, newest first, without repeats.
  const concerts = (() => {
    const own = isManagementMode ? [...artistEvents, ...venueEvents] : [...attendedEvents, ...likedEvents];
    const seen = new Set<string>();
    return own
      .filter(event => (seen.has(event.id) ? false : (seen.add(event.id), true)))
      .sort((left, right) => right.starts_at.localeCompare(left.starts_at));
  })();

  // The next concert the user is going to or saved, up to a few hours after doors.
  const nextConcert = (() => {
    const from = Date.now() - 4 * 60 * 60 * 1000;
    return [...attendedEvents, ...likedEvents]
      .filter(event => new Date(event.starts_at).getTime() >= from)
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at))[0] || null;
  })();

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      );
    }

    if (error) {
      return <p className="px-4 text-sm text-rose-400">{error}</p>;
    }

    if (selectedTab === 'following') {
      return followedEntities.length === 0 ? (
        renderEmpty('Aún no sigues a nadie', 'Sigue artistas y salas para ver cuándo tocan en Inicio.')
      ) : (
        <ul className="mx-4 divide-y divide-app-line overflow-hidden rounded-2xl border border-app-line bg-app-surface">
          {followedEntities.map(entity => (
            <li key={entity.subjectId}>
              <button
                type="button"
                onClick={() => navigate(`/tabs/${entity.kind}/${entity.id}`)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
              >
                <Avatar name={entity.name} src={entity.imageUrl} kind={entity.kind} badge className="h-11 w-11 text-[15px]" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-bold text-app-ink">{entity.name}</span>
                  <span className="block truncate text-xs text-[#8f8b84]">
                    {[entity.kind === 'artist' ? 'Artista' : entity.kind === 'festival' ? 'Festival' : 'Sala', entity.city].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      );
    }

    if (selectedTab === 'concerts') {
      return concerts.length === 0 ? (
        renderEmpty('Aún no hay conciertos', 'Marca «Voy» o guarda un concierto y aparecerá aquí.')
      ) : (
        <div className="flex flex-col gap-2 px-4">
          {concerts.map(event => {
            const card = event as Event & { venue_place?: { name?: string | null } | null };
            return (
              <ConcertRow
                key={event.id}
                startsAt={event.starts_at}
                title={card.name}
                subtitle={card.venue_place?.name || event.city}
                onSelect={() => navigate(`/event/${event.id}`)}
              />
            );
          })}
        </div>
      );
    }

    return posts.length === 0 ? (
      renderEmpty('Aún no hay momentos', 'Sube lo que grabes en tu próximo concierto y aparecerá aquí.')
    ) : (
      <MomentGrid
        moments={posts}
        columns={3}
        label={index => (posts[index] as any)?.events?.venue_place?.name || (posts[index] as any)?.events?.city}
      />
    );
  };

  const headerName = isManagementMode && activeEntity
    ? (activeEntity.type === 'artist' ? activeEntity.artist?.name : activeEntity.venue?.name) || 'Tu perfil'
    : profile?.display_name || profile?.username || 'Tu perfil';
  const avatarUrl = isManagementMode && activeEntity
    ? activeEntity.type === 'artist' ? activeEntity.artist?.avatar_url : activeEntity.venue?.photos?.[0]
    : profile?.avatar_url;
  const subline = isManagementMode && activeEntity
    ? activeEntity.type === 'artist' ? 'Artista que gestionas' : 'Sala que gestionas'
    : [profile?.primary_city, profile?.username ? `@${profile.username}` : null].filter(Boolean).join(' · ');

  const tabs: { key: typeof selectedTab; label: string }[] = [
    { key: 'moments', label: isManagementMode ? 'Momentos' : 'Mis momentos' },
    { key: 'concerts', label: 'Conciertos' },
    { key: 'following', label: 'Siguiendo' },
  ];

  return (
    <AppShell headerProps={null}>
      <div className={`flex flex-col ${NAV_CLEARANCE}`}>
        <header className="flex items-center gap-3.5 px-4 pt-[calc(18px+env(safe-area-inset-top,0px))]">
          {avatarUrl ? (
            <Avatar name={headerName} src={avatarUrl} className="h-[72px] w-[72px]" />
          ) : (
            <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-app-accent font-poster text-[28px] text-[#14151a]">
              {isManagementMode ? headerName.slice(0, 2) : 'Tú'}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate font-display text-[22px] font-bold text-app-ink">{headerName}</h1>
            <p className="mt-0.5 truncate text-sm text-[#c9c5bd]">{subline || 'Añade tu ciudad en ajustes'}</p>
          </div>
          <button
            type="button"
            aria-label="Ajustes"
            onClick={openContextualEditModal}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
            </svg>
          </button>
        </header>

        {isManagementMode && managedEntities.length > 1 && (
          <div className="flex gap-2 overflow-x-auto px-4 pt-3">
            {managedEntities.map(ent => (
              <button
                key={ent.subject_id}
                type="button"
                className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold ${
                  activeEntity?.subject_id === ent.subject_id ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'
                }`}
                onClick={() => setActiveEntity(ent)}
              >
                {ent.type === 'artist' ? ent.artist?.name : ent.venue?.name}
              </button>
            ))}
          </div>
        )}

        {managedEntities.some(ent => ent.type === 'artist' || ent.type === 'venue') ? (
          <button
            type="button"
            onClick={() => navigate('/gestion')}
            className="mx-4 mt-3.5 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Panel de gestión</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Eventos · setlist · QR</span>
          </button>
        ) : null}

        {!isManagementMode ? (
          <button
            type="button"
            onClick={() => navigate('/pedidos')}
            className="mx-4 mt-3.5 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Mis pedidos de merch</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Recoger · recuerdos</span>
          </button>
        ) : null}

        {!isManagementMode ? (
          <button
            type="button"
            onClick={() => navigate('/empezar', { state: { returnTo: '/tabs/profile' } })}
            className="mx-4 mt-2 flex min-h-12 items-center justify-between rounded-[14px] border border-app-line bg-app-surface px-3.5 text-left text-sm font-semibold text-app-ink"
          >
            <span>Tu agenda</span>
            <span className="font-mono text-[11px] font-semibold uppercase text-app-accent">Ciudad · gustos · seguir</span>
          </button>
        ) : null}

        {!isManagementMode && nextConcert ? (
          <button
            type="button"
            aria-label="Tu próximo concierto"
            onClick={() => navigate(`/event/${nextConcert.id}`)}
            className="mx-4 mt-[18px] flex items-center gap-3 rounded-[18px] border border-app-line bg-app-surface p-3.5 text-left"
          >
            <span className="relative h-[68px] w-[54px] shrink-0 overflow-hidden rounded-[10px]">
              {nextConcert.cover_image_url ? (
                <img src={nextConcert.cover_image_url} alt="" className="h-full w-full object-cover" />
              ) : (
                <GeneratedPoster title={nextConcert.name} variant="thumb" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[11px] font-semibold uppercase text-app-accent">
                {(() => {
                  const date = new Date(nextConcert.starts_at);
                  const time = date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
                  return date.toDateString() === new Date().toDateString()
                    ? `Vas hoy · ${time}`
                    : `Próximo · ${date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(/[.,]/g, '')} · ${time}`;
                })()}
              </span>
              <span className="block truncate font-display text-base font-bold text-app-ink">
                {nextConcert.name}
                {(nextConcert as any).venue_place?.name ? ` · ${(nextConcert as any).venue_place.name}` : ''}
              </span>
              <span className="block text-[13px] text-[#c9c5bd]">Cuando acabe, sube lo que grabes.</span>
            </span>
          </button>
        ) : null}

        {!isManagementMode && user ? <ConcertHistorySection userId={user.id} /> : null}

        <div role="tablist" aria-label="Secciones del perfil" className="flex gap-1.5 overflow-x-auto px-4 pb-3 pt-[18px]">
          {tabs.map(tab => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selectedTab === tab.key}
              onClick={() => setSelectedTab(tab.key)}
              className={`min-h-10 shrink-0 rounded-full px-3.5 text-sm font-semibold ${
                selectedTab === tab.key ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {renderTabContent()}

        {!showEdit && formError && <p className="px-4 pt-3 text-sm text-rose-400">{formError}</p>}
        {!showEdit && message && <p className="px-4 pt-3 text-sm text-emerald-400">{message}</p>}
      </div>

      <Modal isOpen={showEdit} onDidDismiss={closeEditModal} title="Editar perfil">
        <Content fullscreen>
          <div className="min-h-full bg-app-bg p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-bold text-white">{editModalTitle}</h2>
              <button
                type="button"
                className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
                onClick={closeEditModal}
              >
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-white/5 p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                  editModalTab === 'config'
                    ? 'bg-[#ff5b2e] text-white'
                    : 'text-white/65 hover:text-white'
                }`}
                onClick={() => setEditModalTab('config')}
              >
                Ajustes
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                  editModalTab === 'logout'
                    ? 'bg-[#ff5b2e] text-white'
                    : 'text-white/65 hover:text-white'
                }`}
                onClick={() => setEditModalTab('logout')}
              >
                Salir
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] transition ${
                  editModalTab === 'premium'
                    ? 'bg-[#ff5b2e] text-white'
                    : 'text-white/65 hover:text-white'
                }`}
                onClick={() => setEditModalTab('premium')}
              >
                Premium
              </button>
            </div>

            {editModalTab === 'config' && (
              <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    Nombre visible
                  </span>
                  <input
                    value={displayName}
                    onChange={e => setDisplayName(e.target.value)}
                    className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    Usuario
                  </span>
                  <input
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    Ciudad principal
                  </span>
                  <input
                    value={primaryCity}
                    onChange={e => setPrimaryCity(e.target.value)}
                    className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    Bio
                  </span>
                  <textarea
                    value={bio}
                    onChange={e => setBio(e.target.value)}
                    className="min-h-[96px] w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                  />
                </label>
                {isDev && (
                  <label className="flex flex-col gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                      Rol (dev)
                    </span>
                    <select
                      value={role}
                      onChange={e => setRole(e.target.value as ProfileRole)}
                      className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
                    >
                      <option value="user">Usuario</option>
                      <option value="artist">Artista</option>
                      <option value="venue">Sala</option>
                      <option value="label">Sello</option>
                    </select>
                    <span className="text-xs text-white/60">
                      Solo para testing. En prod queda bloqueado.
                    </span>
                  </label>
                )}
                {profile?.role === 'artist' && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Enlaces del artista</p>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                        Web
                      </span>
                      <input
                        value={linkWebsite}
                        onChange={e => setLinkWebsite(e.target.value)}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                        placeholder="https://tu-web.com"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                        Instagram
                      </span>
                      <input
                        value={linkInstagram}
                        onChange={e => setLinkInstagram(e.target.value)}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                        placeholder="https://instagram.com/tu_usuario"
                      />
                    </label>
                    <label className="flex flex-col gap-2">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                        Spotify
                      </span>
                      <input
                        value={linkSpotify}
                        onChange={e => setLinkSpotify(e.target.value)}
                        className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                        placeholder="https://open.spotify.com/artist/..."
                      />
                    </label>
                  </div>
                )}

                {profile?.role === 'venue' && (
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Gestión de la sala</p>
                    {managedEntities.filter(e => e.type === 'venue').length === 0 ? (
                      <p className="text-sm text-white/60">
                        Aún no gestionas ninguna sala. Crea o reclama una sala para editar sus datos.
                      </p>
                    ) : (
                      <>
                        {managedEntities.filter(e => e.type === 'venue').length > 1 && (
                          <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                              Sala que gestionas
                            </span>
                            <select
                              value={selectedVenuePlaceId || ''}
                              onChange={e => setSelectedVenuePlaceId(e.target.value || null)}
                              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
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
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Nombre de la sala
                          </span>
                          <input
                            value={venueName}
                            onChange={e => setVenueName(e.target.value)}
                            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="Nombre de la sala"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Ciudad
                          </span>
                          <input
                            value={venueCity}
                            onChange={e => setVenueCity(e.target.value)}
                            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="Ciudad"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Tipo de sala
                          </span>
                          <input
                            value={venueType}
                            onChange={e => setVenueType(e.target.value)}
                            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="Club, sala, teatro..."
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Aforo
                          </span>
                          <input
                            value={venueCapacity}
                            onChange={e => setVenueCapacity(e.target.value)}
                            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="450"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Dirección
                          </span>
                          <input
                            value={venueAddress}
                            onChange={e => setVenueAddress(e.target.value)}
                            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="Calle y número"
                          />
                        </label>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Web
                          </span>
                          <input
                            value={venueWebsite}
                            onChange={e => setVenueWebsite(e.target.value)}
                            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="https://web-de-la-sala.com"
                          />
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                              Latitud
                            </span>
                            <input
                              value={venueLatitude}
                              onChange={e => setVenueLatitude(e.target.value)}
                              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
                            />
                          </label>
                          <label className="flex flex-col gap-2">
                            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                              Longitud
                            </span>
                            <input
                              value={venueLongitude}
                              onChange={e => setVenueLongitude(e.target.value)}
                              className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
                            />
                          </label>
                        </div>
                        <label className="flex flex-col gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                            Fotos de la sala (URLs)
                          </span>
                          <textarea
                            value={venuePhotos}
                            onChange={e => setVenuePhotos(e.target.value)}
                            className="min-h-[96px] w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                            placeholder="Una URL por línea"
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
                  className="inline-flex w-full items-center justify-center rounded-xl bg-[#ff5b2e] px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? 'Guardando...' : 'Guardar cambios'}
                </button>
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center rounded-xl border border-white/20 px-4 py-3 text-sm font-semibold text-white/75 transition hover:text-white"
                  onClick={closeEditModal}
                >
                  Cancelar
                </button>
              </div>
            )}

            {editModalTab === 'logout' && (
              <div className="mt-6 space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm text-white/70">
                  Cerrar sesión en este dispositivo.
                </p>
                {formError && <p className="text-sm text-rose-400">{formError}</p>}
                <button
                  type="button"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-300/45 bg-rose-500/10 px-4 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSignOut}
                  disabled={signingOut}
                >
                  <IconLogout className="h-4 w-4" />
                  {signingOut ? 'Cerrando sesión...' : 'Cerrar sesión'}
                </button>
              </div>
            )}

            {editModalTab === 'premium' && (
              <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-white/60">Premium</p>
                <p className="mt-2 text-sm text-white/70">
                  Próximamente.
                </p>
              </div>
            )}
          </div>
        </Content>
      </Modal>
    </AppShell>
  );
};

export default Profile;

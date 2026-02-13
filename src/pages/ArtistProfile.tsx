import React, { useEffect, useMemo, useState } from 'react';
import { IonSpinner } from '@ionic/react';
import { useHistory, useParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PostWithSetlist } from '../lib/types';
import AppShell from '../components/AppShell';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { useAuth } from '../contexts/AuthContext';
import { ArtistProfileArtist, ArtistProfileEvent } from '../components/artist/types';
import ArtistHero from '../components/artist/ArtistHero';
import ArtistTabs, { ArtistTabKey } from '../components/artist/ArtistTabs';
import UpcomingShowsSection from '../components/artist/UpcomingShowsSection';
import ArtistMapSection from '../components/artist/ArtistMapSection';
import GallerySection from '../components/artist/GallerySection';
import PastShowsSection from '../components/artist/PastShowsSection';
import MomentsSection from '../components/artist/MomentsSection';
import AboutSection from '../components/artist/AboutSection';

type ArtistProfileProps = {
  artistId?: string;
  embedded?: boolean;
};

const ArtistProfile: React.FC<ArtistProfileProps> = ({ artistId, embedded }) => {
  const { id: routeId } = useParams<{ id: string }>();
  const id = artistId || routeId;
  const history = useHistory();
  const { managedEntities, activeWorkspace } = useWorkspace();
  const { user } = useAuth();

  const [artist, setArtist] = useState<ArtistProfileArtist | null>(null);
  const [upcomingShows, setUpcomingShows] = useState<ArtistProfileEvent[]>([]);
  const [pastShows, setPastShows] = useState<ArtistProfileEvent[]>([]);
  const [moments, setMoments] = useState<PostWithSetlist[]>([]);
  const [gallery, setGallery] = useState<PostWithSetlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<ArtistTabKey>('shows');

  useEffect(() => {
    const loadArtist = async () => {
      setLoading(true);
      setError('');
      try {
        const { data: artistRow, error: artistError } = await supabase
          .from('v_subject_artists')
          .select('*')
          .eq('artist_id', id)
          .maybeSingle();

        if (artistError || !artistRow) {
          throw artistError || new Error('Artist not found');
        }

        const normalizedArtist: ArtistProfileArtist = {
          id: (artistRow as any).artist_id || (artistRow as any).id || id,
          name: artistRow.name,
          artist_type: artistRow.artist_type,
          city: artistRow.city,
          bio: artistRow.bio,
          avatar_url: artistRow.avatar_url,
          genres: artistRow.genres || [],
          external_links: artistRow.external_links || {},
          created_at: artistRow.created_at,
          updated_at: artistRow.updated_at,
          subject_id: artistRow.subject_id,
        };

        const { data: artistEvents } = await supabase
          .from('event_artists')
          .select('event_id')
          .eq('artist_entity_id', normalizedArtist.id);

        const eventIds = (artistEvents || []).map(row => row.event_id).filter(Boolean);

        let eventRows: ArtistProfileEvent[] = [];
        if (eventIds.length > 0) {
          const { data: eventsData } = await supabase
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
                ),
                event_artists (
                  artist:artists!event_artists_artist_entity_fk (
                    id,
                    name,
                    avatar_url
                  )
                )
              `
            )
            .in('id', eventIds)
            .order('starts_at', { ascending: true });

          eventRows = (eventsData || []) as ArtistProfileEvent[];
        }

        const now = new Date();
        const upcoming = eventRows.filter(event => new Date(event.starts_at) >= now);
        const past = eventRows.filter(event => new Date(event.starts_at) < now);

        setArtist(normalizedArtist);
        setUpcomingShows(upcoming);
        setPastShows(past.reverse());

        if (eventIds.length > 0) {
          const { data: momentsData } = await supabase
            .from('posts')
            .select('id, media_url, media_type, caption, event_id, created_at, actor_subject_id, song_title')
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
            .limit(24);

          const allMoments = (momentsData || []) as PostWithSetlist[];
          setMoments(allMoments);
          setGallery(allMoments.filter(item => item.media_type === 'image').slice(0, 6));
        } else {
          setMoments([]);
          setGallery([]);
        }
      } catch (err) {
        console.error('Failed to load artist profile', err);
        setError('Artist not found.');
        setArtist(null);
        setUpcomingShows([]);
        setPastShows([]);
        setMoments([]);
        setGallery([]);
      } finally {
        setLoading(false);
      }
    };

    loadArtist();
  }, [id]);

  const isManager = useMemo(() => {
    if (!artist) return false;
    return Boolean(
      activeWorkspace?.type === 'artist' && activeWorkspace.artist?.id === artist.id
    ) || managedEntities.some(entity => entity.type === 'artist' && entity.artist?.id === artist.id);
  }, [activeWorkspace, artist, managedEntities]);

  const externalLinks = useMemo(() => {
    const links = (artist?.external_links || {}) as Record<string, string>;
    const normalized = {
      spotify: links.spotify,
      apple_music: links.apple_music || (links as any).appleMusic,
      instagram: links.instagram,
      youtube: links.youtube,
      website: links.website,
    };
    return Object.entries(normalized)
      .map(([key, value]) => ({ key, value }))
      .filter(link => Boolean(link.value));
  }, [artist]);

  const limitedUpcoming = upcomingShows.slice(0, 5);
  const limitedPast = pastShows.slice(0, 5);

  const heroBackground = artist?.avatar_url
    ? {
        backgroundColor: '#0b0b0d',
        backgroundImage: `linear-gradient(180deg, rgba(0,0,0,0.12) 0%, rgba(0,0,0,0.68) 70%, #0b0b0d 100%), url(${artist.avatar_url})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }
    : { backgroundColor: '#0b0b0d' };

  const handleOpenMap = () => {
    if (!artist) return;
    history.push('/tabs/map', {
      artistFilter: {
        id: artist.id,
        name: artist.name,
        avatar_url: artist.avatar_url,
      },
    });
  };

  const playedCount = pastShows.length + upcomingShows.length;

  const renderTabContent = () => {
    switch (activeTab) {
      case 'shows':
        return (
          <div className="space-y-6">
            <UpcomingShowsSection
              events={limitedUpcoming}
              isManager={isManager}
              onViewEvent={eventId => history.push(`/event/${eventId}`)}
              onCreateShow={() => history.push('/create-event', { from: `/tabs/artist/${id}` })}
              onOpenMap={handleOpenMap}
            />
            <PastShowsSection
              events={limitedPast}
              playedCount={playedCount}
              isManager={isManager}
              onViewEvent={eventId => history.push(`/event/${eventId}`)}
              onCreateShow={() => history.push('/create-event', { from: `/tabs/artist/${id}` })}
            />
          </div>
        );
      case 'media':
        return (
          <div className="space-y-6">
            <ArtistMapSection
              hasEvents={upcomingShows.length > 0 || pastShows.length > 0}
              artistName={artist?.name || ''}
              isManager={isManager}
              onOpenMap={handleOpenMap}
              onCreateShow={() => history.push('/create-event', { from: `/tabs/artist/${id}` })}
            />
            <GallerySection
              gallery={gallery}
              onSelect={postId => history.push(`/post/${postId}`)}
              onViewGallery={() => setActiveTab('moments')}
            />
          </div>
        );
      case 'moments':
        return (
          <MomentsSection
            moments={moments}
            isManager={isManager}
            onSelect={postId => history.push(`/post/${postId}`)}
          />
        );
      case 'about':
      default:
        return (
          <AboutSection
            artist={artist}
            isManager={isManager}
            playedCount={playedCount}
            onCreateShow={() => history.push('/create-event', { from: `/tabs/artist/${id}` })}
            onOpenMap={handleOpenMap}
          />
        );
    }
  };

  const content = (
    <>
      {loading && (
        <div className="flex items-center justify-center py-12">
          <IonSpinner name="crescent" />
        </div>
      )}

      {!loading && error && (
        <p className="text-sm text-rose-400">{error}</p>
      )}

      {!loading && artist && (
        <div className="space-y-8">
          <ArtistHero
            artist={artist}
            isManager={isManager}
            playedCount={playedCount}
            externalLinks={externalLinks}
            heroStyle={heroBackground}
            onEdit={() => history.push('/tabs/profile')}
          />

          <div className="sticky top-[72px] z-10 -mx-4 bg-app-bg px-4 py-3">
            <ArtistTabs
              activeTab={activeTab}
              onSelect={key => setActiveTab(key)}
            />
          </div>

          <div>{renderTabContent()}</div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return <div className="p-4">{content}</div>;
  }

  return (
    <AppShell>
      <div className="p-4">
        {content}
      </div>
    </AppShell>
  );
};

export default ArtistProfile;

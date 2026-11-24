import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Spinner } from '../components/ui/AppPrimitives';
import { useWorkspace } from '../contexts/WorkspaceContext';
import GestionShell from '../features/management/GestionShell';
import ProfileEditor, { type ProfileDraft, type ProfileSave } from '../features/management/ProfileEditor';
import { LINK_KEYS, canEditProfile, mergeLinks } from '../features/management/profileForm';
import { artistService } from '../services/artist.service';
import { teamService } from '../services/team.service';
import { venueService } from '../services/venue.service';
import type { Artist, VenuePlace } from '../lib/types';

// /gestion/perfil: the active artist or venue's public profile, editable by
// owners, admins and editors (RLS artists_manage / venues_manage).

const draftFromArtist = (artist: Artist): ProfileDraft => ({
  photoUrl: artist.avatar_url,
  city: artist.city ?? '',
  bio: artist.bio ?? '',
  genres: artist.genres ?? [],
  links: Object.fromEntries(LINK_KEYS.map(key => [key, artist.external_links?.[key] ?? ''])),
  address: '',
  capacity: '',
  website: '',
});

const draftFromVenue = (venue: VenuePlace): ProfileDraft => ({
  photoUrl: venue.cover_image_url ?? venue.photos?.[0] ?? null,
  city: venue.city ?? '',
  bio: '',
  genres: [],
  links: {},
  address: venue.address ?? '',
  capacity: venue.capacity ? String(venue.capacity) : '',
  website: venue.website_url ?? '',
});

const GestionPerfil: React.FC = () => {
  const { activeWorkspace, ready } = useWorkspace();
  const entity = activeWorkspace && (activeWorkspace.type === 'artist' || activeWorkspace.type === 'venue') ? activeWorkspace : null;
  const [artist, setArtist] = useState<Artist | null>(null);
  const [venue, setVenue] = useState<VenuePlace | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!entity) {
      setLoading(false);
      return undefined;
    }
    let live = true;
    setLoading(true);
    const load = entity.type === 'artist'
      ? artistService.getArtistBySubject(entity.subject_id).then(row => live && setArtist(row))
      : venueService.getVenueBySubject(entity.subject_id).then(row => live && setVenue(row));
    load
      .catch(() => live && setError('No se ha podido cargar el perfil.'))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [entity?.subject_id, entity?.type]);

  const name = artist?.name ?? venue?.name ?? (entity?.artist?.name || entity?.venue?.name || 'Tu perfil');
  const kind = entity?.type === 'venue' ? 'venue' : 'artist';
  const publicPath = artist ? `/tabs/artist/${artist.id}` : venue ? `/tabs/venue/${venue.id}` : null;

  const uploadPhoto = async (file: File) => {
    if (!entity) throw new Error('Elige un perfil.');
    const url = await teamService.uploadProfilePhoto(entity.subject_id, file);
    if (artist) await artistService.setPhoto(artist.id, url);
    if (venue) await venueService.setPhoto(venue.id, url);
    return url;
  };

  const save = async (values: ProfileSave) => {
    try {
      if (artist) {
        const updated = await artistService.updateArtist(artist.id, {
          city: values.city,
          bio: values.bio ?? null,
          genres: values.genres ?? [],
          external_links: mergeLinks(artist.external_links, values.links ?? {}),
        });
        setArtist(current => (current ? { ...current, ...updated, avatar_url: current.avatar_url } : current));
      }
      if (venue) {
        await venueService.updateVenue(venue.id, {
          city: values.city ?? venue.city,
          address: values.address ?? null,
          capacity: values.capacity ?? null,
          website_url: values.website ?? null,
        });
      }
    } catch {
      throw new Error('No se ha podido guardar. Prueba otra vez.');
    }
  };

  let body: React.ReactNode;
  if (!ready || loading) {
    body = <div className="flex justify-center py-16"><Spinner /></div>;
  } else if (!entity) {
    body = (
      <p className="pt-6 text-sm text-white/65">
        Elige qué perfil gestionas en <Link to="/gestion" className="font-semibold text-app-ink underline">el panel</Link>.
      </p>
    );
  } else if (error || (!artist && !venue)) {
    body = <p className="pt-6 text-sm text-rose-300">{error || 'No hemos encontrado este perfil.'}</p>;
  } else {
    body = (
      <>
        {publicPath ? (
          <Link
            to={publicPath}
            className="mt-1 inline-flex min-h-10 items-center rounded-full border border-app-line px-3.5 text-[13px] font-semibold text-app-ink"
          >
            Ver como fan
          </Link>
        ) : null}
        <ProfileEditor
          key={artist?.id ?? venue?.id}
          kind={kind}
          name={name}
          initial={artist ? draftFromArtist(artist) : draftFromVenue(venue as VenuePlace)}
          readOnly={!canEditProfile(entity.role)}
          onUploadPhoto={uploadPhoto}
          onSave={save}
        />
      </>
    );
  }

  return (
    <GestionShell title="Mi perfil" flushBottom={Boolean(entity && (artist || venue))}>
      {body}
    </GestionShell>
  );
};

export default GestionPerfil;

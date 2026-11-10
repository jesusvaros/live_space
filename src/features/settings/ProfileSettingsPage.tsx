import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { ProfileRole } from '../../lib/types';
import { useAuth } from '../../contexts/AuthContext';
import { useWorkspace } from '../../contexts/WorkspaceContext';
import { invalidateQueries } from '../../lib/queryClient';

// Ajustes → Perfil: what the old «Editar perfil» sheet of the profile tab
// had (name, username, city, bio, artist links and, for venue accounts, the
// managed venue's details).

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

const ProfileSettingsPage: React.FC = () => {
  const { user, profile, updateProfile, refreshProfile } = useAuth();
  const { managedEntities } = useWorkspace();
  const navigate = useNavigate();
  const isDev = Boolean((import.meta as any).env?.DEV);

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

  // With one managed venue there is no picker: edit that one.
  const firstVenueId = managedEntities.find(entity => entity.type === 'venue')?.venue?.id ?? null;
  useEffect(() => {
    if (!selectedVenuePlaceId && firstVenueId) setSelectedVenuePlaceId(firstVenueId);
  }, [firstVenueId, selectedVenuePlaceId]);

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
    setVenueCapacity(selectedVenuePlace.capacity !== null ? selectedVenuePlace.capacity.toString() : '');
    setVenueType(selectedVenuePlace.venue_type || '');
    setVenueLatitude(selectedVenuePlace.latitude !== null ? selectedVenuePlace.latitude.toString() : '');
    setVenueLongitude(selectedVenuePlace.longitude !== null ? selectedVenuePlace.longitude.toString() : '');
    setVenuePhotos((selectedVenuePlace.photos || []).join('\n'));
  }, [selectedVenuePlace]);

  const handleSave = async () => {
    setFormError('');
    setMessage('');
    setSaving(true);

    const nextLinks: Record<string, string> = { ...((profile?.external_links as Record<string, string>) || {}) };
    const applyLink = (key: string, value: string) => {
      const trimmed = value.trim();
      if (trimmed) nextLinks[key] = trimmed;
      else delete nextLinks[key];
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
    if (isDev) updates.role = role;

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
    // The profile tab reloads its header and lists the next time it shows.
    invalidateQueries('["profile:data"');
    setMessage('Perfil actualizado.');
    setSaving(false);
  };

  return (
    <div className="space-y-4 rounded-2xl border border-white/10 bg-white/5 p-4">
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
        onClick={() => navigate('/ajustes')}
      >
        Cancelar
      </button>
    </div>
  );
};

export default ProfileSettingsPage;

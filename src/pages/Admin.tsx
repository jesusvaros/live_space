import React, { useEffect, useState } from 'react';
import { Spinner } from '../components/ui/AppPrimitives';
import { CircleMarker, MapContainer } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import AppShell from '../components/AppShell';
import { useAuth } from '../contexts/AuthContext';
import MapLibreLayer from '../components/MapLibreLayer';
import MapResizeObserver from '../components/MapResizeObserver';
import { MapFocus, VenueMapClick } from '../components/event/create/MapHelpers';
import { managementService } from '../services/management.service';
import { artistService } from '../services/artist.service';
import { venueService } from '../services/venue.service';
import { supabase } from '../lib/supabase';
import ClaimsQueue from '../components/admin/ClaimsQueue';

type AdminTab = 'claims' | 'artist' | 'venue' | 'grant' | 'access';

type AccessRow = {
  profile_id: string;
  subject_id: string;
  role: string;
  created_at?: string;
  admin?: {
    id: string;
    username: string | null;
    display_name: string | null;
    avatar_url: string | null;
  };
  entity?: {
    type: 'artist' | 'venue' | string;
    profile?: { username: string | null; display_name: string | null };
    venue_place?: { name: string; city: string | null };
    artist?: { name: string; city: string | null };
  };
};

const tabs: Array<{ key: AdminTab; label: string }> = [
  { key: 'claims', label: 'Solicitudes' },
  { key: 'artist', label: 'Crear artista' },
  { key: 'venue', label: 'Crear sala' },
  { key: 'grant', label: 'Dar acceso' },
  { key: 'access', label: 'Ver accesos' },
];

const DEFAULT_VENUE_CENTER: [number, number] = [40.4168, -3.7038];

const Admin: React.FC = () => {
  const { profile } = useAuth();
  const [activeTab, setActiveTab] = useState<AdminTab>('claims');

  const [artistName, setArtistName] = useState('');
  const [artistCity, setArtistCity] = useState('');
  const [artistType, setArtistType] = useState<'solo' | 'band'>('solo');
  const [artistGenres, setArtistGenres] = useState('');
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistMessage, setArtistMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [venueName, setVenueName] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [venueType, setVenueType] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueWebsite, setVenueWebsite] = useState('');
  const [venueCapacity, setVenueCapacity] = useState('');
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueMessage, setVenueMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [venueMapCenter, setVenueMapCenter] = useState<[number, number]>(DEFAULT_VENUE_CENTER);
  const [venueLatitude, setVenueLatitude] = useState<number | null>(null);
  const [venueLongitude, setVenueLongitude] = useState<number | null>(null);
  const [reverseGeoInput, setReverseGeoInput] = useState('');
  const [reverseGeoLoading, setReverseGeoLoading] = useState(false);
  const [reverseGeoMessage, setReverseGeoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [grantLoading, setGrantLoading] = useState(false);
  const [grantMessage, setGrantMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [userQuery, setUserQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [entityQuery, setEntityQuery] = useState('');
  const [entityType, setEntityType] = useState<'artist' | 'venue'>('artist');
  const [entities, setEntities] = useState<any[]>([]);
  const [selectedEntity, setSelectedEntity] = useState<any>(null);

  const [accessLoading, setAccessLoading] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [rows, setRows] = useState<AccessRow[]>([]);

  useEffect(() => {
    if (profile?.role !== 'admin' || activeTab !== 'grant') return;
    let cancelled = false;
    const run = async () => {
      if (userQuery.length <= 2) {
        setUsers([]);
        return;
      }
      try {
        const data = await managementService.searchProfiles(userQuery);
        if (!cancelled) setUsers(data || []);
      } catch {
        if (!cancelled) setUsers([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, profile?.role, userQuery]);

  useEffect(() => {
    if (profile?.role !== 'admin' || activeTab !== 'grant') return;
    let cancelled = false;
    const run = async () => {
      if (entityQuery.length <= 2) {
        setEntities([]);
        return;
      }
      try {
        const data =
          entityType === 'artist'
            ? await managementService.searchArtists(entityQuery)
            : await managementService.searchVenues(entityQuery);
        if (!cancelled) setEntities(data || []);
      } catch {
        if (!cancelled) setEntities([]);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [activeTab, entityQuery, entityType, profile?.role]);

  useEffect(() => {
    if (profile?.role !== 'admin' || activeTab !== 'access') return;
    let cancelled = false;
    const loadAccesses = async () => {
      setAccessLoading(true);
      setAccessError(null);
      try {
        const { data, error } = await supabase
          .from('entity_memberships')
          .select(`
            profile_id,
            subject_id,
            role,
            created_at,
            admin:profiles!entity_memberships_profile_id_fkey (
              id,
              username,
              display_name,
              avatar_url
            ),
            entity:subjects!entity_memberships_subject_id_fkey (
              type,
              venue_place:venue_places!subjects_venue_place_id_fkey (
                name,
                city
              ),
              artist:artists!subjects_artist_id_fkey (
                name,
                city
              )
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        if (!cancelled) setRows((data || []) as unknown as AccessRow[]);
      } catch (e: any) {
        if (!cancelled) setAccessError(e?.message || 'No se han podido cargar los accesos');
      } finally {
        if (!cancelled) setAccessLoading(false);
      }
    };
    loadAccesses();
    return () => {
      cancelled = true;
    };
  }, [activeTab, profile?.role]);

  useEffect(() => {
    if (activeTab !== 'venue') return;
    if (!navigator?.geolocation || venueLatitude !== null || venueLongitude !== null) return;
    navigator.geolocation.getCurrentPosition(
      position => {
        setVenueMapCenter([position.coords.latitude, position.coords.longitude]);
      },
      () => undefined,
      { enableHighAccuracy: false, timeout: 6000, maximumAge: 60000 }
    );
  }, [activeTab, venueLatitude, venueLongitude]);

  const runReverseGeocode = async (lat: number, lng: number) => {
    setReverseGeoLoading(true);
    setReverseGeoMessage(null);
    try {
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&addressdetails=1`
      );
      if (!response.ok) throw new Error('No se ha podido obtener la dirección');
      const data = await response.json();
      const address = data?.address || {};
      const city =
        address.city ||
        address.town ||
        address.village ||
        address.municipality ||
        address.county ||
        address.state ||
        '';
      const addressLine = [address.road, address.house_number].filter(Boolean).join(' ').trim();
      const fallbackAddress = typeof data?.display_name === 'string'
        ? data.display_name.split(',').slice(0, 2).join(', ').trim()
        : '';

      if (city) setVenueCity(city);
      if (addressLine || fallbackAddress) setVenueAddress(addressLine || fallbackAddress);
      setReverseGeoMessage({ type: 'success', text: 'Dirección actualizada a partir de las coordenadas' });
    } catch (error: any) {
      setReverseGeoMessage({ type: 'error', text: error?.message || 'No se ha podido obtener la dirección de esas coordenadas' });
    } finally {
      setReverseGeoLoading(false);
    }
  };

  const handleVenueMapSelect = (lat: number, lng: number) => {
    setVenueLatitude(lat);
    setVenueLongitude(lng);
    setVenueMapCenter([lat, lng]);
    setReverseGeoInput(`${lat.toFixed(6)}, ${lng.toFixed(6)}`);
    void runReverseGeocode(lat, lng);
  };

  const handleReverseGeocodeFromInput = async () => {
    const match = reverseGeoInput.match(/^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/);
    if (!match) {
      setReverseGeoMessage({ type: 'error', text: 'Usa el formato: lat,lng' });
      return;
    }
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    const isValid = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    if (!isValid) {
      setReverseGeoMessage({ type: 'error', text: 'Coordenadas fuera de rango' });
      return;
    }
    setVenueLatitude(lat);
    setVenueLongitude(lng);
    setVenueMapCenter([lat, lng]);
    await runReverseGeocode(lat, lng);
  };

  const handleCreateArtist = async () => {
    if (!artistName.trim()) {
      setArtistMessage({ type: 'error', text: 'El nombre del artista es obligatorio' });
      return;
    }
    setArtistLoading(true);
    setArtistMessage(null);
    try {
      const genres = artistGenres
        .split(',')
        .map((g) => g.trim())
        .filter(Boolean);
      await artistService.createArtist({
        name: artistName.trim(),
        artist_type: artistType,
        city: artistCity.trim() || null,
        bio: null,
        avatar_url: null,
        genres,
        external_links: {},
      });
      setArtistMessage({ type: 'success', text: 'Artista creado' });
      setArtistName('');
      setArtistCity('');
      setArtistGenres('');
      setArtistType('solo');
    } catch (e: any) {
      setArtistMessage({ type: 'error', text: e?.message || 'No se ha podido crear el artista' });
    } finally {
      setArtistLoading(false);
    }
  };

  const handleCreateVenue = async () => {
    if (!venueName.trim() || !venueCity.trim()) {
      setVenueMessage({ type: 'error', text: 'El nombre de la sala y la ciudad son obligatorios' });
      return;
    }
    setVenueLoading(true);
    setVenueMessage(null);
    try {
      const capacity = venueCapacity ? Number(venueCapacity) : null;
      await venueService.createVenue({
        name: venueName.trim(),
        city: venueCity.trim(),
        address: venueAddress.trim() || null,
        capacity: Number.isNaN(capacity) ? null : capacity,
        venue_type: venueType.trim() || null,
        latitude: venueLatitude,
        longitude: venueLongitude,
        website_url: venueWebsite.trim() || null,
        photos: [],
        created_by: profile?.id ?? null,
      });
      setVenueMessage({ type: 'success', text: 'Sala creada' });
      setVenueName('');
      setVenueCity('');
      setVenueAddress('');
      setVenueWebsite('');
      setVenueCapacity('');
      setVenueType('');
      setVenueLatitude(null);
      setVenueLongitude(null);
      setVenueMapCenter(DEFAULT_VENUE_CENTER);
      setReverseGeoInput('');
      setReverseGeoMessage(null);
    } catch (e: any) {
      setVenueMessage({ type: 'error', text: e?.message || 'No se ha podido crear la sala' });
    } finally {
      setVenueLoading(false);
    }
  };

  const handleGrant = async () => {
    if (!selectedUser || !selectedEntity) return;
    setGrantLoading(true);
    setGrantMessage(null);
    try {
      await managementService.adminGrantEntityAccess(
        selectedUser.id,
        entityType,
        selectedEntity.id,
        'admin'
      );
      setGrantMessage({ type: 'success', text: 'Acceso concedido' });
      setSelectedUser(null);
      setSelectedEntity(null);
      setUserQuery('');
      setEntityQuery('');
    } catch (e: any) {
      setGrantMessage({ type: 'error', text: e?.message || 'No se ha podido dar acceso' });
    } finally {
      setGrantLoading(false);
    }
  };

  const renderEntityLabel = (row: AccessRow) => {
    if (!row.entity) return row.subject_id;
    if (row.entity.type === 'artist' && row.entity.artist) return row.entity.artist.name;
    if (row.entity.type === 'venue' && row.entity.venue_place) return row.entity.venue_place.name;
    if (row.entity.profile) return row.entity.profile.display_name || row.entity.profile.username || row.subject_id;
    return row.subject_id;
  };

  const renderEntityMeta = (row: AccessRow) => {
    if (!row.entity) return '';
    if (row.entity.type === 'artist' && row.entity.artist?.city) return row.entity.artist.city;
    if (row.entity.type === 'venue' && row.entity.venue_place?.city) return row.entity.venue_place.city;
    return '';
  };

  if (profile?.role !== 'admin') {
    return (
      <AppShell headerProps={{ title: 'Admin', showBack: true }}>
        <div className="p-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 text-sm text-white/70">
            Acceso denegado. Solo para administradores.
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell headerProps={{ title: 'Admin', showBack: true }}>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))]">
        <div className="grid gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-2 grid-cols-2 sm:grid-cols-5">
          {tabs.map(tab => {
            const isActive = tab.key === activeTab;
            return (
              <button
                key={tab.key}
                type="button"
                className={`rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition-colors ${
                  isActive
                    ? 'bg-app-accent text-white'
                    : 'bg-white/[0.02] text-white/70 hover:text-white'
                }`}
                onClick={() => setActiveTab(tab.key)}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {activeTab === 'claims' && <ClaimsQueue />}

        {activeTab === 'artist' && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-white/70">Crea un artista para poder publicar y asignar accesos.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Nombre del artista *"
                value={artistName}
                onChange={e => setArtistName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <input
                type="text"
                placeholder="Ciudad"
                value={artistCity}
                onChange={e => setArtistCity(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <select
                value={artistType}
                onChange={e => setArtistType(e.target.value as 'solo' | 'band')}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              >
                <option value="solo">Solo</option>
                <option value="band">Grupo</option>
              </select>
              <input
                type="text"
                placeholder="Géneros (separados por comas)"
                value={artistGenres}
                onChange={e => setArtistGenres(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60 sm:col-span-2"
              />
            </div>
            {artistMessage && (
              <div className={`rounded-xl p-3 text-sm ${
                artistMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
              }`}>
                {artistMessage.text}
              </div>
            )}
            <button
              type="button"
              disabled={artistLoading}
              onClick={handleCreateArtist}
              className="inline-flex w-full items-center justify-center rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {artistLoading ? <Spinner /> : 'Crear artista'}
            </button>
          </section>
        )}

        {activeTab === 'venue' && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-white/70">Crea una sala para gestionar sus eventos y contenido.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                type="text"
                placeholder="Nombre de la sala *"
                value={venueName}
                onChange={e => setVenueName(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <input
                type="text"
                placeholder="Ciudad *"
                value={venueCity}
                onChange={e => setVenueCity(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <input
                type="text"
                placeholder="Tipo (club, teatro...)"
                value={venueType}
                onChange={e => setVenueType(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <input
                type="text"
                placeholder="Web"
                value={venueWebsite}
                onChange={e => setVenueWebsite(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <input
                type="text"
                placeholder="Dirección"
                value={venueAddress}
                onChange={e => setVenueAddress(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60 sm:col-span-2"
              />
              <input
                type="number"
                placeholder="Aforo"
                value={venueCapacity}
                onChange={e => setVenueCapacity(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
              />
              <div className="sm:col-span-2">
                <div className="mb-3 flex flex-col gap-2 sm:flex-row">
                  <input
                    type="text"
                    placeholder="lat,lng (buscar dirección)"
                    value={reverseGeoInput}
                    onChange={e => setReverseGeoInput(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
                  />
                  <button
                    type="button"
                    onClick={handleReverseGeocodeFromInput}
                    disabled={reverseGeoLoading}
                    className="inline-flex min-w-[146px] items-center justify-center rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3 text-sm font-semibold text-white/85 transition hover:bg-white/[0.1] disabled:opacity-60"
                  >
                    {reverseGeoLoading ? <Spinner /> : 'Buscar dirección'}
                  </button>
                </div>
                <div className="relative h-[230px] overflow-hidden rounded-2xl border border-white/10 bg-black/35 sm:h-[280px]">
                  <MapContainer
                    center={venueMapCenter}
                    zoom={12}
                    className="map-dark h-full w-full"
                    zoomControl={false}
                    style={{ height: '100%', width: '100%' }}
                  >
                    <MapLibreLayer />
                    <MapResizeObserver />
                    {venueLatitude !== null && venueLongitude !== null ? (
                      <CircleMarker
                        center={[venueLatitude, venueLongitude]}
                        radius={8}
                        pathOptions={{ color: '#ff5b2e', fillColor: '#ff5b2e', fillOpacity: 0.85 }}
                      />
                    ) : null}
                    <MapFocus center={venueMapCenter} />
                    <VenueMapClick enabled onSelect={handleVenueMapSelect} />
                  </MapContainer>
                </div>
                <p className="mt-2 text-xs text-white/60">
                  Toca el mapa para marcar la ubicación. Rellenaremos la ciudad y la dirección automáticamente.
                </p>
                {reverseGeoMessage && (
                  <div className={`mt-3 rounded-xl p-3 text-sm ${
                    reverseGeoMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
                  }`}>
                    {reverseGeoMessage.text}
                  </div>
                )}
              </div>
            </div>
            {venueMessage && (
              <div className={`rounded-xl p-3 text-sm ${
                venueMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
              }`}>
                {venueMessage.text}
              </div>
            )}
            <button
              type="button"
              disabled={venueLoading}
              onClick={handleCreateVenue}
              className="inline-flex w-full items-center justify-center rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {venueLoading ? <Spinner /> : 'Crear sala'}
            </button>
          </section>
        )}

        {activeTab === 'grant' && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-sm text-white/70">Da acceso a un usuario para gestionar un artista o una sala.</p>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Buscar usuario</p>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Busca por usuario o nombre visible..."
                  value={userQuery}
                  onChange={e => setUserQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
                />
                {users.length > 0 && !selectedUser && (
                  <div className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#161922] shadow-xl">
                    {users.map(u => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => {
                          setSelectedUser(u);
                          setUserQuery(u.username || u.display_name || '');
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/[0.05]"
                      >
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-bold text-white/70">
                            {u.username?.[0]?.toUpperCase() || '?'}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-white">{u.username}</div>
                          <div className="text-xs text-white/55">{u.display_name}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedUser && (
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <span className="text-sm text-white/85">Seleccionado: <strong>{selectedUser.username}</strong></span>
                  <button type="button" onClick={() => setSelectedUser(null)} className="text-xs text-white/65 hover:text-white">Quitar</button>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Elegir artista o sala</p>
              <div className="inline-flex rounded-xl border border-white/10 bg-white/[0.02] p-1">
                <button
                  type="button"
                  onClick={() => {
                    setEntityType('artist');
                    setSelectedEntity(null);
                    setEntityQuery('');
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${entityType === 'artist' ? 'bg-app-accent text-white' : 'text-white/70'}`}
                >
                  Artista
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEntityType('venue');
                    setSelectedEntity(null);
                    setEntityQuery('');
                  }}
                  className={`rounded-lg px-4 py-2 text-sm font-semibold ${entityType === 'venue' ? 'bg-app-accent text-white' : 'text-white/70'}`}
                >
                  Sala
                </button>
              </div>
              <div className="relative">
                <input
                  type="text"
                  placeholder={`Buscar ${entityType === 'artist' ? 'artista' : 'sala'}...`}
                  value={entityQuery}
                  onChange={e => setEntityQuery(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-white/[0.02] p-3 text-white outline-none focus:border-app-accent/60"
                />
                {entities.length > 0 && !selectedEntity && (
                  <div className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-[#161922] shadow-xl">
                    {entities.map(e => (
                      <button
                        key={e.id}
                        type="button"
                        onClick={() => {
                          setSelectedEntity(e);
                          setEntityQuery(e.name);
                        }}
                        className="flex w-full items-center gap-3 p-3 text-left hover:bg-white/[0.05]"
                      >
                        {e.image_url ? (
                          <img src={e.image_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-xs font-bold text-white/70">
                            {e.name?.[0] || '?'}
                          </div>
                        )}
                        <div>
                          <div className="text-sm font-medium text-white">{e.name}</div>
                          {e.city ? <div className="text-xs text-white/55">{e.city}</div> : null}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedEntity && (
                <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] p-3">
                  <span className="text-sm text-white/85">Seleccionado: <strong>{selectedEntity.name}</strong></span>
                  <button type="button" onClick={() => setSelectedEntity(null)} className="text-xs text-white/65 hover:text-white">Quitar</button>
                </div>
              )}
            </div>

            {grantMessage && (
              <div className={`rounded-xl p-3 text-sm ${
                grantMessage.type === 'success' ? 'bg-emerald-500/10 text-emerald-300' : 'bg-rose-500/10 text-rose-300'
              }`}>
                {grantMessage.text}
              </div>
            )}
            <button
              type="button"
              disabled={!selectedUser || !selectedEntity || grantLoading}
              onClick={handleGrant}
              className="inline-flex w-full items-center justify-center rounded-xl bg-app-accent px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
            >
              {grantLoading ? <Spinner /> : 'Dar acceso'}
            </button>
          </section>
        )}

        {activeTab === 'access' && (
          <section className="space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white/70">Accesos concedidos</p>
              {accessLoading ? <Spinner /> : null}
            </div>
            {accessError ? (
              <div className="rounded-xl bg-rose-500/10 p-3 text-sm text-rose-300">{accessError}</div>
            ) : null}
            {!accessLoading && !accessError && rows.length === 0 ? (
              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-white/70">
                No hay accesos concedidos.
              </div>
            ) : null}
            <div className="space-y-3">
              {rows.map(row => (
                <div
                  key={`${row.profile_id}-${row.subject_id}`}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.02] p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 overflow-hidden rounded-full bg-white/10">
                      {row.admin?.avatar_url ? (
                        <img src={row.admin.avatar_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-xs font-bold text-white/70">
                          {row.admin?.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {row.admin?.display_name || row.admin?.username || 'Admin desconocido'}
                      </div>
                      <div className="text-xs uppercase tracking-[0.18em] text-white/50">{row.role}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold text-white">{renderEntityLabel(row)}</div>
                    <div className="text-xs text-white/60">
                      {row.entity?.type === 'artist' ? 'ARTISTA' : row.entity?.type === 'venue' ? 'SALA' : row.entity?.type ? row.entity.type.toUpperCase() : 'Entidad'}
                      {renderEntityMeta(row) ? ` · ${renderEntityMeta(row)}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
};

export default Admin;

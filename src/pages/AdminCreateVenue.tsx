import React, { useState } from 'react';
import { Content, Page, Spinner } from '../components/ui/AppPrimitives';
import { venueService } from '../services/venue.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import AdminActionsNav from '../components/admin/AdminActionsNav';

const AdminCreateVenue: React.FC = () => {
  const { profile } = useAuth();
  const [venueName, setVenueName] = useState('');
  const [venueCity, setVenueCity] = useState('');
  const [venueType, setVenueType] = useState('');
  const [venueAddress, setVenueAddress] = useState('');
  const [venueWebsite, setVenueWebsite] = useState('');
  const [venueCapacity, setVenueCapacity] = useState('');
  const [venueLoading, setVenueLoading] = useState(false);
  const [venueMessage, setVenueMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

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
        latitude: null,
        longitude: null,
        website_url: venueWebsite.trim() || null,
        photos: [],
        created_by: profile?.id ?? null
      });

      setVenueMessage({ type: 'success', text: 'Sala creada' });
      setVenueName('');
      setVenueCity('');
      setVenueAddress('');
      setVenueWebsite('');
      setVenueCapacity('');
      setVenueType('');
    } catch (error: any) {
      setVenueMessage({ type: 'error', text: error.message || 'No se pudo crear la sala' });
    } finally {
      setVenueLoading(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <Page>
        <Content className="p-4">
          <div className="flex h-full items-center justify-center text-app-light/60">Acceso denegado. Solo para admins.</div>
        </Content>
      </Page>
    );
  }

  return (
    <AppShell
      headerProps={{ title: 'Crear sala', showBack: true }}
      headerPlacement="outside"
      contentClassName="p-4"
      contentFullscreen={false}
      contentWrapperClassName={false}
    >
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <AdminActionsNav active="venue" />

          <p className="text-sm text-app-light/70">Crea una sala para gestionar sus eventos y contenido.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Nombre de la sala *"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Ciudad *"
              value={venueCity}
              onChange={(e) => setVenueCity(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Tipo (club, teatro...)"
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Web"
              value={venueWebsite}
              onChange={(e) => setVenueWebsite(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Dirección"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50 sm:col-span-2"
            />
            <input
              type="number"
              placeholder="Aforo"
              value={venueCapacity}
              onChange={(e) => setVenueCapacity(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50 sm:col-span-2"
            />
          </div>

          <div className="pt-2">
            {venueMessage && (
              <div className={`mb-4 rounded-xl p-4 text-sm font-medium ${venueMessage.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {venueMessage.text}
              </div>
            )}
            <button
              disabled={venueLoading}
              onClick={handleCreateVenue}
              className="flex w-full items-center justify-center rounded-2xl bg-white/10 py-4 font-bold text-app-light shadow-lg shadow-white/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {venueLoading ? <Spinner /> : 'Crear sala'}
            </button>
          </div>
      </div>
    </AppShell>
  );
};

export default AdminCreateVenue;

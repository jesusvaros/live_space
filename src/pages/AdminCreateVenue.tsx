import React, { useState } from 'react';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
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
      setVenueMessage({ type: 'error', text: 'Venue name and city are required' });
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

      setVenueMessage({ type: 'success', text: 'Venue created successfully' });
      setVenueName('');
      setVenueCity('');
      setVenueAddress('');
      setVenueWebsite('');
      setVenueCapacity('');
      setVenueType('');
    } catch (error: any) {
      setVenueMessage({ type: 'error', text: error.message || 'Failed to create venue' });
    } finally {
      setVenueLoading(false);
    }
  };

  if (profile?.role !== 'admin') {
    return (
      <IonPage>
        <IonContent className="ion-padding">
          <div className="flex h-full items-center justify-center text-app-light/60">Access Denied. Admin only.</div>
        </IonContent>
      </IonPage>
    );
  }

  return (
    <AppShell
      headerProps={{ title: 'Create Venue', showBack: true }}
      headerPlacement="outside"
      contentClassName="ion-padding"
      contentFullscreen={false}
      contentWrapperClassName={false}
    >
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <AdminActionsNav active="venue" />

          <p className="text-sm text-app-light/70">Create a venue entity to manage events and content.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Venue name *"
              value={venueName}
              onChange={(e) => setVenueName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="City *"
              value={venueCity}
              onChange={(e) => setVenueCity(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Type (club, theatre...)"
              value={venueType}
              onChange={(e) => setVenueType(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Website"
              value={venueWebsite}
              onChange={(e) => setVenueWebsite(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Address"
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50 sm:col-span-2"
            />
            <input
              type="number"
              placeholder="Capacity"
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
              {venueLoading ? <IonSpinner name="crescent" color="light" /> : 'Create Venue'}
            </button>
          </div>
      </div>
    </AppShell>
  );
};

export default AdminCreateVenue;

import React, { useState } from 'react';
import { IonContent, IonPage, IonSpinner } from '@ionic/react';
import { artistService } from '../services/artist.service';
import { useAuth } from '../contexts/AuthContext';
import AppShell from '../components/AppShell';
import AdminActionsNav from '../components/admin/AdminActionsNav';

const AdminCreateArtist: React.FC = () => {
  const { profile } = useAuth();
  const [artistName, setArtistName] = useState('');
  const [artistCity, setArtistCity] = useState('');
  const [artistType, setArtistType] = useState<'solo' | 'band'>('solo');
  const [artistGenres, setArtistGenres] = useState('');
  const [artistAvatar, setArtistAvatar] = useState('');
  const [artistLoading, setArtistLoading] = useState(false);
  const [artistMessage, setArtistMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleCreateArtist = async () => {
    if (!artistName.trim()) {
      setArtistMessage({ type: 'error', text: 'Artist name is required' });
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
        avatar_url: artistAvatar.trim() || null,
        genres,
        external_links: {}
      });

      setArtistMessage({ type: 'success', text: 'Artist created successfully' });
      setArtistName('');
      setArtistCity('');
      setArtistGenres('');
      setArtistAvatar('');
      setArtistType('solo');
    } catch (error: any) {
      setArtistMessage({ type: 'error', text: error.message || 'Failed to create artist' });
    } finally {
      setArtistLoading(false);
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
      headerProps={{ title: 'Create Artist', showBack: true }}
      headerPlacement="outside"
      contentClassName="ion-padding"
      contentFullscreen={false}
      contentWrapperClassName={false}
    >
      <div className="mx-auto max-w-2xl space-y-6 py-6">
        <AdminActionsNav active="artist" />

          <p className="text-sm text-app-light/70">Create an artist entity so you can publish and assign access.</p>

          <div className="grid gap-3 sm:grid-cols-2">
            <input
              type="text"
              placeholder="Artist name *"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="City"
              value={artistCity}
              onChange={(e) => setArtistCity(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <select
              value={artistType}
              onChange={(e) => setArtistType(e.target.value as 'solo' | 'band')}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            >
              <option value="solo">Solo</option>
              <option value="band">Band</option>
            </select>
            <input
              type="text"
              placeholder="Avatar URL"
              value={artistAvatar}
              onChange={(e) => setArtistAvatar(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50"
            />
            <input
              type="text"
              placeholder="Genres (comma separated)"
              value={artistGenres}
              onChange={(e) => setArtistGenres(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-white/5 p-4 text-app-light outline-none focus:border-app-ink/50 sm:col-span-2"
            />
          </div>

          <div className="pt-2">
            {artistMessage && (
              <div className={`mb-4 rounded-xl p-4 text-sm font-medium ${artistMessage.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                {artistMessage.text}
              </div>
            )}
            <button
              disabled={artistLoading}
              onClick={handleCreateArtist}
              className="flex w-full items-center justify-center rounded-2xl bg-white/10 py-4 font-bold text-app-light shadow-lg shadow-white/10 transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
            >
              {artistLoading ? <IonSpinner name="crescent" color="light" /> : 'Create Artist'}
            </button>
          </div>
      </div>
    </AppShell>
  );
};

export default AdminCreateArtist;

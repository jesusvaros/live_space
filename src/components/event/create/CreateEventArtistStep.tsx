import React from 'react';
import { IonSpinner } from '@ionic/react';
import { ProfileRole } from '../../../lib/types';

export type ArtistOption = {
  id: string;
  display_name: string | null;
  username: string | null;
  role: ProfileRole;
};

type CreateEventArtistStepProps = {
  profileRole?: ProfileRole | null;
  profileName?: string | null;
  artists: ArtistOption[];
  selectedArtistId: string | null;
  artistsLoading: boolean;
  onSelectArtist: (artistId: string | null) => void;
};

const CreateEventArtistStep: React.FC<CreateEventArtistStepProps> = ({
  profileRole,
  profileName,
  artists,
  selectedArtistId,
  artistsLoading,
  onSelectArtist,
}) => {
  return (
    <section className="app-card space-y-3 p-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Artist</p>
        <p className="mt-2 text-sm text-slate-500">One artist per event.</p>
      </div>
      {profileRole === 'artist' ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
          <div>
            <p className="text-sm text-slate-50">{profileName || 'Your artist profile'}</p>
            <p className="text-xs text-slate-400">Artist</p>
          </div>
        </div>
      ) : (
        <label className="app-field">
          <span className="app-label">Select artist</span>
          {artistsLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <IonSpinner name="crescent" />
              Loading artists...
            </div>
          ) : (
            <select
              className="app-select"
              value={selectedArtistId || ''}
              onChange={e => onSelectArtist(e.target.value || null)}
            >
              <option value="" disabled>
                Choose an artist
              </option>
              {artists.map(artist => (
                <option key={artist.id} value={artist.id}>
                  {artist.display_name || artist.username || 'Artist'}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
    </section>
  );
};

export default CreateEventArtistStep;

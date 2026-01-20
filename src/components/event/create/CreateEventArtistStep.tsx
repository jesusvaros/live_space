import React, { useState } from 'react';
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
  selectedArtistIds: string[];
  artistsLoading: boolean;
  onSelectArtists: (artistIds: string[]) => void;
};

const CreateEventArtistStep: React.FC<CreateEventArtistStepProps> = ({
  profileRole,
  profileName,
  artists,
  selectedArtistIds,
  artistsLoading,
  onSelectArtists,
}) => {
  const [artistMode, setArtistMode] = useState<'existing' | 'new'>('existing');
  const [newArtistName, setNewArtistName] = useState('');
  const [newArtistUsername, setNewArtistUsername] = useState('');

  const toggleArtist = (artistId: string) => {
    if (selectedArtistIds.includes(artistId)) {
      // Remove artist
      onSelectArtists(selectedArtistIds.filter(id => id !== artistId));
    } else {
      // Add artist
      onSelectArtists([...selectedArtistIds, artistId]);
    }
  };

  const selectedArtists = artists.filter(artist => selectedArtistIds.includes(artist.id));

  // Auto-select current artist if they are an artist and no artists are selected yet
  React.useEffect(() => {
    if (profileRole === 'artist' && selectedArtistIds.length === 0) {
      // Find current artist in the list and auto-select them
      const currentArtist = artists.find(artist => 
        artist.display_name === profileName || artist.username === profileName
      );
      if (currentArtist) {
        onSelectArtists([currentArtist.id]);
      }
    }
  }, [profileRole, profileName, artists, selectedArtistIds.length, onSelectArtists]);

  const toggleArtistMode = () => {
    setArtistMode(prev => (prev === 'existing' ? 'new' : 'existing'));
  };

  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.45)] h-full">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[14px] font-semibold uppercase tracking-[0.3em] text-slate-400">Artists</p>
          <p className="mt-1 text-sm text-slate-500">
            {profileRole === 'artist' ? 'Add yourself and other artists to your event.' : 'Add multiple artists to your event.'}
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full text-sm font-semibold text-[#ffd1c4]"
          onClick={toggleArtistMode}
        >
          {artistMode === 'existing' ? 'New artist' : 'Use existing'}
        </button>
      </div>

      {artistMode === 'existing' ? (
        <>
          {artistsLoading ? (
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <IonSpinner name="crescent" />
              Loading artists...
            </div>
          ) : artists.length === 0 ? (
            <p className="h-[250px] text-sm text-slate-500">
              No artists found. Switch to &quot;New artist&quot; to add one.
            </p>
          ) : (
            <>
              {/* Selected Artists - Fixed */}
              {selectedArtists.length > 0 && (
                <div className="space-y-2 flex-shrink-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
                    Selected Artists ({selectedArtists.length})
                  </p>
                  <div className="space-y-2">
                    {selectedArtists.map(artist => (
                      <div key={artist.id} className="flex items-center justify-between gap-3 rounded-xl border border-orange-400/60 bg-orange-500/10 p-3">
                        <div>
                          <p className="text-sm font-medium text-orange-100">
                            {artist.display_name || artist.username || 'Artist'}
                            {profileRole === 'artist' && (artist.display_name === profileName || artist.username === profileName) && (
                              <span className="ml-2 text-xs text-orange-200/80">(You)</span>
                            )}
                          </p>
                          <p className="text-xs text-orange-200/80">Artist</p>
                        </div>
                        <button
                          type="button"
                          className="inline-flex items-center justify-center rounded-lg px-2 py-1 text-xs font-medium text-orange-200 hover:bg-orange-500/20"
                          onClick={() => toggleArtist(artist.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Artist List - Scrollable Only Here */}
              <div className="overflow-auto max-h-[250px] pr-1">
                <div className="space-y-3">
                  {artists
                    .filter(artist => !selectedArtistIds.includes(artist.id))
                    .map(artist => (
                      <div
                        key={artist.id}
                        className="flex cursor-pointer items-center gap-4 rounded-2xl border p-4 text-left transition-all hover:border-white/20 hover:bg-white/10 border-white/10 bg-white/5"
                        onClick={() => toggleArtist(artist.id)}
                      >
                        {/* Artist Avatar Placeholder */}
                        <div className="flex h-16 w-16 items-center justify-center rounded-xl overflow-hidden bg-gradient-to-br from-purple-700 to-purple-800 flex-shrink-0">
                          <div className="h-8 w-8 rounded-full bg-purple-600/30 flex items-center justify-center">
                            <span className="text-sm font-semibold text-purple-200">
                              {(artist.display_name || artist.username || 'A')[0]?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                        
                        {/* Artist Info */}
                        <div className="flex-1 min-w-0">
                          <h3 className="text-sm font-semibold text-slate-50 mb-1">
                            {artist.display_name || artist.username || 'Artist'}
                            {profileRole === 'artist' && (artist.display_name === profileName || artist.username === profileName) && (
                              <span className="ml-2 text-xs text-slate-400">(You)</span>
                            )}
                          </h3>
                          <p className="text-xs text-slate-400">
                            Artist
                          </p>
                        </div>
                        
                        {/* Add Button */}
                        <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-dashed border-white/30 flex-shrink-0">
                          <svg className="h-4 w-4 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                          </svg>
                        </div>
                      </div>
                    ))}
                </div>
              </div>

              {/* No Selection Message - Fixed */}
              {selectedArtists.length === 0 && (
                <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 flex-shrink-0">
                  <p className="text-sm text-slate-50">Select artists to continue</p>
                </div>
              )}
            </>
          )}
        </>
      ) : (
        <div className="space-y-4">
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
              Artist name
            </span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
              value={newArtistName}
              onChange={e => setNewArtistName(e.target.value)}
              placeholder="Artist name"
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Username</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
              value={newArtistUsername}
              onChange={e => setNewArtistUsername(e.target.value)}
              placeholder="Username"
            />
          </label>
          <p className="text-xs text-slate-500">Note: You can assign a user to this artist later.</p>
        </div>
      )}
    </section>
  );
};

export default CreateEventArtistStep;

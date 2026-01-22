import React from 'react';
import { ArtistProfileArtist } from './types';
import { IconMap } from '../icons';

type AboutSectionProps = {
  artist: ArtistProfileArtist;
  isManager: boolean;
  playedCount: number;
  onCreateShow: () => void;
  onOpenMap: () => void;
};

const AboutSection: React.FC<AboutSectionProps> = ({
  artist,
  isManager,
  playedCount,
  onCreateShow,
  onOpenMap,
}) => (
  <section className="space-y-3">
    <div>
      <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">About</p>
      <h2 className="font-display text-xl text-white">Artist info</h2>
    </div>
    <div className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">City</p>
          <p className="text-sm font-semibold text-white">{artist.city || '—'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Type</p>
          <p className="text-sm font-semibold text-white">{artist.artist_type === 'band' ? 'Band' : 'Solo artist'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Genres</p>
          <p className="text-sm font-semibold text-white">
            {artist.genres && artist.genres.length > 0 ? artist.genres.join(', ') : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Shows</p>
          <p className="text-sm font-semibold text-white">
            {playedCount > 0 ? `Played ${playedCount}` : 'Coming soon'}
          </p>
        </div>
      </div>
      {isManager && (
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            type="button"
            onClick={onCreateShow}
            className="inline-flex items-center gap-2 rounded-full border border-[#ff6b4a] bg-[#ff6b4a]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-[#ffb9a6] hover:bg-[#ff6b4a]/20"
          >
            Create show
          </button>
          <button
            type="button"
            onClick={onOpenMap}
            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:border-white/40"
          >
            <IconMap size={14} />
            View on map
          </button>
        </div>
      )}
    </div>
  </section>
);

export default AboutSection;

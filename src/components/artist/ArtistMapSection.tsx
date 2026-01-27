import React from 'react';
import { IconMap } from '../icons';

type ArtistMapSectionProps = {
  hasEvents: boolean;
  artistName: string;
  isManager: boolean;
  onOpenMap: () => void;
  onCreateShow: () => void;
};

const ArtistMapSection: React.FC<ArtistMapSectionProps> = ({
  hasEvents,
  artistName,
  isManager,
  onOpenMap,
  onCreateShow,
}) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Map</p>
        <h2 className="font-display text-xl font-bold text-white">Artist map</h2>
        <p className="text-sm text-white/55">Filtered to {artistName} by default.</p>
      </div>
      <button
        type="button"
        onClick={onOpenMap}
        className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 hover:text-white"
      >
        <IconMap size={16} />
        Open map
      </button>
    </div>
    <div className="overflow-hidden bg-white/5 p-5">
      {!hasEvents ? (
        <div className="flex flex-col items-start gap-2 text-white">
          <p className="text-lg font-semibold">No shows to display for this artist</p>
          <p className="text-sm text-white/55">
            New events will appear on the map as soon as they are published.
          </p>
          {isManager ? (
            <button
              type="button"
              onClick={onCreateShow}
              className="mt-2 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
            >
              Create show
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Map preview</p>
          <p className="text-sm text-white/55">
            Open the live map to explore where {artistName} is playing. The map starts filtered to this artist.
          </p>
          <div className="mt-3 h-40 bg-black/60" />
        </div>
      )}
    </div>
  </section>
);

export default ArtistMapSection;

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
        <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Map</p>
        <h2 className="font-display text-xl text-white">Artist map</h2>
        <p className="text-sm text-slate-400">Filtered to {artistName} by default.</p>
      </div>
      <button
        type="button"
        onClick={onOpenMap}
        className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6] transition"
      >
        <IconMap size={16} />
        Open map
      </button>
    </div>
    <div className="overflow-hidden rounded-2xl border border-dashed border-white/15 bg-gradient-to-br from-[#101522] via-[#0c101a] to-[#0a0d16] p-5">
      {!hasEvents ? (
        <div className="flex flex-col items-start gap-2 text-white">
          <p className="text-lg font-semibold">No shows to display for this artist</p>
          <p className="text-sm text-slate-400">
            New events will appear on the map as soon as they are published.
          </p>
          {isManager ? (
            <button
              type="button"
              onClick={onCreateShow}
              className="mt-2 inline-flex items-center gap-2 rounded-xl border border-white/15 bg-black/30 px-4 py-2 text-sm font-semibold text-white hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6]"
            >
              Create show
            </button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-white">Map preview</p>
          <p className="text-sm text-slate-400">
            Open the live map to explore where {artistName} is playing. The map starts filtered to this artist.
          </p>
          <div className="mt-3 h-40 rounded-xl border border-white/10 bg-[radial-gradient(circle_at_20%_20%,rgba(255,107,74,0.12),transparent_35%),radial-gradient(circle_at_80%_40%,rgba(255,255,255,0.08),transparent_30%),linear-gradient(135deg,#0d111a,#0b0e14)]" />
        </div>
      )}
    </div>
  </section>
);

export default ArtistMapSection;

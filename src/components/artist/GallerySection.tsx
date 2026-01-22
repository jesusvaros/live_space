import React from 'react';
import { PostWithSetlist } from '../../lib/types';

type GallerySectionProps = {
  gallery: PostWithSetlist[];
  onSelect: (id: string) => void;
  onViewGallery: () => void;
};

const GallerySection: React.FC<GallerySectionProps> = ({ gallery, onSelect, onViewGallery }) => {
  if (gallery.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Media</p>
          <h2 className="font-display text-xl text-white">Gallery</h2>
          <p className="text-sm text-slate-400">Live photos, posters, backstage.</p>
        </div>
        <button
          type="button"
          onClick={onViewGallery}
          className="text-xs font-semibold uppercase tracking-[0.14em] text-[#ffb9a6] underline decoration-[#ff6b4a]/60 underline-offset-4"
        >
          View gallery
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {gallery.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="group relative aspect-square overflow-hidden rounded-2xl border border-white/10 bg-[#0f1320]"
          >
            <img
              src={item.media_url}
              alt={item.caption || 'Gallery item'}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-105 group-hover:opacity-90"
            />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-black/10 to-transparent opacity-0 transition group-hover:opacity-100" />
          </button>
        ))}
      </div>
    </section>
  );
};

export default GallerySection;

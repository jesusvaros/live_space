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
    <section className="animate-fade-up space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/65">Media</p>
          <h2 className="font-display text-xl font-bold text-white">Gallery</h2>
          <p className="text-sm text-white/55">Live photos, posters, backstage.</p>
        </div>
        <button
          type="button"
          onClick={onViewGallery}
          className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.04] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/75 transition-colors hover:border-white/35 hover:text-white"
        >
          View gallery
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {gallery.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="group relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-white/5 transition-opacity hover:opacity-90"
          >
            <img
              src={item.media_url}
              alt={item.caption || 'Gallery item'}
              className="h-full w-full object-cover"
            />
          </button>
        ))}
      </div>
    </section>
  );
};

export default GallerySection;

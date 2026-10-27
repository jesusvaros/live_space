import React from 'react';
import { useNavigate } from 'react-router-dom';
import { PostWithSetlist } from '../../lib/types';

type MomentGridProps = {
  moments: Pick<PostWithSetlist, 'id' | 'media_type' | 'media_url' | 'thumbnail_url' | 'caption'>[];
  columns?: 3 | 4;
  limit?: number;
  // Small mono tag over each tile (the venue in the profile grid).
  label?: (index: number) => string | null | undefined;
};

// Portrait tiles of what the audience recorded; tap opens the moment.
const MomentGrid: React.FC<MomentGridProps> = ({ moments, columns = 4, limit, label }) => {
  const navigate = useNavigate();
  const items = typeof limit === 'number' ? moments.slice(0, limit) : moments;
  return (
    <div className={`grid gap-1 ${columns === 4 ? 'grid-cols-4' : 'grid-cols-3'}`}>
      {items.map((moment, index) => {
        const still = moment.thumbnail_url || (moment.media_type === 'image' ? moment.media_url : null);
        const tag = label?.(index);
        return (
          <button
            key={moment.id}
            type="button"
            onClick={() => navigate(`/post/${moment.id}`)}
            className={`relative aspect-[3/4] overflow-hidden bg-app-surface ${columns === 4 ? 'rounded-lg' : ''}`}
          >
            {still ? (
              <img src={still} alt={moment.caption || 'Momento'} loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <video muted playsInline preload="metadata" className="h-full w-full object-cover">
                <source src={`${moment.media_url}#t=0.1`} />
              </video>
            )}
            {tag ? (
              <span className="absolute bottom-1.5 left-1.5 max-w-[calc(100%-12px)] truncate rounded bg-black/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase text-app-ink">
                {tag}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
};

export default MomentGrid;

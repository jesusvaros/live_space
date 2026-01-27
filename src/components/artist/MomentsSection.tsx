import React from 'react';
import { PostWithSetlist } from '../../lib/types';

type MomentsSectionProps = {
  moments: PostWithSetlist[];
  isManager: boolean;
  onSelect: (id: string) => void;
};

const MomentsSection: React.FC<MomentsSectionProps> = ({ moments, isManager, onSelect }) => (
  <section className="space-y-3">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Moments</p>
        <h2 className="font-display text-xl font-bold text-white">Relive it</h2>
        <p className="text-sm text-white/70">Clips and snapshots from the crowd.</p>
      </div>
      {isManager && moments.length === 0 && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
          Empty · add the first one
        </span>
      )}
    </div>
    {moments.length === 0 ? (
      isManager ? (
        <div className="rounded-2xl bg-white/5 p-5 text-white/80">
          <p className="font-semibold text-white">No moments yet — share your first live moment</p>
          <p className="mt-1 text-sm text-white/70">
            Upload a clip or photo from a recent performance.
          </p>
        </div>
      ) : null
    ) : (
      <div className="grid grid-cols-3 gap-2">
        {moments.slice(0, 12).map(moment => (
          <button
            key={moment.id}
            type="button"
            onClick={() => onSelect(moment.id)}
            className="relative aspect-square overflow-hidden bg-black/30"
          >
            {moment.media_type === 'video' ? (
              <video className="h-full w-full object-cover" muted>
                <source src={moment.media_url} />
              </video>
            ) : (
              <img src={moment.media_url} alt={moment.caption || 'Moment'} className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
    )}
  </section>
);

export default MomentsSection;

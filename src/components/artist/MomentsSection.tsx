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
        <p className="text-[11px] uppercase tracking-[0.35em] text-slate-500">Moments</p>
        <h2 className="font-display text-xl text-white">Live moments</h2>
        <p className="text-sm text-slate-400">Clips and recaps from shows.</p>
      </div>
      {isManager && moments.length === 0 && (
        <span className="rounded-full border border-dashed border-white/20 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-200">
          Empty · add first live moment
        </span>
      )}
    </div>
    {moments.length === 0 ? (
      isManager ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-5 text-slate-300">
          <p className="font-semibold text-white">No moments yet — share your first live moment</p>
          <p className="mt-1 text-sm text-slate-400">
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
            className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0f1320] aspect-square"
          >
            {moment.media_type === 'video' ? (
              <video className="h-full w-full object-cover" muted>
                <source src={moment.media_url} />
              </video>
            ) : (
              <img src={moment.media_url} alt={moment.caption || 'Moment'} className="h-full w-full object-cover" />
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/35 via-transparent to-transparent" />
          </button>
        ))}
      </div>
    )}
  </section>
);

export default MomentsSection;

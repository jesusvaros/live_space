import React from 'react';
import { PostWithSetlist } from '../../lib/types';

type MomentsSectionProps = {
  moments: PostWithSetlist[];
  isManager: boolean;
  onSelect: (id: string) => void;
};

const MomentsSection: React.FC<MomentsSectionProps> = ({ moments, isManager, onSelect }) => (
  <section className="animate-fade-up space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 motion-reduce:animate-none">
    <div className="flex items-center justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">Momentos</p>
        <h2 className="font-display text-xl font-bold text-white">Revívelo</h2>
        <p className="text-sm text-white/70">Vídeos y fotos del público.</p>
      </div>
      {isManager && moments.length === 0 && (
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
          Vacío · sube el primero
        </span>
      )}
    </div>
    {moments.length === 0 ? (
      isManager ? (
        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-white/80">
          <p className="font-semibold text-white">Aún no hay momentos: comparte el primero</p>
          <p className="mt-1 text-sm text-white/70">
            Sube un vídeo o una foto de un concierto reciente.
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
            className="relative aspect-square overflow-hidden rounded-xl border border-white/10 bg-black/30"
          >
            {moment.media_type === 'video' ? (
              <video className="h-full w-full object-cover" muted>
                <source src={moment.media_url} />
              </video>
            ) : (
              <img src={moment.media_url} alt={moment.caption || 'Momento'} className="h-full w-full object-cover" />
            )}
          </button>
        ))}
      </div>
    )}
  </section>
);

export default MomentsSection;

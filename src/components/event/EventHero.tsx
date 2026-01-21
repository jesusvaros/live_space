import React from 'react';
import { Profile } from '../../lib/types';

export type EventEntity = {
  id: string;
  name: string;
  role: Profile['role'] | 'artist_entity';
};

type EventHeroProps = {
  title: string;
  meta: React.ReactNode;
  entities: EventEntity[];
  onSelectEntity: (id: string, role: EventEntity['role']) => void;
  coverImageUrl?: string | null;
  actions?: React.ReactNode;
};

const formatRole = (role: EventEntity['role']) => {
  if (role === 'artist' || role === 'artist_entity') return 'Artist';
  if (role === 'venue') return 'Venue';
  if (role === 'label') return 'Label';
  return 'User';
};

const EventHero: React.FC<EventHeroProps> = ({
  title,
  meta,
  entities,
  onSelectEntity,
  coverImageUrl,
  actions,
}) => {
  return (
    <section className="space-y-4">
      {coverImageUrl && (
        <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          <img src={coverImageUrl} alt={title} className="h-56 w-full object-cover" />
          {actions && (
            <div className="pointer-events-none absolute inset-x-3 bottom-3 flex justify-between">
              <div className="pointer-events-auto flex gap-2 rounded-full bg-black/50 px-3 py-2 text-xs font-semibold text-white backdrop-blur">
                {actions}
              </div>
            </div>
          )}
        </div>
      )}
      <h1 className="font-display text-3xl font-semibold tracking-[-0.02em] text-slate-50">{title}</h1>
      <div className="text-sm text-slate-400">{meta}</div>
      {entities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {entities.map(entity => (
            <button
              key={entity.id}
              type="button"
              className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-100"
              onClick={() => onSelectEntity(entity.id, entity.role)}
            >
              <span className="font-semibold text-slate-50">{entity.name}</span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-slate-400">
                {formatRole(entity.role)}
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default EventHero;

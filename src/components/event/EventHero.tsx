import React from 'react';
import { Profile } from '../../lib/types';

export type EventEntity = {
  id: string;
  name: string;
  role: Profile['role'];
};

type EventHeroProps = {
  title: string;
  meta: React.ReactNode;
  entities: EventEntity[];
  onSelectEntity: (id: string) => void;
  coverImageUrl?: string | null;
  actions?: React.ReactNode;
};

const formatRole = (role: Profile['role']) => {
  if (role === 'artist') return 'Artist';
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
    <section className="event-hero space-y-4">
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
      <h1 className="event-hero-title">{title}</h1>
      <div className="event-hero-meta">{meta}</div>
      {entities.length > 0 && (
        <div className="event-hero-entities">
          {entities.map(entity => (
            <button
              key={entity.id}
              type="button"
              className="event-entity-chip"
              onClick={() => onSelectEntity(entity.id)}
            >
              <span className="event-entity-name">{entity.name}</span>
              <span className="event-entity-role">{formatRole(entity.role)}</span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default EventHero;

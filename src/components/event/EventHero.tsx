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
};

const formatRole = (role: Profile['role']) => {
  if (role === 'artist') return 'Artist';
  if (role === 'venue') return 'Venue';
  if (role === 'label') return 'Label';
  return 'User';
};

const EventHero: React.FC<EventHeroProps> = ({ title, meta, entities, onSelectEntity }) => {
  return (
    <section className="event-hero">
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

import React from 'react';
import { Event, Profile } from '../lib/types';

export type EventEntity = {
  id: string;
  name: string;
  role: Profile['role'];
};

type EventHeaderProps = {
  event: Event;
  entities: EventEntity[];
  onSelectEntity: (id: string) => void;
};

const formatEventDate = (event: Event) =>
  new Date(event.starts_at).toLocaleString('es-ES', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatRole = (role: Profile['role']) => {
  if (role === 'artist') return 'Artista';
  if (role === 'venue') return 'Sala';
  if (role === 'label') return 'Sello';
  return 'Usuario';
};

const EventHeader: React.FC<EventHeaderProps> = ({ event, entities, onSelectEntity }) => {
  return (
    <div className="event-header">
      <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
        {event.city}
      </p>
      <h1 className="event-title font-display text-slate-50">{event.name}</h1>
      <p className="event-meta">
        {formatEventDate(event)} · {event.address || 'Sala por confirmar'}
      </p>
      {entities.length > 0 && (
        <div className="entity-row">
          {entities.map(entity => (
            <button
              key={entity.id}
              type="button"
              className="entity-chip"
              onClick={() => onSelectEntity(entity.id)}
            >
              {entity.name}
              <span>{formatRole(entity.role)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default EventHeader;

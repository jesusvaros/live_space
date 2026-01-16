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
  new Date(event.starts_at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

const formatRole = (role: Profile['role']) => {
  if (role === 'artist') return 'Artist';
  if (role === 'venue') return 'Venue';
  if (role === 'label') return 'Label';
  return 'User';
};

const EventHeader: React.FC<EventHeaderProps> = ({ event, entities, onSelectEntity }) => {
  return (
    <div className="event-header">
      <p className="text-[11px] uppercase tracking-[0.35em] text-slate-400">
        {event.city}
      </p>
      <h1 className="event-title font-display text-slate-50">{event.name}</h1>
      <p className="event-meta">
        {formatEventDate(event)} · {event.address || 'Venue TBD'}
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

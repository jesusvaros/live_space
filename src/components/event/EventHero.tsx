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
    <section>
      <div className="relative aspect-[4/5] w-full overflow-hidden bg-black">
        {coverImageUrl ? (
          <img src={coverImageUrl} alt={title} className="absolute inset-0 h-full w-full object-cover" />
        ) : null}

        {actions ? (
          <div className="absolute right-4 top-4 z-10 flex items-center gap-3">
            {actions}
          </div>
        ) : null}

        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-5">
          <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
          {meta ? <div className="mt-2 text-sm text-white/75">{meta}</div> : null}
        </div>
      </div>

      {entities.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 px-4">
          {entities.map(entity => (
            <button
              key={entity.id}
              type="button"
              className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/65 hover:text-white"
              onClick={() => onSelectEntity(entity.id, entity.role)}
            >
              {entity.name} · {formatRole(entity.role)}
            </button>
          ))}
        </div>
      )}
    </section>
  );
};

export default EventHero;

import React from 'react';
import { Profile } from '../../lib/types';

export type EventEntity = {
  id: string;
  name: string;
  role: Profile['role'] | 'artist_entity';
};

type EventHeroProps = {
  coverImageUrl?: string | null;
  actions?: React.ReactNode;
};

const EventHero: React.FC<EventHeroProps> = ({
  coverImageUrl,
  actions,
}) => {
  return (
    <section className="relative h-[70vh] sm:h-[76vh]">
      <div className="fixed inset-x-0 top-[calc(56px+env(safe-area-inset-top,0px))] z-0 h-[70vh] overflow-hidden sm:h-[76vh]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_6%,rgba(255,107,74,0.24),transparent_52%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_12%,rgba(122,167,255,0.18),transparent_54%)]" />
        {coverImageUrl ? (
          <img src={coverImageUrl} alt="Event cover" className="absolute inset-0 h-full w-full object-cover" />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/62 to-black/24" />

        {actions ? (
          <div className="absolute right-3 top-3 z-10 flex items-center gap-2 sm:right-4 sm:top-4 sm:gap-3">
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  );
};

export default EventHero;

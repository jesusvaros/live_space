import React from 'react';
import { Profile } from '../../lib/types';
import GeneratedPoster from '../ui/GeneratedPoster';

export type EventEntity = {
  id: string;
  name: string;
  role: Profile['role'] | 'artist_entity';
};

type EventHeroProps = {
  title: string;
  coverImageUrl?: string | null;
};

const EventHero: React.FC<EventHeroProps> = ({ title, coverImageUrl }) => (
  <section className="relative h-[46vh] min-h-[300px] overflow-hidden">
    {coverImageUrl ? (
      <img src={coverImageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
    ) : (
      <GeneratedPoster title={title} variant="hero" />
    )}
    <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-app-bg to-transparent" />
  </section>
);

export default EventHero;

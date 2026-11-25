import React from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import type { PostWithRelations } from '../../lib/types';
import { cloudinaryResized } from '../photos/photoAlbums';

// Momentos: the photos of one concert as a single slide, not one slide each.
// Same-size big photos in a sideways row, who took them, and «Ver la galería», which opens the
// concert on its «Fotos» tab (cover with the most liked, a section per person).

const photoUrl = (post: PostWithRelations, width: number) =>
  cloudinaryResized(post.media_url || post.thumbnail_url || '', width);

const handleOf = (post: PostWithRelations) =>
  post.profiles?.username ? `@${post.profiles.username}` : post.profiles?.display_name || 'alguien';

const whenLabel = (iso: string | null | undefined) => {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
};

const ConcertGallerySlide: React.FC<{ eventId: string; photos: PostWithRelations[] }> = ({ eventId, photos }) => {
  const navigate = useNavigate();
  const event = (photos[0]?.events ?? null) as (NonNullable<PostWithRelations['events']> & { venue_place?: { name?: string | null } | null }) | null;
  const people = Array.from(new Map(photos.map(photo => [photo.user_id, photo])).values());
  const hero = photos[0];
  const names = people.slice(0, 2).map(handleOf);
  const more = people.length - names.length;
  const credit = `${names.join(' y ')}${more > 0 ? ` y ${more} más` : ''}`;
  const open = () => navigate(`/event/${eventId}`, { state: { openPhotos: true } });

  return (
    <article className="relative h-full w-full shrink-0 snap-start snap-always overflow-hidden bg-app-bg">
      {hero ? (
        <img src={photoUrl(hero, 400)} alt="" aria-hidden className="absolute inset-0 h-full w-full scale-110 object-cover opacity-30 blur-2xl" />
      ) : null}
      <div className="relative flex h-full flex-col px-4 pb-[calc(96px+env(safe-area-inset-bottom,0px))] pt-[calc(70px+env(safe-area-inset-top,0px))]">
        <p className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-app-accent">Fotos del concierto</p>
        <button type="button" onClick={open} className="mt-1 text-left">
          <h2 className="m-0 font-poster text-[36px] leading-[0.9] text-app-ink line-clamp-2">{event?.name || 'Concierto'}</h2>
        </button>
        <p className="m-0 mt-1 text-sm text-[#e4e0d8]">
          {[event?.venue_place?.name || event?.city, whenLabel(event?.starts_at)].filter(Boolean).join(' · ')}
        </p>

        {/* Every photo the same size, big; swipe sideways for the rest. */}
        <div className="-mx-4 mt-4 flex min-h-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {photos.map(photo => (
            <button
              key={photo.id}
              type="button"
              onClick={open}
              className="h-full w-[82%] shrink-0 snap-center overflow-hidden rounded-2xl bg-app-surface"
            >
              <img src={photoUrl(photo, 900)} alt={`Foto de ${handleOf(photo)}`} loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        <div className="mt-3 flex items-center gap-3">
          <span className="flex -space-x-2">
            {people.slice(0, 4).map(person => (
              <Avatar
                key={person.user_id}
                name={handleOf(person).replace('@', '')}
                src={person.profiles?.avatar_url}
                className="h-8 w-8 shrink-0 text-[11px] ring-2 ring-app-bg"
              />
            ))}
          </span>
          <p className="m-0 min-w-0 flex-1 truncate text-[13px] text-[#e4e0d8]">Fotos de {credit}</p>
          <button
            type="button"
            onClick={open}
            className="min-h-10 shrink-0 rounded-full bg-app-ink px-4 text-[13px] font-bold text-app-bg"
          >
            Ver la galería
          </button>
        </div>
      </div>
    </article>
  );
};

export default ConcertGallerySlide;

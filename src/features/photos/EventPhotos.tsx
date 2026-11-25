import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Avatar from '../../components/ui/Avatar';
import type { TimelineMoment } from '../moments/concertTimeline';
import {
  concertPhotos,
  groupPhotoSections,
  photoCredit,
  photoThumbUrl,
  topLikedPhotos,
  type PhotoGrouping,
} from './photoAlbums';
import PhotoGrid from './PhotoGrid';
import PhotoViewer from './PhotoViewer';
import { usePhotoActions } from './usePhotoActions';
import FollowProfileButton from '../people/FollowProfileButton';

const sectionLikes = (photos: TimelineMoment[]) => photos.reduce((sum, photo) => sum + (photo.likes ?? 0), 0);

// «Fotos» on the concert page, one long scroll: the cover («Lo más
// gustado», or the latest while nothing has ♥), then a section per person
// (or per song, or per half hour). The moments come already filtered
// (blocked people and what this viewer hid are out).

type EventPhotosProps = {
  moments: TimelineMoment[];
  currentUserId: string | null;
  onDeleted: (postId: string) => void;
  // Shown inside a sheet: the viewer opens within it (PhotoViewer inline).
  inSheet?: boolean;
  // With no photos yet: an invitation to upload them (concert has started).
  onUpload?: () => void;
  // Under the stage's «Fotos» tab: the tab already says it, the heading is for screen readers only.
  hideTitle?: boolean;
  // Setlist songs, in order, for «Canciones».
  songs?: ReadonlyArray<{ songId: string; label: string }>;
};

const GROUPINGS: { key: PhotoGrouping; label: string }[] = [
  { key: 'people', label: 'Personas' },
  { key: 'songs', label: 'Canciones' },
  { key: 'time', label: 'Hora' },
];

type Viewing = { photos: TimelineMoment[]; index: number; label: string };

const EventPhotos: React.FC<EventPhotosProps> = ({
  moments,
  currentUserId,
  onDeleted,
  inSheet = false,
  onUpload,
  hideTitle = false,
  songs,
}) => {
  const navigate = useNavigate();
  const photos = useMemo(() => concertPhotos(moments), [moments]);
  const liked = useMemo(() => topLikedPhotos(moments), [moments]);
  const [grouping, setGrouping] = useState<PhotoGrouping>('people');
  const sections = useMemo(
    () => groupPhotoSections(moments, grouping, { currentUserId, songs }),
    [moments, grouping, currentUserId, songs],
  );
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const { handlers, undo, undoHide } = usePhotoActions({ onDeleted });

  const titleClass = hideTitle ? 'sr-only' : 'font-display text-xl font-bold text-app-ink';

  if (photos.length === 0) {
    if (!onUpload) return null;
    return (
      <section className="px-4 pt-6" aria-labelledby="event-photos-title">
        <h2 id="event-photos-title" className={titleClass}>Fotos</h2>
        <div className="mt-2 rounded-2xl border border-dashed border-app-line px-4 py-5 text-center">
          <p className="m-0 text-sm text-[#c9c5bd]">Aún no hay fotos de este concierto. Cada persona que suba las suyas tendrá aquí su sección.</p>
          <button
            type="button"
            onClick={onUpload}
            className="mt-3 min-h-11 rounded-full bg-app-accent px-5 text-sm font-bold text-[#14151a]"
          >
            Subir mis fotos
          </button>
        </div>
      </section>
    );
  }

  // The cover: most liked; while nothing has ♥ yet, the latest photos.
  const cover = liked.length ? liked : [...photos].reverse().slice(0, 5);
  const coverLabel = liked.length ? 'Lo más gustado' : 'Lo último';
  const [hero, ...rest] = cover;
  const people = new Set(photos.map(photo => photo.userId)).size;
  const open = (list: TimelineMoment[], index: number, label: string) => setViewing({ photos: list, index, label });

  return (
    <section className="pt-4" aria-labelledby="event-photos-title">
      <div className="flex items-baseline justify-between gap-3 px-4">
        <h2 id="event-photos-title" className={titleClass}>Fotos</h2>
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-white/50">
          {photos.length} · {people} {people === 1 ? 'persona' : 'personas'}
        </p>
      </div>

      {/* Cover */}
      <div className="px-4 pt-3">
        <p className="m-0 mb-2 font-display text-base font-bold text-app-ink">{coverLabel}</p>
        <button
          type="button"
          onClick={() => open(cover, 0, coverLabel)}
          className="relative block aspect-[4/5] w-full overflow-hidden rounded-2xl bg-app-surface"
        >
          <img src={photoThumbUrl(hero, 900)} alt={`Foto de ${photoCredit(hero)}`} className="h-full w-full object-cover" />
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/80 to-transparent px-3 pb-3 pt-10 text-left">
            <span className="min-w-0 truncate text-[14px] font-bold text-white">{photoCredit(hero)}</span>
            {(hero.likes ?? 0) > 0 ? (
              <span className="shrink-0 rounded-full bg-black/60 px-2 py-0.5 font-mono text-[12px] font-bold text-white">♥ {hero.likes}</span>
            ) : null}
          </span>
        </button>
        {rest.length ? (
          <div className="mt-1.5 grid grid-cols-4 gap-1.5">
            {rest.map((photo, index) => (
              <button
                key={photo.id}
                type="button"
                onClick={() => open(cover, index + 1, coverLabel)}
                className="relative aspect-square overflow-hidden rounded-xl bg-app-surface"
              >
                <img src={photoThumbUrl(photo, 240)} alt={`Foto de ${photoCredit(photo)}`} loading="lazy" className="h-full w-full object-cover" />
                {(photo.likes ?? 0) > 0 ? (
                  <span className="absolute bottom-1 right-1 rounded-full bg-black/60 px-1.5 font-mono text-[10px] font-bold text-white">♥ {photo.likes}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* How the rest is grouped */}
      <div role="tablist" aria-label="Ordenar fotos" className="sticky top-0 z-10 flex gap-2 bg-app-bg/95 px-4 py-3 backdrop-blur">
        {GROUPINGS.map(option => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={grouping === option.key}
            onClick={() => setGrouping(option.key)}
            className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold ${
              grouping === option.key ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-6 px-4 pb-2">
        {sections.map(section => (
          <div key={`${grouping}-${section.id}`}>
            {grouping === 'people' ? (
              <div className="mb-2 flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => section.userId && navigate(`/profile/${section.userId}`)}
                  className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                >
                  <Avatar name={section.label.replace('@', '')} src={section.avatarUrl} className="h-9 w-9 shrink-0 text-[13px]" />
                  <span className="min-w-0">
                    <span className="block truncate text-[15px] font-bold text-app-ink">{section.label}</span>
                    <span className="block font-mono text-[11px] uppercase tracking-[0.06em] text-white/50">
                      {section.photos.length} {section.photos.length === 1 ? 'foto' : 'fotos'}
                      {sectionLikes(section.photos) ? ` · ♥ ${sectionLikes(section.photos)}` : ''}
                    </span>
                  </span>
                </button>
                {section.isMe || !section.userId ? null : <FollowProfileButton profileId={section.userId} className="min-h-9 px-3 text-[12px]" />}
              </div>
            ) : (
              <div className="mb-2 flex items-baseline justify-between gap-3">
                <p className={`m-0 truncate font-bold text-app-ink ${grouping === 'time' ? 'font-mono text-[14px]' : 'text-[15px]'}`}>{section.label}</p>
                <p className="m-0 shrink-0 font-mono text-[11px] uppercase tracking-[0.06em] text-white/50">{section.photos.length}</p>
              </div>
            )}
            <PhotoGrid
              photos={section.photos}
              pageSize={6}
              onOpen={index => open(section.photos, index, section.label)}
              {...handlers}
            />
          </div>
        ))}
      </div>

      {viewing ? (
        <PhotoViewer
          photos={viewing.photos}
          startIndex={viewing.index}
          albumLabel={viewing.label}
          onClose={() => setViewing(null)}
          inline={inSheet}
          {...handlers}
        />
      ) : null}

      {undo ? (
        <div
          role="status"
          className="fixed inset-x-4 bottom-[calc(84px+env(safe-area-inset-bottom,0px))] z-[3100] flex items-center gap-3 rounded-2xl border border-white/15 bg-[#17171b]/95 px-4 py-2.5 shadow-xl backdrop-blur"
        >
          <span className="min-w-0 flex-1 text-sm text-white">Foto oculta. Ya no la verás en este concierto.</span>
          <button type="button" onClick={undoHide} className="min-h-11 shrink-0 px-2 text-sm font-bold text-app-accent">
            Deshacer
          </button>
        </div>
      ) : null}
    </section>
  );
};

export default EventPhotos;

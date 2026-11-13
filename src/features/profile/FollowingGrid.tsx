import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { initials, pickPalette } from '../../components/ui/generated';
import type { FollowedEntity } from '../../hooks/useFollowedEntities';

const KIND_LABEL: Record<FollowedEntity['kind'], string> = { artist: 'Artista', venue: 'Sala', festival: 'Festival' };

// One followed artist, venue or festival as a photo card; initials on the
// name's poster colours when there is no photo (or it fails to load).
const FollowCard: React.FC<{ entity: FollowedEntity; onSelect: () => void }> = ({ entity, onSelect }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const src = entity.imageUrl && failed !== entity.imageUrl ? entity.imageUrl : null;
  const palette = pickPalette(entity.name);
  return (
    <button type="button" onClick={onSelect} className="min-w-0 text-left">
      <span className="relative block aspect-square overflow-hidden rounded-2xl ring-1 ring-white/5">
        {src ? (
          <img
            src={src}
            alt={entity.name}
            loading="lazy"
            data-own-fallback=""
            onError={() => setFailed(src)}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <span
            role="img"
            aria-label={entity.name}
            className="absolute inset-0 flex items-center justify-center font-poster text-[34px] leading-none"
            style={{ background: palette.ground, color: palette.ink }}
          >
            {initials(entity.name)}
          </span>
        )}
        <span className="absolute left-1.5 top-1.5 rounded-full bg-black/65 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-[0.06em] text-white">
          {KIND_LABEL[entity.kind]}
        </span>
      </span>
      <span className="mt-1.5 block truncate font-display text-[14px] font-bold leading-tight text-app-ink">{entity.name}</span>
      {entity.city ? <span className="block truncate text-[12px] text-white/55">{entity.city}</span> : null}
    </button>
  );
};

// «Siguiendo»: the artists, venues and festivals the user follows, as a wall of photos.
const FollowingGrid: React.FC<{ entities: FollowedEntity[] }> = ({ entities }) => {
  const navigate = useNavigate();
  return (
    <div className="grid grid-cols-3 gap-x-2.5 gap-y-4 px-4">
      {entities.map(entity => (
        <FollowCard key={entity.subjectId} entity={entity} onSelect={() => navigate(`/tabs/${entity.kind}/${entity.id}`)} />
      ))}
    </div>
  );
};

export default FollowingGrid;

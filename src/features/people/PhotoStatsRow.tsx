import React, { useEffect, useState } from 'react';
import { compactCount, photographersService, type PhotoStats } from './photographers.service';

// Under a person's name: followers, photos, ♥ received and concerts. Only the
// ones above zero, so a new profile is not a row of zeros.
const PhotoStatsRow: React.FC<{ profileId: string; className?: string }> = ({ profileId, className = '' }) => {
  const [stats, setStats] = useState<PhotoStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    photographersService
      .stats(profileId)
      .then(next => {
        if (!cancelled) setStats(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [profileId]);

  if (!stats) return null;
  const items = [
    { value: stats.followers, label: stats.followers === 1 ? 'seguidor' : 'seguidores' },
    { value: stats.photos, label: stats.photos === 1 ? 'foto' : 'fotos' },
    { value: stats.likes, label: '♥' },
    { value: stats.concerts, label: stats.concerts === 1 ? 'concierto' : 'conciertos' },
  ].filter(item => item.value > 0);
  if (items.length === 0) return null;

  return (
    <dl className={`flex gap-5 ${className}`}>
      {items.map(item => (
        <div key={item.label} className="flex flex-col">
          <dt className="sr-only">{item.label}</dt>
          <dd className="m-0 font-display text-xl font-bold leading-none text-app-ink">{compactCount(item.value)}</dd>
          <span aria-hidden className="mt-1 text-[12px] text-white/55">{item.label}</span>
        </div>
      ))}
    </dl>
  );
};

export default PhotoStatsRow;

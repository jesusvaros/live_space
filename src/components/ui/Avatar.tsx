import React, { useState } from 'react';
import { IconFlag, IconMap, IconMic } from '../icons';
import { initials, pickPalette } from './generated';

type AvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
  rounded?: 'full' | 'xl';
  // Artists are round and venues square everywhere; `kind` sets the shape
  // and, with `badge`, adds a mic or pin so mixed lists read at a glance.
  kind?: 'artist' | 'venue' | 'festival';
  badge?: boolean;
};

// Photo when there is one (and it loads); otherwise initials on the name's
// poster colours.
const Avatar: React.FC<AvatarProps> = ({ name, src, className = 'h-12 w-12', rounded, kind, badge = false }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const palette = pickPalette(name);
  const shape = (rounded ?? (kind === 'artist' || !kind ? 'full' : 'xl')) === 'full' ? 'rounded-full' : 'rounded-xl';
  const image = src && failed !== src ? (
    <img
      src={src}
      alt={name}
      loading="lazy"
      onError={() => setFailed(src)}
      className={`${shape} shrink-0 object-cover ${className}`}
    />
  ) : (
    <span
      role="img"
      aria-label={name}
      className={`${shape} flex shrink-0 items-center justify-center ring-1 ring-white/10 font-poster text-[1.1em] leading-none ${className}`}
      style={{ background: palette.ground, color: palette.ink }}
    >
      {initials(name)}
    </span>
  );
  if (!badge || !kind) return image;

  return (
    <span className="relative inline-flex shrink-0">
      {image}
      <span
        aria-hidden
        className="absolute -bottom-0.5 -right-0.5 flex h-[22px] w-[22px] items-center justify-center rounded-full border-2 border-app-bg bg-app-ink text-app-bg"
      >
        {kind === 'artist' ? <IconMic size={12} /> : kind === 'festival' ? <IconFlag size={12} /> : <IconMap size={12} />}
      </span>
    </span>
  );
};

export default Avatar;

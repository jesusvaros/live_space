import React from 'react';
import { initials, pickPalette } from './generated';

type AvatarProps = {
  name: string;
  src?: string | null;
  className?: string;
  rounded?: 'full' | 'xl';
};

// Photo when there is one; otherwise initials on the name's poster colours.
const Avatar: React.FC<AvatarProps> = ({ name, src, className = 'h-12 w-12', rounded = 'full' }) => {
  const palette = pickPalette(name);
  const shape = rounded === 'full' ? 'rounded-full' : 'rounded-xl';
  if (src) {
    return <img src={src} alt={name} loading="lazy" className={`${shape} shrink-0 object-cover ${className}`} />;
  }
  return (
    <span
      role="img"
      aria-label={name}
      className={`${shape} flex shrink-0 items-center justify-center ring-1 ring-white/10 font-poster text-[1.1em] leading-none ${className}`}
      style={{ background: palette.ground, color: palette.ink }}
    >
      {initials(name)}
    </span>
  );
};

export default Avatar;

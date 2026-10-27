import React from 'react';
import type { SocialSource } from '../socialUrl';

type PlatformIconProps = { source: SocialSource; className?: string; size?: number };

// Plain line glyphs (not the brands' logos), legible at 14-20 px.
const PlatformIcon: React.FC<PlatformIconProps> = ({ source, className, size = 16 }) => {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.9,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    className,
    'aria-hidden': true,
  };
  if (source === 'instagram') {
    return (
      <svg {...common}>
        <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.2" cy="6.8" r="0.6" fill="currentColor" />
      </svg>
    );
  }
  if (source === 'tiktok') {
    return (
      <svg {...common}>
        <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5" />
        <path d="M14 3c.4 2.6 2.2 4.4 5 4.6" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5v5l4.2-2.5z" fill="currentColor" />
    </svg>
  );
};

export default PlatformIcon;

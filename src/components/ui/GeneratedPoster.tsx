import React from 'react';
import { hashString, pickPalette } from './generated';

type GeneratedPosterProps = {
  title: string;
  venue?: string | null;
  date?: string | null;
  className?: string;
  // Hero use: colours and shape only; the page prints the name.
  variant?: 'tile' | 'hero' | 'thumb';
};

const shapes = ['circle', 'bars', 'rings', 'sun'] as const;

const PosterShape: React.FC<{ kind: (typeof shapes)[number]; color: string }> = ({ kind, color }) => {
  if (kind === 'circle') {
    return <circle cx="78" cy="22" r="30" fill={color} />;
  }
  if (kind === 'bars') {
    return (
      <g fill={color}>
        {[0, 1, 2, 3, 4].map(index => (
          <rect key={index} x={58 + index * 9} y={-4} width="4" height={40 - index * 5} />
        ))}
      </g>
    );
  }
  if (kind === 'rings') {
    return (
      <g fill="none" stroke={color} strokeWidth="2.4">
        {[10, 18, 26, 34].map(r => (
          <circle key={r} cx="84" cy="14" r={r} />
        ))}
      </g>
    );
  }
  return (
    <g fill={color}>
      <circle cx="50" cy="30" r="16" />
      {Array.from({ length: 12 }).map((_, index) => {
        const angle = (index / 12) * Math.PI * 2;
        return (
          <rect
            key={index}
            x="49"
            y="4"
            width="2"
            height="8"
            transform={`rotate(${(angle * 180) / Math.PI} 50 30)`}
          />
        );
      })}
    </g>
  );
};

// A typographic gig poster for concerts and artists without an image yet.
const GeneratedPoster: React.FC<GeneratedPosterProps> = ({ title, venue, date, className, variant = 'tile' }) => {
  const palette = pickPalette(title);
  const shape = shapes[hashString(`${title}:shape`) % shapes.length];
  const words = title.trim().split(/\s+/);
  const longest = words.reduce((max, word) => Math.max(max, word.length), 0);
  const isHero = variant === 'hero';
  // Long words shrink so they never break mid-word.
  const size = variant === 'thumb'
      ? longest > 8 ? 'text-[9px]' : 'text-[13px]'
      : longest > 12 ? 'text-[19px]' : longest > 8 ? 'text-[24px]' : 'text-[32px]';

  return (
    <div
      aria-hidden
      className={`absolute inset-0 overflow-hidden ${className || ''}`}
      style={{ background: palette.ground, color: palette.ink }}
    >
      <svg viewBox="0 0 100 100" preserveAspectRatio="xMaxYMin slice" className="absolute inset-0 h-full w-full">
        <PosterShape kind={shape} color={palette.accent} />
        <rect x="0" y="0" width="100" height="100" fill={palette.grain} opacity="0.35" style={{ mixBlendMode: 'multiply' }} />
      </svg>
      {/* The hero's page already prints the name over it in big type. */}
      {!isHero ? (
        <div className={`absolute inset-x-0 ${variant === 'thumb' ? 'top-[30%] px-1.5' : 'bottom-3 px-3'}`}>
          <p className={`font-poster ${size} break-words leading-[0.86] ${variant === 'thumb' ? 'line-clamp-4' : 'line-clamp-5'}`}>{title}</p>
        </div>
      ) : null}
      {!isHero && (venue || date) ? (
        <div className="absolute inset-x-3 bottom-3 border-t pt-1.5" style={{ borderColor: palette.ink }}>
          {date ? <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.08em]">{date}</p> : null}
          {venue ? <p className="font-mono text-[10px] uppercase tracking-[0.08em] line-clamp-1 opacity-80">{venue}</p> : null}
        </div>
      ) : null}
    </div>
  );
};

export default GeneratedPoster;

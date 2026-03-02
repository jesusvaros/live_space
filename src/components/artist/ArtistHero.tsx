import React from 'react';
import { IconCheckCircle, IconEdit } from '../icons';
import { ArtistProfileArtist } from './types';

type LinkItem = { key: string; value: string };

type ArtistHeroProps = {
  artist: ArtistProfileArtist;
  isManager: boolean;
  playedCount: number;
  externalLinks: LinkItem[];
  heroStyle: React.CSSProperties;
  immersive?: boolean;
  onEdit?: () => void;
};

type SocialKey = 'spotify' | 'apple_music' | 'instagram' | 'youtube' | 'website';

const SocialIcon: React.FC<{ name: SocialKey }> = ({ name }) => {
  if (name === 'spotify') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <circle cx="12" cy="12" r="9" />
        <path d="M7.5 10.5c3.2-1 6.8-.6 9.3.9M8.5 13.5c2.3-.6 5-.4 6.9.6M9.5 16.1c1.6-.3 3.3-.1 4.6.5" />
      </svg>
    );
  }
  if (name === 'apple_music') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M16.5 3.5c-.9.6-1.9 1-2.7.9-.1-1 .5-2 1.3-2.6.9-.6 2.2-1 3.2-1-.2 1-1 2-1.8 2.7z" />
        <path d="M19 13.5c-.2 2-1.7 5.5-3.4 5.5-.8 0-1.2-.5-2-.5-.8 0-1.4.5-2 .5-1.7 0-3.6-3.3-3.6-6.1 0-2.7 1.8-4.1 3.4-4.1.8 0 1.6.5 2.1.5s1.3-.6 2.3-.6c.6 0 2.1.2 2.8 1.6-.1.1-1.7 1-1.6 3.2 0 2.6 2 3.4 2 3.4z" />
      </svg>
    );
  }
  if (name === 'instagram') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
        <rect x="4" y="4" width="16" height="16" rx="4" />
        <circle cx="12" cy="12" r="3.2" />
        <circle cx="17" cy="7" r="1" fill="currentColor" />
      </svg>
    );
  }
  if (name === 'youtube') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21 8.5s0-2-2-2.1C17.2 6.2 12 6.2 12 6.2s-5.2 0-7 .2C3 6.4 3 8.5 3 8.5S3 10.6 3 12v1.5s0 2 2 2.2c1.8.2 7 .2 7 .2s5.2 0 7-.2c2-.2 2-2.2 2-2.2V12s0-1.5 0-3.5z" />
        <path d="M10 15l4-3-4-3v6z" fill="#0b0b0d" />
      </svg>
    );
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M10 14l-4 4m0 0h4m-4 0v-4" />
      <path d="M14 10l4-4m0 0h-4m4 0v4" />
      <path d="M8 16h8a4 4 0 0 0 4-4V8" />
      <path d="M16 8H8a4 4 0 0 0-4 4v4" />
    </svg>
  );
};

const ArtistHero: React.FC<ArtistHeroProps> = ({
  artist,
  isManager,
  playedCount,
  externalLinks,
  heroStyle,
  immersive = false,
  onEdit,
}) => {
  const verifiedBadge = (artist as any)?.is_verified;
  const wrapperClass = immersive
    ? 'relative h-[70vh] overflow-hidden sm:h-[76vh]'
    : 'relative min-h-[420px] overflow-hidden rounded-2xl';
  const heroContainerClass = immersive
    ? 'absolute inset-0 overflow-hidden'
    : 'absolute inset-0 overflow-hidden';

  return (
    <section className={wrapperClass}>
      <div className={heroContainerClass} style={heroStyle}>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_14%_8%,rgba(255,107,74,0.2),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_84%_12%,rgba(122,167,255,0.16),transparent_52%)]" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/60 to-black/24" />

      {isManager && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute right-3 top-3 z-10 inline-flex items-center gap-2 rounded-full border border-white/25 bg-black/35 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-white/40 hover:text-white sm:right-4 sm:top-4"
        >
          <IconEdit size={14} />
          Edit
        </button>
      )}

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/65">Artist</p>
          <h1 className="mt-2 font-display text-3xl font-bold leading-tight text-white sm:text-4xl">{artist.name}</h1>
          <p className="mt-2 text-sm font-semibold uppercase tracking-[0.18em] text-white/80 line-clamp-1">
            {artist.city || (artist.artist_type === 'band' ? 'Band' : 'Solo artist')}
            {playedCount > 0 ? ` · ${playedCount} shows` : ''}
          </p>
          {verifiedBadge && (
            <div className="mt-2 inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80">
              <IconCheckCircle size={14} />
              Verified
            </div>
          )}

          {artist.bio && (
            <p
              className="mt-3 text-sm text-white/80"
              style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
            >
              {artist.bio}
            </p>
          )}

          {externalLinks.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {externalLinks.map(link => {
                const key = link.key as SocialKey;
                const labelMap: Record<SocialKey, string> = {
                  spotify: 'Spotify',
                  apple_music: 'Apple Music',
                  instagram: 'Instagram',
                  youtube: 'YouTube',
                  website: 'Website',
                };
                return (
                  <a
                    key={key}
                    href={link.value}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-white/35 hover:text-white"
                  >
                    <SocialIcon name={key} />
                    {labelMap[key]}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
      {!immersive && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 to-transparent" />
      )}
    </section>
  );
};

export default ArtistHero;

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

const ArtistHero: React.FC<ArtistHeroProps> = ({ artist, isManager, playedCount, externalLinks, heroStyle, onEdit }) => {
  const verifiedBadge = (artist as any)?.is_verified;

  return (
    <section className="relative min-h-[420px] overflow-hidden bg-black" style={heroStyle}>
      {isManager && (
        <button
          type="button"
          onClick={onEdit}
          className="absolute right-4 top-4 z-10 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
        >
          <span className="inline-flex items-center gap-2">
            <IconEdit size={14} />
            Edit
          </span>
        </button>
      )}

      <div className="absolute inset-x-0 bottom-0 bg-black/70 p-6">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 overflow-hidden bg-white/10">
            {artist.avatar_url ? (
              <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-white/10" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-bold text-white line-clamp-1">{artist.name}</h1>
            <p className="mt-1 text-sm text-white/55 line-clamp-1">
              {artist.city ? artist.city : artist.artist_type === 'band' ? 'Band' : 'Solo'}
              {verifiedBadge ? ' · Verified' : ''}
              {playedCount > 0 ? ` · ${playedCount} shows` : ''}
            </p>
          </div>
        </div>

        {artist.bio && (
          <p
            className="mt-4 text-sm text-white/80"
            style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {artist.bio}
          </p>
        )}

        {externalLinks.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2">
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
                  className="inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70 hover:text-white"
                >
                  <SocialIcon name={key} />
                  {labelMap[key]}
                </a>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default ArtistHero;

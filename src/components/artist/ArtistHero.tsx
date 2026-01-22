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
        <path d="M10 15l4-3-4-3v6z" fill="#0b0e14" />
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
    <section className="overflow-hidden rounded-3xl border border-white/10 shadow-[0_24px_50px_rgba(0,0,0,0.45)]" style={heroStyle}>
      <div className="relative z-10 flex flex-col gap-4 bg-gradient-to-b from-black/40 via-black/20 to-black/60 p-6">
        <div className="flex items-start justify-between">
          <span className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
            Artist Profile
          </span>
          {isManager && (
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-black/20 px-3 py-1 text-xs font-semibold text-white backdrop-blur hover:border-white/40 transition-colors"
            >
              <IconEdit size={14} />
              Edit profile
            </button>
          )}
        </div>
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="h-24 w-24 overflow-hidden rounded-full border border-white/10 bg-white/10 shadow-lg">
            {artist.avatar_url ? (
              <img src={artist.avatar_url} alt={artist.name} className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-[#1c2435] via-[#111827] to-[#0b0e14]" />
            )}
          </div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-2xl text-white">{artist.name}</h1>
            {verifiedBadge && (
              <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white">
                <IconCheckCircle size={14} />
                Verified
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-200">
            {artist.city && <span className="rounded-full bg-black/25 px-3 py-1">{artist.city}</span>}
            <span className="rounded-full bg-black/25 px-3 py-1">{artist.artist_type === 'band' ? 'Band' : 'Solo'}</span>
            {playedCount > 0 && (
              <span className="rounded-full bg-black/25 px-3 py-1">
                Played {playedCount} {playedCount === 1 ? 'show' : 'shows'}
              </span>
            )}
          </div>
        </div>
        {artist.bio && (
          <p
            className="mx-auto max-w-3xl text-sm text-slate-100/90 opacity-90"
            style={{ display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
          >
            {artist.bio}
          </p>
        )}

        {externalLinks.length > 0 && (
          <div className="mx-auto flex max-w-3xl flex-wrap justify-center gap-3 pt-2">
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
                  className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-white transition hover:border-[#ff6b4a]/60 hover:text-[#ffb9a6]"
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

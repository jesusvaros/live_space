import React from 'react';
import { IconCheckCircle, IconEdit } from '../icons';
import { ArtistProfileArtist } from './types';
import Button from '../ui/Button';
import GeneratedPoster from '../ui/GeneratedPoster';

type LinkItem = { key: string; value: string };

type ArtistHeroProps = {
  artist: ArtistProfileArtist;
  isManager: boolean;
  playedCount: number;
  externalLinks: LinkItem[];
  immersive?: boolean;
  isFollowing?: boolean;
  followLoading?: boolean;
  onToggleFollow?: () => void;
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
        <path d="M10 15l4-3-4-3v6z" fill="#0d0e12" />
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

const LINK_LABELS: Record<SocialKey, string> = {
  spotify: 'Spotify',
  apple_music: 'Apple Music',
  instagram: 'Instagram',
  youtube: 'YouTube',
  website: 'Web',
};

const ArtistHero: React.FC<ArtistHeroProps> = ({
  artist,
  isManager,
  playedCount,
  externalLinks,
  immersive = false,
  isFollowing = false,
  followLoading = false,
  onToggleFollow,
  onEdit,
}) => {
  const verifiedBadge = (artist as any)?.is_verified;
  const meta = [
    artist.city || (artist.artist_type === 'band' ? 'Banda' : artist.artist_type === 'solo' ? 'Solista' : null),
    playedCount > 0 ? `${playedCount} ${playedCount === 1 ? 'concierto' : 'conciertos'}` : null,
  ].filter(Boolean);

  return (
    <section>
      <div className={`relative overflow-hidden ${immersive ? 'h-[52vh] min-h-[320px]' : 'h-[300px] rounded-2xl'}`}>
        {artist.avatar_url ? (
          <img src={artist.avatar_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <GeneratedPoster title={artist.name} variant="hero" />
        )}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-app-bg via-app-bg/60 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 px-4 pb-3">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-app-accent">
            Artista{verifiedBadge ? ' · verificado' : ''}
          </p>
          <h1 className="mt-1 font-poster text-[48px] leading-[0.88] text-white">{artist.name}</h1>
          {meta.length > 0 ? <p className="mt-2 text-sm text-white/75">{meta.join(' · ')}</p> : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        {onToggleFollow ? (
          <Button
            variant={isFollowing ? 'secondary' : 'primary'}
            disabled={followLoading}
            onClick={onToggleFollow}
            icon={isFollowing ? <IconCheckCircle size={16} /> : null}
          >
            {isFollowing ? 'Siguiendo' : 'Seguir'}
          </Button>
        ) : null}
        {isManager && (
          <Button variant="secondary" onClick={onEdit} icon={<IconEdit size={16} />}>
            Editar
          </Button>
        )}
        {externalLinks.map(link => {
          const key = link.key as SocialKey;
          return (
            <a
              key={key}
              href={link.value}
              target="_blank"
              rel="noreferrer"
              aria-label={LINK_LABELS[key]}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-app-line bg-app-surface text-white/85"
            >
              <SocialIcon name={key} />
            </a>
          );
        })}
      </div>

      {artist.bio && (
        <p className="px-4 pt-3 text-sm text-white/75 line-clamp-3">{artist.bio}</p>
      )}
    </section>
  );
};

export default ArtistHero;

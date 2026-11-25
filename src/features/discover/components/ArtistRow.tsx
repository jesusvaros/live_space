import React from 'react';
import { DiscoverArtist } from '../types';
import Avatar from '../../../components/ui/Avatar';
import { IconPlus } from '../../../components/icons';

type ArtistRowProps = {
  artist: DiscoverArtist;
  isFollowing: boolean;
  followLoading?: boolean;
  canFollow: boolean;
  onToggleFollow: () => void;
  onOpenProfile: () => void;
};

const CheckIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

// A round portrait that fills its cell in the Explorar grid, with follow as a
// small round button on its corner: «+» to follow, a tick when following.
const ArtistRow: React.FC<ArtistRowProps> = ({ artist, isFollowing, followLoading, onToggleFollow, onOpenProfile }) => (
  <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
    <div className="relative w-full">
      <button type="button" onClick={onOpenProfile} aria-label={artist.name} className="block w-full">
        <Avatar name={artist.name} src={artist.avatar_url} kind="artist" className="aspect-square h-auto w-full text-[34px]" />
      </button>
      <button
        type="button"
        disabled={followLoading}
        aria-pressed={isFollowing}
        aria-label={`${isFollowing ? 'Dejar de seguir' : 'Seguir'} a ${artist.name}`}
        onClick={onToggleFollow}
        className={`absolute bottom-0.5 right-0.5 flex h-9 w-9 items-center justify-center rounded-full border-[3px] border-app-bg disabled:opacity-60 ${
          isFollowing ? 'bg-app-surface text-app-ink' : 'bg-app-accent text-[#14151a]'
        }`}
      >
        {isFollowing ? <CheckIcon /> : <IconPlus size={18} />}
      </button>
    </div>
    <button type="button" onClick={onOpenProfile} className="line-clamp-2 w-full px-0.5 text-[15px] font-bold leading-tight text-app-ink">
      {artist.name}
    </button>
  </div>
);

export default ArtistRow;

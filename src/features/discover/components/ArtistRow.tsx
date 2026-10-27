import React from 'react';
import { DiscoverArtist } from '../types';
import Avatar from '../../../components/ui/Avatar';

type ArtistRowProps = {
  artist: DiscoverArtist;
  isFollowing: boolean;
  followLoading?: boolean;
  canFollow: boolean;
  onToggleFollow: () => void;
  onOpenProfile: () => void;
};

// A round portrait in the Explorar grid; the line under the name follows.
const ArtistRow: React.FC<ArtistRowProps> = ({ artist, isFollowing, followLoading, onToggleFollow, onOpenProfile }) => (
  <div className="flex min-w-0 flex-col items-center gap-1 text-center">
    <button type="button" onClick={onOpenProfile} className="flex w-full min-w-0 flex-col items-center gap-1.5 text-app-ink">
      <Avatar name={artist.name} src={artist.avatar_url} kind="artist" className="h-[92px] w-[92px] text-[30px]" />
      <span className="w-full truncate text-[13px] font-semibold">{artist.name}</span>
    </button>
    <button
      type="button"
      disabled={followLoading}
      aria-pressed={isFollowing}
      aria-label={`${isFollowing ? 'Dejar de seguir' : 'Seguir'} a ${artist.name}`}
      onClick={onToggleFollow}
      className={`min-h-6 font-mono text-[11px] font-medium uppercase disabled:opacity-60 ${
        isFollowing ? 'text-[#8f8b84]' : 'text-app-accent'
      }`}
    >
      {isFollowing ? 'Siguiendo' : '+ Seguir'}
    </button>
  </div>
);

export default ArtistRow;

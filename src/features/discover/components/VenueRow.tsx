import React from 'react';
import Avatar from '../../../components/ui/Avatar';
import { DiscoverVenue } from '../types';

type VenueRowProps = {
  venue: DiscoverVenue;
  isFollowing: boolean;
  followLoading?: boolean;
  canFollow: boolean;
  onToggleFollow: () => void;
  onOpenProfile: () => void;
};

// One row of a grouped venue list (the list draws the card and dividers).
const VenueRow: React.FC<VenueRowProps> = ({ venue, isFollowing, followLoading, onToggleFollow, onOpenProfile }) => (
  <li className="flex items-center gap-3 px-3 py-2.5">
    <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={onOpenProfile}>
      <Avatar name={venue.name} src={venue.cover_image_url || venue.photos?.[0] || null} kind="venue" badge className="h-11 w-11 text-[15px]" />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15px] font-bold text-app-ink">{venue.name}</span>
        <span className="block truncate text-xs text-[#8f8b84]">{[venue.city, venue.address].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
    <button
      type="button"
      disabled={followLoading}
      aria-pressed={isFollowing}
      onClick={onToggleFollow}
      className={`min-h-9 shrink-0 rounded-full px-3.5 text-[13px] font-semibold transition disabled:opacity-60 ${
        isFollowing ? 'border border-app-line text-[#c9c5bd]' : 'bg-app-ink text-app-bg'
      }`}
    >
      {isFollowing ? 'Siguiendo' : 'Seguir'}
    </button>
  </li>
);

export default VenueRow;

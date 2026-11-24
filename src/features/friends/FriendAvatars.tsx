import React from 'react';
import Avatar from '../../components/ui/Avatar';
import type { FriendGoing } from '../../services/friends.service';

// Round faces overlapping in a row (flow layout with negative margins, no
// absolute), then «+n» when there are more than fit.
const FriendAvatars: React.FC<{
  friends: Pick<FriendGoing, 'friendId' | 'name' | 'avatarUrl'>[];
  max?: number;
  size?: string;
}> = ({ friends, max = 3, size = 'h-7 w-7 text-[11px]' }) => {
  const shown = friends.slice(0, max);
  const rest = friends.length - shown.length;
  return (
    <span className="flex items-center">
      {shown.map((friend, index) => (
        <span key={friend.friendId} className={`rounded-full ring-2 ring-app-bg ${index ? '-ml-2' : ''}`}>
          <Avatar name={friend.name} src={friend.avatarUrl} className={size} />
        </span>
      ))}
      {rest > 0 ? (
        <span
          className={`-ml-2 flex items-center justify-center rounded-full bg-app-surface font-mono font-bold text-app-ink ring-2 ring-app-bg ${size}`}
        >
          +{rest}
        </span>
      ) : null}
    </span>
  );
};

export default FriendAvatars;

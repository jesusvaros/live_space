import React, { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { friendsService, type FriendGoing } from '../../services/friends.service';
import FriendAvatars from './FriendAvatars';
import { friendsLabel } from './FriendsSection';

// On a concert: «Ana y 2 más van», with their faces. Nothing when no friend
// is going (or when signed out).
const FriendsGoingRow: React.FC<{ eventId: string; className?: string }> = ({ eventId, className = '' }) => {
  const { user } = useAuth();
  const [friends, setFriends] = useState<FriendGoing[]>([]);

  useEffect(() => {
    if (!user) {
      setFriends([]);
      return undefined;
    }
    let live = true;
    friendsService
      .going({ eventId })
      .then(rows => live && setFriends(rows))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [eventId, user]);

  if (friends.length === 0) return null;
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <FriendAvatars friends={friends} max={4} />
      <p className="min-w-0 truncate text-[14px] font-semibold text-app-ink">
        {friendsLabel(friends)} {friends.length === 1 ? 'va' : 'van'}
      </p>
    </div>
  );
};

export default FriendsGoingRow;

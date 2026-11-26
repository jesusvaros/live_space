import React, { useState } from 'react';
import { socialService } from '../../services/social.service';
import { followLabel, type Relation } from '../../services/friends.service';
import { notifyFollowsChanged } from './followsChanged';
import { track } from '../analytics/analytics';

// Follow / unfollow a person. Filled while you don't follow them (the action),
// outlined once you do; «Amigos» when you follow each other.
const FollowPersonButton: React.FC<{
  mySubjectId: string;
  theirSubjectId: string;
  relation: Relation;
  onChange: (relation: Relation) => void;
  className?: string;
}> = ({ mySubjectId, theirSubjectId, relation, onChange, className = '' }) => {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      if (relation.iFollow) {
        await socialService.unfollow(mySubjectId, theirSubjectId);
        track('unfollow', { kind: 'profile' });
        onChange({ ...relation, iFollow: false });
      } else {
        await socialService.follow(mySubjectId, theirSubjectId);
        track('follow', { kind: 'profile' });
        onChange({ ...relation, iFollow: true });
      }
      notifyFollowsChanged();
    } catch {
      // The button keeps its state; the next tap tries again.
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={relation.iFollow}
      onClick={() => void toggle()}
      className={`inline-flex min-h-10 shrink-0 items-center justify-center rounded-full px-4 text-[13px] font-semibold disabled:opacity-60 ${
        relation.iFollow ? 'border border-app-line text-app-ink' : 'bg-app-ink text-app-bg'
      } ${className}`}
    >
      {followLabel(relation)}
    </button>
  );
};

export default FollowPersonButton;

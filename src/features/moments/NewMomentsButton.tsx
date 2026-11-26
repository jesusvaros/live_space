import React from 'react';
import { newMomentsLabel } from './livePosts';

// «N momentos nuevos»: a pill at the top of the screen when other people
// have uploaded since it loaded. Tapping it loads them; until then nothing
// on screen moves.

type NewMomentsButtonProps = {
  count: number;
  onSelect: () => void;
  /** False when the number may include moments this view filters out (a city, «Siguiendo»). */
  exact?: boolean;
  className?: string;
};

const NewMomentsButton: React.FC<NewMomentsButtonProps> = ({ count, onSelect, exact = true, className }) => {
  if (count <= 0) return null;
  return (
    <div className={`pointer-events-none flex justify-center ${className ?? ''}`}>
      <button
        type="button"
        onClick={onSelect}
        className="pointer-events-auto inline-flex min-h-10 items-center gap-1.5 rounded-full bg-app-ink px-4 text-[13px] font-bold text-app-bg shadow-[0_6px_20px_rgba(0,0,0,0.55)] animate-timeline-fade motion-reduce:animate-none"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 19V5" />
          <path d="M6 11l6-6 6 6" />
        </svg>
        {newMomentsLabel(count, exact)}
      </button>
    </div>
  );
};

export default NewMomentsButton;

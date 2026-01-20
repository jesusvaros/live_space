import React from 'react';
import { PostWithRelations } from '../../lib/types';

type SecondStackProps = {
  moments: PostWithRelations[];
  selectedIndex: number;
  onSelect: (index: number) => void;
};

const SecondStack: React.FC<SecondStackProps> = ({ moments, selectedIndex, onSelect }) => {
  if (moments.length <= 1) return null;

  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1">
      {moments.map((moment, index) => (
        <button
          key={moment.id}
          type="button"
          className={`h-14 w-14 flex-shrink-0 overflow-hidden rounded-[14px] border transition ${
            index === selectedIndex
              ? 'border-[#ff6b4a]/55 shadow-[0_12px_24px_rgba(255,107,74,0.25)]'
              : 'border-white/10 bg-white/5'
          }`}
          onClick={() => onSelect(index)}
        >
          {moment.media_type === 'video' ? (
            moment.thumbnail_url ? (
              <img src={moment.thumbnail_url} alt={moment.caption || 'Moment'} className="h-full w-full object-cover" />
            ) : (
              <video muted preload="metadata" className="h-full w-full object-cover">
                <source src={moment.media_url} />
              </video>
            )
          ) : (
            <img src={moment.media_url} alt={moment.caption || 'Moment'} className="h-full w-full object-cover" />
          )}
          <span className="sr-only">Moment {index + 1}</span>
        </button>
      ))}
    </div>
  );
};

export default SecondStack;

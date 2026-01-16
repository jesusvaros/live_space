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
    <div className="second-stack">
      {moments.map((moment, index) => (
        <button
          key={moment.id}
          type="button"
          className={`second-stack-item ${index === selectedIndex ? 'is-active' : ''}`}
          onClick={() => onSelect(index)}
        >
          {moment.media_type === 'video' ? (
            moment.thumbnail_url ? (
              <img src={moment.thumbnail_url} alt={moment.caption || 'Moment'} />
            ) : (
              <video muted preload="metadata">
                <source src={moment.media_url} />
              </video>
            )
          ) : (
            <img src={moment.media_url} alt={moment.caption || 'Moment'} />
          )}
          <span className="sr-only">Moment {index + 1}</span>
        </button>
      ))}
    </div>
  );
};

export default SecondStack;

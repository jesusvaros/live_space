import React from 'react';
import { DiscoverTabKey } from '../types';

type DiscoverSegmentedControlProps = {
  value: DiscoverTabKey;
  onChange: (next: DiscoverTabKey) => void;
};

const DiscoverSegmentedControl: React.FC<DiscoverSegmentedControlProps> = ({ value, onChange }) => {
  return (
    <div className="flex items-center gap-6">
      <button
        type="button"
        onClick={() => onChange('artists')}
        className={`text-xs font-semibold uppercase tracking-[0.22em] transition-colors ${
          value === 'artists' ? 'text-app-accent' : 'text-white/55 hover:text-white/80'
        }`}
      >
        Artists
      </button>
      <button
        type="button"
        onClick={() => onChange('venues')}
        className={`text-xs font-semibold uppercase tracking-[0.22em] transition-colors ${
          value === 'venues' ? 'text-app-accent' : 'text-white/55 hover:text-white/80'
        }`}
      >
        Venues
      </button>
    </div>
  );
};

export default DiscoverSegmentedControl;

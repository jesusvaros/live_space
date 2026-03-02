import React from 'react';
import { DiscoverTabKey } from '../types';

type DiscoverSegmentedControlProps = {
  value: DiscoverTabKey;
  onChange: (next: DiscoverTabKey) => void;
};

const DiscoverSegmentedControl: React.FC<DiscoverSegmentedControlProps> = ({ value, onChange }) => {
  return (
    <div className="inline-flex w-full items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1">
      <button
        type="button"
        onClick={() => onChange('artists')}
        className={`inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
          value === 'artists'
            ? 'bg-app-accent text-white'
            : 'text-white/60 hover:text-white/85'
        }`}
      >
        Artists
      </button>
      <button
        type="button"
        onClick={() => onChange('venues')}
        className={`inline-flex flex-1 items-center justify-center rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors ${
          value === 'venues'
            ? 'bg-app-accent text-white'
            : 'text-white/60 hover:text-white/85'
        }`}
      >
        Venues
      </button>
    </div>
  );
};

export default DiscoverSegmentedControl;

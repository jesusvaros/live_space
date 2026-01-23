import React from 'react';
import { DiscoverTabKey } from '../types';

type DiscoverSegmentedControlProps = {
  value: DiscoverTabKey;
  onChange: (next: DiscoverTabKey) => void;
};

const DiscoverSegmentedControl: React.FC<DiscoverSegmentedControlProps> = ({ value, onChange }) => {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-1">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => onChange('artists')}
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${
            value === 'artists' ? 'bg-white/10 text-white' : 'text-slate-400'
          }`}
        >
          Artists
        </button>
        <button
          type="button"
          onClick={() => onChange('venues')}
          className={`rounded-xl px-3 py-2 text-xs font-semibold ${
            value === 'venues' ? 'bg-white/10 text-white' : 'text-slate-400'
          }`}
        >
          Venues
        </button>
      </div>
    </div>
  );
};

export default DiscoverSegmentedControl;


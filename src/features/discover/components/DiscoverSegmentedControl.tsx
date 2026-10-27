import React from 'react';
import { DiscoverTabKey } from '../types';

type DiscoverSegmentedControlProps = {
  value: DiscoverTabKey;
  onChange: (next: DiscoverTabKey) => void;
};

const OPTIONS: { key: DiscoverTabKey; label: string }[] = [
  { key: 'artists', label: 'Artistas' },
  { key: 'venues', label: 'Salas' },
];

const DiscoverSegmentedControl: React.FC<DiscoverSegmentedControlProps> = ({ value, onChange }) => (
  <div role="tablist" aria-label="Qué buscar" className="flex gap-2">
    {OPTIONS.map(option => (
      <button
        key={option.key}
        type="button"
        role="tab"
        aria-selected={value === option.key}
        onClick={() => onChange(option.key)}
        className={`min-h-10 rounded-full px-4 text-sm font-semibold transition-colors ${
          value === option.key ? 'bg-app-ink text-app-bg' : 'border border-app-line text-[#c9c5bd]'
        }`}
      >
        {option.label}
      </button>
    ))}
  </div>
);

export default DiscoverSegmentedControl;

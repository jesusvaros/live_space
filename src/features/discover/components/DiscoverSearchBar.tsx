import React from 'react';

type DiscoverSearchBarProps = {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onClear: () => void;
};

const DiscoverSearchBar: React.FC<DiscoverSearchBarProps> = ({ value, placeholder, onChange, onClear }) => {
  return (
    <div className="sticky top-0 z-20 -mx-4 bg-app-bg px-4 pb-3 pt-2">
      <div className="bg-white/5">
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            type="search"
            value={value}
            placeholder={placeholder || 'Search artists or venues'}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
          {value.trim().length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default DiscoverSearchBar;

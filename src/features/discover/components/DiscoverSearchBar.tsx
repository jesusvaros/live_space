import React from 'react';

type DiscoverSearchBarProps = {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onClear: () => void;
};

const DiscoverSearchBar: React.FC<DiscoverSearchBarProps> = ({ value, placeholder, onChange, onClear }) => {
  return (
    <div className="sticky top-0 z-30 -mx-4 bg-[linear-gradient(180deg,rgba(11,11,13,0.96),rgba(11,11,13,0.78))] px-4 pb-3 pt-2 backdrop-blur-xl">
      <div className="rounded-2xl border border-white/10 bg-white/[0.04]">
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
              className="shrink-0 rounded-full border border-white/20 bg-white/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/80"
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

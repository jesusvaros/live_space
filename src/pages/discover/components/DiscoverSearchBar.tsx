import React from 'react';

type DiscoverSearchBarProps = {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onClear: () => void;
};

const DiscoverSearchBar: React.FC<DiscoverSearchBarProps> = ({ value, placeholder, onChange, onClear }) => {
  return (
    <div className="sticky top-0 z-20 -mx-4 px-4 pb-3 pt-2 backdrop-blur">
      <div className="rounded-2xl border border-white/10 bg-[#141824]/90 shadow-[0_16px_32px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-3 px-4 py-3">
          <input
            type="search"
            value={value}
            placeholder={placeholder || 'Search artists or venues'}
            onChange={e => onChange(e.target.value)}
            className="w-full bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
          />
          {value.trim().length > 0 && (
            <button
              type="button"
              onClick={onClear}
              className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold text-slate-100"
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


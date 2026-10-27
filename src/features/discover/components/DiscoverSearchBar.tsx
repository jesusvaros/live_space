import React from 'react';

type DiscoverSearchBarProps = {
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
  onClear: () => void;
};

const DiscoverSearchBar: React.FC<DiscoverSearchBarProps> = ({ value, placeholder, onChange, onClear }) => (
  <label className="flex min-h-12 items-center gap-2.5 rounded-full border border-app-line bg-app-surface px-4 text-[#8f8b84]">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
    <span className="sr-only">Buscar</span>
    <input
      type="search"
      value={value}
      placeholder={placeholder || 'Artista o sala'}
      onChange={event => onChange(event.target.value)}
      className="min-w-0 flex-1 bg-transparent text-[15px] text-app-ink placeholder:text-[#8f8b84] focus:outline-none"
    />
    {value.trim().length > 0 && (
      <button type="button" onClick={onClear} className="shrink-0 text-xs font-semibold text-[#c9c5bd]">
        Borrar
      </button>
    )}
  </label>
);

export default DiscoverSearchBar;

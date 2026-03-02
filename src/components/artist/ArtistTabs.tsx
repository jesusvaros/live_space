import React from 'react';

export type ArtistTabKey = 'shows' | 'media' | 'moments' | 'about';

type ArtistTabsProps = {
  activeTab: ArtistTabKey;
  onSelect: (key: ArtistTabKey) => void;
};

const ArtistTabs: React.FC<ArtistTabsProps> = ({ activeTab, onSelect }) => (
  <div className="flex items-center gap-1 overflow-x-auto rounded-full border border-white/10 bg-white/[0.03] p-1">
    {(['shows', 'moments', 'media', 'about'] as const).map(key => (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(key)}
        className={`min-w-[84px] shrink-0 rounded-full px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] transition-colors ${
          activeTab === key
            ? 'bg-white/[0.12] text-white'
            : 'text-white/55 hover:bg-white/[0.05] hover:text-white/85'
        }`}
      >
        {key === 'shows' ? 'Shows' : key === 'media' ? 'Media' : key === 'moments' ? 'Moments' : 'About'}
      </button>
    ))}
  </div>
);

export default ArtistTabs;

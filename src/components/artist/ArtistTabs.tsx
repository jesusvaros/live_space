import React from 'react';

export type ArtistTabKey = 'shows' | 'media' | 'moments' | 'about';

type ArtistTabsProps = {
  activeTab: ArtistTabKey;
  onSelect: (key: ArtistTabKey) => void;
};

const ArtistTabs: React.FC<ArtistTabsProps> = ({ activeTab, onSelect }) => (
  <div className="flex flex-wrap items-center gap-6">
    {(['shows', 'moments', 'media', 'about'] as const).map(key => (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(key)}
        className={`text-xs font-semibold uppercase tracking-[0.22em] transition-colors ${
          activeTab === key ? 'text-app-accent' : 'text-white/55 hover:text-white/80'
        }`}
      >
        {key === 'shows' ? 'Shows' : key === 'media' ? 'Media' : key === 'moments' ? 'Moments' : 'About'}
      </button>
    ))}
  </div>
);

export default ArtistTabs;

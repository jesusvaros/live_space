import React from 'react';

export type ArtistTabKey = 'shows' | 'media' | 'moments' | 'about';

type ArtistTabsProps = {
  activeTab: ArtistTabKey;
  onSelect: (key: ArtistTabKey) => void;
};

const ArtistTabs: React.FC<ArtistTabsProps> = ({ activeTab, onSelect }) => (
  <div className="flex gap-2 rounded-full border border-white/10 bg-white/5 p-1">
    {(['shows', 'media', 'moments', 'about'] as const).map(key => (
      <button
        key={key}
        type="button"
        onClick={() => onSelect(key)}
        className={`flex-1 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
          activeTab === key ? 'bg-[#ff6b4a] text-white shadow-lg shadow-[#ff6b4a]/30' : 'text-slate-300 hover:text-white'
        }`}
      >
        {key === 'shows' ? 'Shows' : key === 'media' ? 'Media' : key === 'moments' ? 'Moments' : 'About'}
      </button>
    ))}
  </div>
);

export default ArtistTabs;

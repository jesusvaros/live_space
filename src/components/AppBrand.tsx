import React from 'react';

// Same mark as the public landing (src/landing/parts.tsx BrandMark).
const AppBrand: React.FC = () => {
  return (
    <div className="inline-flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r="12" fill="none" stroke="var(--app-accent)" strokeWidth="2.5" />
        <circle cx="14" cy="14" r="4.5" fill="var(--app-accent)" />
      </svg>
      <span className="font-display text-lg font-bold text-white">Live Space</span>
    </div>
  );
};

export default AppBrand;

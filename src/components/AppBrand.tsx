import React from 'react';

const AppBrand: React.FC = () => {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-white/10 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
        aria-hidden="true"
      >
        icon
      </span>
      <span className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-white/90">
        Live Space
      </span>
    </div>
  );
};

export default AppBrand;

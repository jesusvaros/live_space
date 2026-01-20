import React from 'react';

const AppBrand: React.FC = () => {
  return (
    <div className="inline-flex items-center gap-2">
      <span
        className="flex h-7 w-7 items-center justify-center rounded-[10px] bg-gradient-to-br from-[#ff6b4a] to-[#1e2638] text-[11px] font-bold uppercase tracking-[0.2em] text-white"
        aria-hidden="true"
      >
        LS
      </span>
      <span className="font-display text-sm font-semibold uppercase tracking-[0.2em] text-slate-50">
        Live Space
      </span>
    </div>
  );
};

export default AppBrand;

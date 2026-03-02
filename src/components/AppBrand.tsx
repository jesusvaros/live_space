import React from 'react';

const AppBrand: React.FC = () => {
  return (
    <div className="inline-flex items-center gap-2.5">
      <span
        className="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-[10px] border border-white/25 bg-black/30 text-white shadow-[0_8px_22px_rgba(255,141,64,0.32)]"
        aria-hidden="true"
      >
        <span
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(135deg, #ff8f4e 0%, #ffd166 48%, #6fd1c8 100%)',
          }}
        />
        <svg
          viewBox="0 0 24 24"
          className="relative z-10 h-4 w-4 text-[#12151f]"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M6 8.5h12M5.3 12h13.4M7.2 15.5h9.6" />
          <path d="M9 6.5v11M15 6.5v11" />
        </svg>
      </span>
      <span
        className="font-display text-sm font-semibold tracking-[0.08em] text-transparent"
        style={{
          backgroundImage: 'linear-gradient(90deg, #ffe5bf 0%, #ffd277 38%, #ff9f54 76%, #ff7f52 100%)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
        }}
      >
        SpacioMusical
      </span>
    </div>
  );
};

export default AppBrand;

import React from 'react';

/** Three bars: statistics. */
export const BarsGlyph: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
    <path d="M5 20V12M12 20V5M19 20v-9" />
  </svg>
);

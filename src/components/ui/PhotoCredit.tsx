import React from 'react';

// Credit for a fan photo used as a cover: the author keeps the credit
// wherever the moment is reused (docs/legal/licencia-momentos.md).
const PhotoCredit: React.FC<{ credit?: string | null; className?: string }> = ({ credit, className }) =>
  credit ? (
    <p className={`font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-[#c9c5bd] ${className || ''}`}>
      Foto <span className="normal-case">{credit}</span>
    </p>
  ) : null;

export default PhotoCredit;

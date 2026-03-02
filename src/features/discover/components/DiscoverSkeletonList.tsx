import React from 'react';

const DiscoverSkeletonList: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="h-[126px] animate-pulse rounded-2xl border border-white/10 bg-white/[0.03]"
        />
      ))}
    </div>
  );
};

export default DiscoverSkeletonList;

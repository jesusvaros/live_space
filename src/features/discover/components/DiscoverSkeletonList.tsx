import React from 'react';

const DiscoverSkeletonList: React.FC<{ rows?: number }> = ({ rows = 6 }) => {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, idx) => (
        <div
          key={idx}
          className="h-[74px] animate-pulse bg-white/5"
        />
      ))}
    </div>
  );
};

export default DiscoverSkeletonList;

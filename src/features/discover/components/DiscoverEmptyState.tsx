import React from 'react';

type DiscoverEmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const DiscoverEmptyState: React.FC<DiscoverEmptyStateProps> = ({ title, description, actionLabel, onAction }) => {
  return (
    <div className="bg-white/5 p-5">
      <p className="text-sm font-semibold text-white/90">{title}</p>
      {description && <p className="mt-1 text-xs text-white/55">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          className="mt-4 bg-white/10 px-4 py-2 text-sm font-semibold text-white"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default DiscoverEmptyState;

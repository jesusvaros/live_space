import React from 'react';

type DiscoverEmptyStateProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
};

const DiscoverEmptyState: React.FC<DiscoverEmptyStateProps> = ({ title, description, actionLabel, onAction }) => {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-200">{title}</p>
      {description && <p className="mt-1 text-xs text-slate-500">{description}</p>}
      {actionLabel && onAction && (
        <button
          type="button"
          className="mt-4 rounded-2xl bg-white/10 px-4 py-2 text-sm font-semibold text-slate-100"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
};

export default DiscoverEmptyState;


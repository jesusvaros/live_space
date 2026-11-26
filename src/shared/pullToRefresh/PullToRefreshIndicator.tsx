import React from 'react';
import { Spinner } from '../../components/ui/AppPrimitives';
import { PULL_THRESHOLD } from './pullGesture';
import type { PullToRefreshState } from './usePullToRefresh';

// The round chip that comes down with the finger: an arrow that turns to
// point up once letting go will reload, then a spinner while it reloads.
// Fixed at the top of the screen, over the content (which never moves).

const REST = 56;

const PullToRefreshIndicator: React.FC<PullToRefreshState & { className?: string }> = ({ distance, refreshing, className }) => {
  if (!refreshing && distance <= 0) return null;
  const ready = distance >= PULL_THRESHOLD;
  const offset = refreshing ? REST : Math.min(distance, REST + 30);
  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top,0px)-40px)] z-[1500] flex justify-center ${className ?? ''}`}
      style={{ transform: `translateY(${offset}px)`, transition: refreshing || distance === 0 ? 'transform 160ms ease-out' : undefined }}
    >
      <span
        // While reloading, the spinner says it itself.
        role={refreshing ? undefined : 'status'}
        aria-label={refreshing ? undefined : ready ? 'Suelta para actualizar' : 'Desliza para actualizar'}
        className="flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-app-surface text-app-ink shadow-[0_6px_20px_rgba(0,0,0,0.5)]"
        style={{ opacity: refreshing ? 1 : Math.min(1, distance / PULL_THRESHOLD) }}
      >
        {refreshing ? (
          <Spinner label="Actualizando" className="text-app-accent" />
        ) : (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={ready ? 'text-app-accent' : undefined}
            style={{ transform: `rotate(${ready ? 180 : (distance / PULL_THRESHOLD) * 150}deg)`, transition: 'transform 120ms ease-out' }}
          >
            <path d="M12 5v14" />
            <path d="M6 13l6 6 6-6" />
          </svg>
        )}
      </span>
    </div>
  );
};

export default PullToRefreshIndicator;

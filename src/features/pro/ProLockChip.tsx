import React from 'react';
import { useNavigate } from 'react-router-dom';
import { IconLock } from '../../components/icons';

/** Small «Pro» chip with a lock on a feature the free plan does not have; opens the Pro screen. */
const ProLockChip: React.FC<{ className?: string; label?: string }> = ({ className = '', label = 'Pro' }) => {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={event => {
        event.preventDefault();
        event.stopPropagation();
        navigate('/gestion/pro');
      }}
      aria-label="Función Pro: ver el plan"
      className={`inline-flex min-h-8 shrink-0 items-center gap-1 rounded-full border border-app-ink/70 px-2.5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-app-ink ${className}`}
    >
      <IconLock size={12} />
      {label}
    </button>
  );
};

export default ProLockChip;

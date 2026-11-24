import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { IconChevronLeft } from '../components/icons';
import { Spinner } from '../components/ui/AppPrimitives';
import { useWorkspace } from '../contexts/WorkspaceContext';
import ProPlanView from '../features/pro/ProPlanView';
import { useSubjectPlan } from '../features/pro/useSubjectPlan';
import { purchases } from '../services/purchases';
import { canGoBack } from '../app/useGoBack';

// /gestion/pro — the plan of the artist or venue being managed. Pro is bought
// in the app (store purchase); until that is live, «Hazte Pro» offers contact.
const GestionPro: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspace, managedEntities, ready } = useWorkspace();
  const entity =
    activeWorkspace && activeWorkspace.type !== 'user'
      ? activeWorkspace
      : managedEntities.find(item => item.type === 'artist' || item.type === 'venue') || null;
  const { loading, plan } = useSubjectPlan(entity?.subject_id);
  const [busy, setBusy] = useState(false);
  const [contact, setContact] = useState<{ href: string | null } | null>(null);
  const name = entity?.artist?.name || entity?.venue?.name || 'Tu perfil';

  const upgrade = async (pkg: 'monthly' | 'yearly') => {
    if (!entity) return;
    setBusy(true);
    try {
      const result = await purchases.purchase(entity.subject_id, pkg);
      if (result.kind === 'contact') {
        setContact({ href: result.href });
        if (result.href) window.location.href = result.href;
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell headerProps={null}>
      <div className="px-4 pb-[calc(32px+env(safe-area-inset-bottom,0px))] pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <header className="flex items-center gap-2 pb-4">
          <button
            type="button"
            aria-label="Volver"
            onClick={() => (canGoBack() ? navigate(-1) : navigate('/gestion', { replace: true }))}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface text-app-ink"
          >
            <IconChevronLeft size={22} />
          </button>
          <h1 className="m-0 font-display text-lg font-bold text-app-ink">Plan</h1>
        </header>
        {!ready || loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : !entity ? (
          <p className="text-sm text-white/65">Reclama tu sala o tu proyecto para ver su plan.</p>
        ) : (
          <ProPlanView name={name} plan={plan} onUpgrade={upgrade} busy={busy} contact={contact} />
        )}
      </div>
    </AppShell>
  );
};

export default GestionPro;

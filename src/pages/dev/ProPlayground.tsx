import React, { useState } from 'react';
import ProPlanView from '../../features/pro/ProPlanView';
import ProLockChip from '../../features/pro/ProLockChip';
import type { SubjectPlan } from '../../features/pro/planRules';

// /dev/pro?vista=gratis|pro|fundador — the Pro screen with mock plans.
const NOW = Date.parse('2026-12-01T12:00:00Z');
const PLANS: Record<string, SubjectPlan | null> = {
  gratis: null,
  pro: {
    subjectId: 'demo',
    plan: 'pro',
    status: 'active',
    source: 'store',
    founder: false,
    trialEndsAt: null,
    currentPeriodEnd: '2026-12-19T12:00:00Z',
  },
  fundador: {
    subjectId: 'demo',
    plan: 'pro',
    status: 'trialing',
    source: 'founder',
    founder: true,
    trialEndsAt: '2027-06-30T21:59:59Z',
    currentPeriodEnd: '2027-06-30T21:59:59Z',
  },
};

const ProPlayground: React.FC = () => {
  const view = new URLSearchParams(window.location.search).get('vista') || 'gratis';
  const [contact, setContact] = useState<{ href: string | null } | null>(null);
  return (
    <div className="min-h-dvh bg-app-bg px-4 pb-16 pt-6 text-app-ink">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-lg font-bold">Plan</h1>
        <ProLockChip />
      </div>
      <ProPlanView
        name="Sala Demo"
        plan={PLANS[view] ?? null}
        now={NOW}
        contact={contact}
        onUpgrade={() => setContact({ href: 'mailto:hola@example.org' })}
      />
    </div>
  );
};

export default ProPlayground;

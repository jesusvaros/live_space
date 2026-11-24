// Pro for artists and venues: prices, founders and what «Pro now» means.
// Mirrors public.subject_is_pro (migration 20261124000200_subject_plans.sql).

export type PlanName = 'free' | 'pro';
export type PlanStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
export type PlanSource = 'store' | 'founder' | 'manual';

export type SubjectPlan = {
  subjectId: string;
  plan: PlanName;
  status: PlanStatus;
  source: PlanSource;
  founder: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
};

/** Sold only as an in-app purchase (Play / App Store through RevenueCat). */
export const PRO_PRICES = { monthly: '14,99 €', yearly: '149 €' } as const;
export const PRO_ENTITLEMENT = 'pro';

/** Founders: first 50 profiles before this date, Pro free until FOUNDER_FREE_UNTIL, then −50 %. */
export const FOUNDER_SLOTS = 50;
export const FOUNDER_DEADLINE = '2027-04-01T00:00:00+02:00';
export const FOUNDER_FREE_UNTIL = '2027-06-30T23:59:59+02:00';
export const FOUNDER_DISCOUNT = 0.5;

/** Live Space's cut on merch paid inside the app (a Pro perk). Paying at the stand: 0 %. */
export const MERCH_PRO_FEE_BPS = 500;
export const merchFeeLabel = (bps = MERCH_PRO_FEE_BPS) => `${(bps / 100).toLocaleString('es-ES')} %`;

export const isProActive = (plan: SubjectPlan | null | undefined, now = Date.now()) =>
  Boolean(
    plan &&
      plan.plan === 'pro' &&
      (plan.status === 'active' || plan.status === 'trialing') &&
      (plan.currentPeriodEnd === null || Date.parse(plan.currentPeriodEnd) > now),
  );

const DAY = 24 * 60 * 60 * 1000;

/** Whole days left of the current Pro period (founders: of the free period); null when not ending. */
export const daysLeft = (plan: SubjectPlan | null | undefined, now = Date.now()) => {
  if (!isProActive(plan, now) || !plan?.currentPeriodEnd) return null;
  return Math.max(0, Math.ceil((Date.parse(plan.currentPeriodEnd) - now) / DAY));
};

/** Whether the founders' offer can still be granted. */
export const founderOfferOpen = (now = Date.now()) => now < Date.parse(FOUNDER_DEADLINE);

export type ProPerk = { key: string; title: string; free: boolean };

/** Free vs Pro, short: two columns of ticks on the Pro screen. */
export const PRO_PERKS: ProPerk[] = [
  { key: 'profile', title: 'Perfil verificado y conciertos', free: true },
  { key: 'qr', title: 'QR y cartel del concierto', free: true },
  { key: 'stand', title: 'Merch: reserva y paga en el puesto', free: true },
  { key: 'stats', title: 'Estadísticas completas', free: false },
  { key: 'downloads', title: 'Descargar clips del público', free: false },
  { key: 'merch_app', title: `Merch pagado en la app (${merchFeeLabel()})`, free: false },
];

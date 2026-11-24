import { LEGAL_CONTACT_EMAIL } from '../features/legal/config';
import { PRO_ENTITLEMENT, PRO_PRICES } from '../features/pro/planRules';

// Buying Pro. Pro is sold ONLY as an in-app purchase (Google Play / App
// Store) through RevenueCat, entitlement «pro»; the store webhook writes
// public.subject_plans (source 'store'). The RevenueCat SDK is not installed
// yet: until it is, purchase() falls back to «Te escribimos» (an email to the
// team). Swap `provider` when the SDK lands; screens only use this interface.

export type ProPackage = { id: 'monthly' | 'yearly'; price: string };

export type PurchaseResult =
  | { kind: 'purchased' }
  | { kind: 'cancelled' }
  | { kind: 'contact'; href: string | null };

export type PurchasesProvider = {
  /** Whether real store purchases are available on this build. */
  available: () => boolean;
  packages: () => Promise<ProPackage[]>;
  purchase: (subjectId: string, pkg: ProPackage['id']) => Promise<PurchaseResult>;
  restore: () => Promise<boolean>;
};

export const contactHref = (subjectId: string, email = LEGAL_CONTACT_EMAIL) =>
  email
    ? `mailto:${email}?subject=${encodeURIComponent('Quiero Live Space Pro')}&body=${encodeURIComponent(`Perfil: ${subjectId}`)}`
    : null;

const provider: PurchasesProvider = {
  available: () => false,
  packages: async () => [
    { id: 'monthly', price: PRO_PRICES.monthly },
    { id: 'yearly', price: PRO_PRICES.yearly },
  ],
  purchase: async subjectId => ({ kind: 'contact', href: contactHref(subjectId) }),
  restore: async () => false,
};

export const purchases = { ...provider, entitlement: PRO_ENTITLEMENT };

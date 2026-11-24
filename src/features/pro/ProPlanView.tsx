import React, { useState } from 'react';
import Button from '../../components/ui/Button';
import { IconCamera, IconCheckCircle, IconLock, IconQrCode, IconShield, IconTicket, IconWallet } from '../../components/icons';
import { BarsGlyph } from './glyphs';
import { daysLeft, FOUNDER_SLOTS, founderOfferOpen, isProActive, PRO_PERKS, PRO_PRICES, type SubjectPlan } from './planRules';

// The Pro screen body: where the plan stands, free vs Pro as two columns of
// shapes (filled tick / lock), the price and «Hazte Pro». Presentational so
// /dev/pro can show every state with mock data.

const PERK_ICON: Record<string, React.ReactNode> = {
  profile: <IconShield size={18} />,
  qr: <IconQrCode size={18} />,
  stand: <IconTicket size={18} />,
  stats: <BarsGlyph />,
  downloads: <IconCamera size={18} />,
  merch_app: <IconWallet size={18} />,
};

export type ProPlanViewProps = {
  name: string;
  plan: SubjectPlan | null;
  /** «Hazte Pro»: resolves when the purchase (or the contact fallback) is done. */
  onUpgrade: (pkg: 'monthly' | 'yearly') => void;
  busy?: boolean;
  /** Shown after «Hazte Pro» while store purchases are not live yet. */
  contact?: { href: string | null } | null;
  now?: number;
};

const Mark: React.FC<{ on: boolean }> = ({ on }) =>
  on ? (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-app-ink text-app-bg" aria-label="Incluido">
      <IconCheckCircle size={16} />
    </span>
  ) : (
    <span className="flex h-7 w-7 items-center justify-center rounded-full border border-dashed border-white/30 text-white/45" aria-label="No incluido">
      <IconLock size={13} />
    </span>
  );

const ProPlanView: React.FC<ProPlanViewProps> = ({ name, plan, onUpgrade, busy = false, contact = null, now = Date.now() }) => {
  const [pkg, setPkg] = useState<'monthly' | 'yearly'>('yearly');
  const pro = isProActive(plan, now);
  const left = daysLeft(plan, now);
  const founder = Boolean(plan?.founder && pro);

  return (
    <div className="flex flex-col gap-5">
      {/* Status: a ticket stub, solid when Pro, dashed when free. */}
      <section
        aria-label="Tu plan"
        className={`flex items-stretch overflow-hidden rounded-3xl border ${
          pro ? 'border-app-ink bg-app-ink text-app-bg' : 'border-dashed border-white/30 text-app-ink'
        }`}
      >
        <div className="min-w-0 flex-1 px-4 py-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] opacity-60">{name}</p>
          <p className="mt-1 font-poster text-[34px] leading-none">{pro ? (founder ? 'Fundador' : 'Pro') : 'Gratis'}</p>
          {pro && left !== null ? (
            <p className="mt-1.5 text-[13px] font-semibold opacity-70">
              {founder ? `Pro gratis · ${left} días` : `Renueva en ${left} días`}
            </p>
          ) : null}
        </div>
        <span aria-hidden className={`w-0 border-l-2 border-dashed ${pro ? 'border-app-bg/30' : 'border-white/20'}`} />
        <div className="flex w-20 shrink-0 items-center justify-center">
          {pro ? <IconCheckCircle size={30} /> : <IconLock size={26} className="opacity-60" />}
        </div>
      </section>

      {/* Free vs Pro: one row per perk, a column of marks for each plan. */}
      <section aria-label="Gratis y Pro">
        <div className="grid grid-cols-[1fr_44px_44px] items-center gap-y-2.5 px-1">
          <span />
          <span className="text-center font-mono text-[10px] font-semibold uppercase text-white/50">Gratis</span>
          <span className="text-center font-mono text-[10px] font-bold uppercase text-app-ink">Pro</span>
          {PRO_PERKS.map(perk => (
            <React.Fragment key={perk.key}>
              <span className="flex min-w-0 items-center gap-2.5 text-[14px] text-app-ink">
                <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-app-line bg-app-surface">
                  {PERK_ICON[perk.key]}
                </span>
                <span className="min-w-0">{perk.title}</span>
              </span>
              <span className="flex justify-center"><Mark on={perk.free} /></span>
              <span className="flex justify-center"><Mark on /></span>
            </React.Fragment>
          ))}
        </div>
      </section>

      {!pro ? (
        <section aria-label="Hazte Pro" className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Periodo" className="grid grid-cols-2 gap-2">
            {(['monthly', 'yearly'] as const).map(option => {
              const active = pkg === option;
              return (
                <button
                  key={option}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setPkg(option)}
                  className={`flex min-h-16 flex-col items-start justify-center rounded-2xl border px-3.5 text-left ${
                    active ? 'border-app-ink bg-app-surface' : 'border-app-line'
                  }`}
                >
                  <span className="font-display text-[19px] font-bold text-app-ink">
                    {option === 'monthly' ? PRO_PRICES.monthly : PRO_PRICES.yearly}
                  </span>
                  <span className="text-[12px] text-white/55">{option === 'monthly' ? 'al mes' : 'al año · 2 meses gratis'}</span>
                </button>
              );
            })}
          </div>
          {founderOfferOpen(now) ? (
            <p className="flex items-center gap-2 rounded-2xl border border-dashed border-white/25 px-3.5 py-2.5 text-[13px] text-white/75">
              <IconShield size={16} className="shrink-0" />
              Fundadores: los {FOUNDER_SLOTS} primeros, gratis hasta junio y −50 % después.
            </p>
          ) : null}
          <Button size="lg" block disabled={busy} onClick={() => onUpgrade(pkg)}>
            {busy ? 'Un momento…' : 'Hazte Pro'}
          </Button>
          {contact ? (
            <p role="status" className="text-center text-[13px] text-white/70">
              {contact.href ? (
                <>
                  Aún no se compra desde la app.{' '}
                  <a href={contact.href} className="font-semibold text-app-ink underline underline-offset-2">
                    Te escribimos
                  </a>
                </>
              ) : (
                'Aún no se compra desde la app. Te escribimos nosotros.'
              )}
            </p>
          ) : null}
        </section>
      ) : null}
    </div>
  );
};

export default ProPlanView;

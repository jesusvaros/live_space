import React, { useEffect, useRef, useState } from 'react';
import { IconInfo } from '../icons';
import { Modal } from './AppPrimitives';

// A short, visual explainer for a section (merch, and any other that needs
// one): a few steps that light up one after another, very little text.
// It opens by itself the first time the section scrolls into view, and an
// «i» next to the section title opens it again whenever you want.

export type IntroStep = { icon: React.ReactNode; text: string };

const seenKey = (id: string) => `live_space.intro_seen.${id}`;
const wasSeen = (id: string) => {
  try {
    return window.localStorage.getItem(seenKey(id)) === '1';
  } catch {
    return true;
  }
};
const markSeen = (id: string) => {
  try {
    window.localStorage.setItem(seenKey(id), '1');
  } catch {
    // ignore storage failures
  }
};

const STEP_MS = 900;

const IntroSheet: React.FC<{ title: string; steps: IntroStep[]; isOpen: boolean; onClose: () => void }> = ({
  title,
  steps,
  isOpen,
  onClose,
}) => {
  // Lights the steps up one by one each time the sheet opens.
  const [lit, setLit] = useState(0);
  useEffect(() => {
    if (!isOpen) return undefined;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setLit(steps.length);
      return undefined;
    }
    setLit(0);
    const timers = steps.map((_, index) => window.setTimeout(() => setLit(index + 1), 250 + index * STEP_MS));
    return () => timers.forEach(window.clearTimeout);
  }, [isOpen, steps]);

  return (
    <Modal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.6} title={title}>
      <div className="px-5 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <h3 className="m-0 font-display text-[26px] font-bold leading-tight text-app-ink">{title}</h3>
        <ol className="mt-6 flex flex-col gap-5">
          {steps.map((step, index) => {
            const on = index < lit;
            return (
              <li
                key={step.text}
                className={`flex items-center gap-4 transition-all duration-500 motion-reduce:transition-none ${
                  on ? 'translate-x-0 opacity-100' : 'translate-x-3 opacity-25'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-colors duration-500 ${
                    on ? 'bg-app-accent text-[#14151a]' : 'bg-app-surface text-white/50'
                  }`}
                >
                  {step.icon}
                </span>
                <span className="font-display text-[18px] font-bold leading-snug text-app-ink">{step.text}</span>
              </li>
            );
          })}
        </ol>
        <button
          type="button"
          onClick={onClose}
          className="mt-8 min-h-12 w-full rounded-full bg-app-ink text-[15px] font-bold text-app-bg"
        >
          Entendido
        </button>
      </div>
    </Modal>
  );
};

type SectionIntroProps = {
  /** Remembers per section that it was shown once. */
  id: string;
  title: string;
  steps: IntroStep[];
};

/**
 * The «i» button to put next to a section title. Also opens the explainer
 * by itself the first time the button scrolls into view.
 */
const SectionIntro: React.FC<SectionIntroProps> = ({ id, title, steps }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || wasSeen(id) || typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(
      entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        markSeen(id);
        setOpen(true);
      },
      { threshold: 1 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [id]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        aria-label={`Cómo funciona: ${title}`}
        onClick={() => {
          markSeen(id);
          setOpen(true);
        }}
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white/60"
      >
        <IconInfo size={20} />
      </button>
      <IntroSheet title={title} steps={steps} isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
};

export default SectionIntro;

import React, { useLayoutEffect, useRef } from 'react';
import { IconChevronDown } from '../icons';
import { Modal } from './AppPrimitives';

// A short row of filters: a few quick pills plus pills that open a sheet with
// every option («Fecha ▾», «Estilos ▾»). Whatever is selected moves to the
// start of the row with a slide (FLIP), turns solid and gets a ✕. Neutral
// colours: selected is told apart by shape (filled + ✕), not by hue.

export type FilterPill = {
  key: string;
  label: string;
  icon?: React.ReactNode;
  selected: boolean;
  /** Quick pill: toggles. Group pill: opens its sheet. */
  onPress: () => void;
  /** Group pill: shows a chevron while nothing is picked. */
  opens?: boolean;
  /** Clears a selected pill (defaults to onPress). */
  onClear?: () => void;
};

const reducedMotion = () =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Selected first, the rest in their given order. */
export const orderPills = <T extends Pick<FilterPill, 'selected'>>(pills: T[]) => [
  ...pills.filter(pill => pill.selected),
  ...pills.filter(pill => !pill.selected),
];

const base =
  'inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border text-[13px] font-semibold transition-colors';
export const pillClass = (selected: boolean) =>
  `${base} ${
    selected
      ? 'border-app-ink bg-app-ink text-app-bg'
      : 'border-app-line bg-app-surface/90 text-app-ink/85 backdrop-blur-md'
  }`;

type FilterPillsProps = {
  pills: FilterPill[];
  label: string;
  /** Leading element that never moves (e.g. the filters button). */
  leading?: React.ReactNode;
  className?: string;
};

const FilterPills: React.FC<FilterPillsProps> = ({ pills, label, leading, className = '' }) => {
  const ordered = orderPills(pills);
  const row = useRef<HTMLDivElement | null>(null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const lastLeft = useRef(new Map<string, number>());
  const selectedKey = ordered.filter(pill => pill.selected).map(pill => `${pill.key}:${pill.label}`).join('|');

  // FLIP: measure where each pill was, let React move it, then slide it from
  // its old spot to the new one.
  useLayoutEffect(() => {
    const previous = lastLeft.current;
    const next = new Map<string, number>();
    const animate = !reducedMotion();
    nodes.current.forEach((node, key) => {
      const left = node.offsetLeft;
      next.set(key, left);
      const before = previous.get(key);
      if (!animate || before === undefined || before === left) return;
      node.style.transition = 'none';
      node.style.transform = `translateX(${before - left}px)`;
      requestAnimationFrame(() => {
        node.style.transition = 'transform 320ms cubic-bezier(0.2, 0.8, 0.2, 1)';
        node.style.transform = '';
      });
    });
    lastLeft.current = next;
    if (previous.size && row.current && row.current.scrollLeft > 0) {
      row.current.scrollTo({ left: 0, behavior: animate ? 'smooth' : 'auto' });
    }
  }, [selectedKey]);

  return (
    <div
      ref={row}
      role="group"
      aria-label={label}
      className={`flex items-center gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {leading}
      {ordered.map(pill => (
        <span
          key={pill.key}
          ref={node => {
            if (node) nodes.current.set(pill.key, node);
            else nodes.current.delete(pill.key);
          }}
          className={`${pillClass(pill.selected)} ${pill.selected ? 'pl-3.5 pr-1' : 'px-0'}`}
        >
          <button
            type="button"
            aria-pressed={pill.selected}
            aria-haspopup={pill.opens ? 'dialog' : undefined}
            onClick={pill.onPress}
            className={`inline-flex h-full items-center gap-1.5 ${pill.selected ? '' : 'px-3.5'}`}
          >
            {pill.icon ? <span aria-hidden className="inline-flex">{pill.icon}</span> : null}
            {pill.label}
            {pill.opens && !pill.selected ? <IconChevronDown size={14} className="-mr-0.5 opacity-60" /> : null}
          </button>
          {pill.selected ? (
            <button
              type="button"
              aria-label={`Quitar ${pill.label}`}
              onClick={pill.onClear ?? pill.onPress}
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[13px] leading-none"
            >
              ✕
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
};

export type SheetOption = { value: string; label: string; icon?: React.ReactNode };

type FilterSheetProps = {
  isOpen: boolean;
  title: string;
  onClose: () => void;
  options: SheetOption[];
  selected: string | null;
  onSelect: (value: string | null) => void;
  /** Extra content under the options (e.g. a day picker). */
  children?: React.ReactNode;
};

/** The detailed options of a group pill: all of them as pills, one tap picks and closes. */
export const FilterSheet: React.FC<FilterSheetProps> = ({ isOpen, title, onClose, options, selected, onSelect, children }) => (
  <Modal isOpen={isOpen} onDidDismiss={onClose} initialBreakpoint={0.6} title={title}>
    <div className="max-h-[80dvh] overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom,0px))] pt-3">
      <div className="mx-auto h-1 w-10 rounded-full bg-white/20" aria-hidden />
      <div className="mt-4 flex items-center justify-between">
        <h2 className="font-display text-xl font-bold text-app-ink">{title}</h2>
        {selected ? (
          <button
            type="button"
            onClick={() => {
              onSelect(null);
              onClose();
            }}
            className="min-h-11 px-2 text-sm font-semibold text-app-ink/60"
          >
            Quitar
          </button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map(option => {
          const active = option.value === selected;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => {
                onSelect(active ? null : option.value);
                onClose();
              }}
              className={`${pillClass(active)} px-4`}
            >
              {option.icon ? <span aria-hidden className="inline-flex">{option.icon}</span> : null}
              {option.label}
            </button>
          );
        })}
      </div>
      {children}
    </div>
  </Modal>
);

export default FilterPills;

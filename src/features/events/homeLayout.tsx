import React, { useState } from 'react';
import { Modal } from '../../components/ui/AppPrimitives';
import { IconChevronDown, IconChevronUp } from '../../components/icons';

export type HomeSectionKey = 'going' | 'forYou' | 'following' | 'festivals' | 'listings';

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  going: 'Voy',
  forYou: 'Para ti',
  following: 'Lo que sigues',
  festivals: 'Festivales',
  listings: 'Cartelera de tu ciudad',
};

const DEFAULT_ORDER: HomeSectionKey[] = ['going', 'forYou', 'following', 'festivals', 'listings'];
const layoutKey = 'live_space.home.layout.v1';

export type HomeLayout = { order: HomeSectionKey[]; hidden: HomeSectionKey[] };

const DEFAULT_LAYOUT: HomeLayout = { order: DEFAULT_ORDER, hidden: [] };

// Saved layouts keep working when a section is added or removed later.
const readLayout = (): HomeLayout => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(layoutKey) || 'null') as Partial<HomeLayout> | null;
    if (!parsed) return DEFAULT_LAYOUT;
    const known = (keys: unknown) =>
      (Array.isArray(keys) ? keys : []).filter((key): key is HomeSectionKey => DEFAULT_ORDER.includes(key));
    const order = known(parsed.order);
    // A new section lands after the one it follows by default.
    DEFAULT_ORDER.forEach((key, index) => {
      if (order.includes(key)) return;
      const previous = DEFAULT_ORDER.slice(0, index).reverse().find(item => order.includes(item));
      order.splice(previous ? order.indexOf(previous) + 1 : 0, 0, key);
    });
    return { order, hidden: known(parsed.hidden) };
  } catch {
    return DEFAULT_LAYOUT;
  }
};

const persistLayout = (layout: HomeLayout) => {
  try {
    window.localStorage.setItem(layoutKey, JSON.stringify(layout));
  } catch {
    // ignore storage failures
  }
};

export const useHomeLayout = () => {
  const [layout, setLayoutState] = useState<HomeLayout>(() => readLayout());
  const setLayout = (next: HomeLayout) => {
    setLayoutState(next);
    persistLayout(next);
  };
  return { layout, setLayout, reset: () => setLayout(DEFAULT_LAYOUT) };
};

type HomeCustomizerProps = {
  isOpen: boolean;
  onDismiss: () => void;
  layout: HomeLayout;
  onChange: (layout: HomeLayout) => void;
  onReset: () => void;
};

// Sheet to show, hide and reorder the home sections.
export const HomeCustomizer: React.FC<HomeCustomizerProps> = ({ isOpen, onDismiss, layout, onChange, onReset }) => {
  const move = (index: number, delta: number) => {
    const order = [...layout.order];
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    [order[index], order[target]] = [order[target], order[index]];
    onChange({ ...layout, order });
  };

  const toggle = (key: HomeSectionKey) => {
    const hidden = layout.hidden.includes(key) ? layout.hidden.filter(item => item !== key) : [...layout.hidden, key];
    onChange({ ...layout, hidden });
  };

  return (
    <Modal isOpen={isOpen} onDidDismiss={onDismiss} initialBreakpoint={0.6} title="Personalizar inicio">
      <div className="px-4 pb-[calc(20px+env(safe-area-inset-bottom,0px))] pt-3">
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" aria-hidden />
        <h3 className="px-1 font-display text-lg font-bold text-app-ink">Tu inicio</h3>
        <p className="px-1 pb-3 text-sm text-white/55">Elige qué ver y en qué orden.</p>
        <ul className="flex flex-col gap-2">
          {layout.order.map((key, index) => {
            const visible = !layout.hidden.includes(key);
            return (
              <li key={key} className="flex items-center gap-2 rounded-2xl border border-app-line bg-app-surface py-1 pl-3.5 pr-1">
                <label className="flex min-h-11 flex-1 items-center gap-3 text-[15px] font-semibold text-app-ink">
                  <input
                    type="checkbox"
                    checked={visible}
                    onChange={() => toggle(key)}
                    className="h-5 w-5 accent-[#ff5b2e]"
                  />
                  <span className={visible ? '' : 'text-white/45'}>{HOME_SECTION_LABELS[key]}</span>
                </label>
                <button
                  type="button"
                  aria-label={`Subir ${HOME_SECTION_LABELS[key]}`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-ink disabled:opacity-30"
                >
                  <IconChevronUp size={18} />
                </button>
                <button
                  type="button"
                  aria-label={`Bajar ${HOME_SECTION_LABELS[key]}`}
                  disabled={index === layout.order.length - 1}
                  onClick={() => move(index, 1)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-full text-app-ink disabled:opacity-30"
                >
                  <IconChevronDown size={18} />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onReset}
          className="mt-3 min-h-11 w-full rounded-full text-sm font-semibold text-white/60"
        >
          Restablecer
        </button>
      </div>
    </Modal>
  );
};

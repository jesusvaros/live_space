import React, { useState } from 'react';
import { formatEuros, MerchItem } from '../../services/merch.service';
import { SINGLE_VARIANT_LABEL, stockLabel } from './merchRules';

type MerchItemCardProps = {
  item: MerchItem;
  quantities: Record<string, number>;
  /** Adds (+1) or removes (-1) a unit of a variant. */
  onChange: (variantId: string, delta: number, stock: number | null) => void;
  disabled?: boolean;
};

const round = 'flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold leading-none disabled:opacity-35';

// A product the way fashion shops show it: a tall photo, the name small and
// in capitals, the price under it, no boxes. «+» on the photo adds it; with
// sizes it first opens the sizes over the bottom of the photo. Every control
// sits inside the photo's bounds, so nothing gets clipped.
const MerchItemCard: React.FC<MerchItemCardProps> = ({ item, quantities, onChange, disabled }) => {
  const single = item.variants.length === 1 && item.variants[0].label === SINGLE_VARIANT_LABEL;
  const [selectedId, setSelectedId] = useState<string | null>(
    single ? (item.variants[0]?.id ?? null) : (item.variants.find(variant => (quantities[variant.id] || 0) > 0)?.id ?? null),
  );
  const [picking, setPicking] = useState(false);
  const selected = item.variants.find(variant => variant.id === selectedId) ?? null;
  const soldOut = item.variants.every(variant => variant.stock === 0);
  const quantity = selected ? quantities[selected.id] || 0 : 0;
  const low = stockLabel(selected?.stock ?? (single ? (item.variants[0]?.stock ?? null) : null));
  const atMax = Boolean(selected && selected.stock !== null && quantity >= selected.stock);

  const add = () => {
    if (!selected) {
      setPicking(true);
      return;
    }
    onChange(selected.id, 1, selected.stock);
  };

  const pick = (variantId: string) => {
    const variant = item.variants.find(entry => entry.id === variantId);
    setSelectedId(variantId);
    setPicking(false);
    if (variant && (quantities[variant.id] || 0) === 0) onChange(variant.id, 1, variant.stock);
  };

  return (
    <li className="min-w-0">
      <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-white/[0.06]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-4xl font-bold text-white/25">
            {item.name.slice(0, 1).toUpperCase()}
          </span>
        )}

        {soldOut ? (
          <span className="absolute inset-0 flex items-center justify-center bg-black/55 font-mono text-[11px] font-bold uppercase tracking-[0.1em] text-white">
            Agotado
          </span>
        ) : picking ? (
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-1.5 bg-black/75 p-2.5 backdrop-blur" role="group" aria-label={`Tallas de ${item.name}`}>
            {item.variants.map(variant => {
              const out = variant.stock === 0;
              return (
                <button
                  key={variant.id}
                  type="button"
                  disabled={out || disabled}
                  aria-label={out ? `${variant.label} agotada` : `Talla ${variant.label}`}
                  onClick={() => pick(variant.id)}
                  className={`min-h-9 min-w-9 rounded-full px-2.5 text-[13px] font-bold text-white ${
                    variant.id === selectedId ? 'bg-white text-[#14151a]' : 'bg-white/10'
                  } ${out ? 'line-through opacity-35' : ''}`}
                >
                  {variant.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="absolute bottom-2 right-2 flex items-center gap-0.5 rounded-full bg-white/90 p-0.5 text-[#14151a] backdrop-blur">
            {quantity > 0 && selected ? (
              <>
                <button
                  type="button"
                  aria-label={`Quitar ${item.name}${single ? '' : ` ${selected.label}`}`}
                  disabled={disabled}
                  onClick={() => onChange(selected.id, -1, selected.stock)}
                  className={round}
                >
                  −
                </button>
                <span className="w-5 text-center font-mono text-[14px] font-bold" aria-live="polite">
                  {quantity}
                </span>
              </>
            ) : null}
            <button
              type="button"
              aria-label={`Añadir ${item.name}${selected && !single ? ` ${selected.label}` : ''}`}
              disabled={disabled || atMax}
              onClick={add}
              className={round}
            >
              +
            </button>
          </div>
        )}
      </div>

      <p className="mt-2 truncate text-[12px] font-semibold uppercase tracking-[0.06em] text-app-ink">{item.name}</p>
      <p className="mt-0.5 flex items-center gap-2 text-[13px] text-white/70">
        {formatEuros(item.priceCents)}
        {!single && selected && !soldOut ? (
          <button type="button" onClick={() => setPicking(true)} className="font-semibold text-app-ink underline-offset-2 hover:underline">
            Talla {selected.label}
          </button>
        ) : null}
        {low && !soldOut ? <span className="text-app-accent">{low}</span> : null}
      </p>
    </li>
  );
};

export default MerchItemCard;

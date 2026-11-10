import React, { useState } from 'react';
import { formatEuros, MerchItem } from '../../services/merch.service';
import { itemStock, SINGLE_VARIANT_LABEL, stockLabel } from './merchRules';

type MerchItemCardProps = {
  item: MerchItem;
  quantities: Record<string, number>;
  /** Adds (+1) or removes (-1) a unit of a variant. */
  onChange: (variantId: string, delta: number, stock: number | null) => void;
  disabled?: boolean;
};

const stepperButton =
  'flex h-10 w-10 items-center justify-center rounded-full border border-app-line text-lg font-bold text-app-ink disabled:opacity-35';

// A product on the concert page: photo, name, price, sizes and how many.
const MerchItemCard: React.FC<MerchItemCardProps> = ({ item, quantities, onChange, disabled }) => {
  const single = item.variants.length === 1 && item.variants[0].label === SINGLE_VARIANT_LABEL;
  const firstAvailable = item.variants.find(variant => variant.stock !== 0) ?? item.variants[0];
  const [selectedId, setSelectedId] = useState<string | null>(
    single ? (item.variants[0]?.id ?? null) : (item.variants.find(variant => (quantities[variant.id] || 0) > 0)?.id ?? null),
  );
  const selected = item.variants.find(variant => variant.id === selectedId) ?? (single ? item.variants[0] : null);
  const soldOut = item.variants.every(variant => variant.stock === 0);
  const totalLeft = itemStock(item.variants);
  const itemLabel = soldOut ? 'Agotado' : stockLabel(single ? (item.variants[0]?.stock ?? null) : totalLeft);
  const quantity = selected ? quantities[selected.id] || 0 : 0;
  const inCart = item.variants.reduce((sum, variant) => sum + (quantities[variant.id] || 0), 0);

  return (
    <li className={`overflow-hidden rounded-2xl border bg-app-surface ${inCart > 0 ? 'border-app-accent' : 'border-app-line'}`}>
      <div className="flex gap-3 p-2.5">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center font-display text-3xl font-bold text-white/25">
              {item.name.slice(0, 1).toUpperCase()}
            </span>
          )}
          {soldOut ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/60 font-mono text-[11px] font-bold uppercase text-white">
              Agotado
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-bold leading-snug text-app-ink">{item.name}</p>
          <div className="flex items-baseline gap-2">
            <p className="font-mono text-[15px] font-semibold text-app-accent">{formatEuros(item.priceCents)}</p>
            {itemLabel && !soldOut ? <p className="text-[12px] font-semibold text-amber-300">{itemLabel}</p> : null}
          </div>
          {!single ? (
            <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label={`Tallas de ${item.name}`}>
              {item.variants.map(variant => {
                const out = variant.stock === 0;
                const count = quantities[variant.id] || 0;
                const active = selected?.id === variant.id;
                return (
                  <button
                    key={variant.id}
                    type="button"
                    disabled={out || disabled}
                    aria-pressed={active}
                    aria-label={out ? `${variant.label} agotada` : `Talla ${variant.label}`}
                    onClick={() => setSelectedId(variant.id)}
                    className={`relative min-h-10 min-w-10 rounded-full border px-3 text-[13px] font-bold transition ${
                      active ? 'border-app-accent bg-app-accent text-[#14151a]' : 'border-app-line text-app-ink'
                    } ${out ? 'line-through opacity-35' : ''}`}
                  >
                    {variant.label}
                    {count > 0 ? (
                      <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1 font-mono text-[10px] text-[#14151a]">
                        {count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>

      {!soldOut ? (
        <div className="flex items-center gap-3 border-t border-app-line px-3 py-2">
          {selected ? (
            <>
              <span className="min-w-0 flex-1 text-[13px] text-white/70">
                {single ? 'Unidades' : `Talla ${selected.label}`}
                {!single && stockLabel(selected.stock) ? (
                  <span className="text-amber-300"> · {stockLabel(selected.stock)}</span>
                ) : null}
              </span>
              <button
                type="button"
                aria-label={`Quitar una ${single ? 'unidad' : selected.label}`}
                disabled={disabled || quantity === 0}
                onClick={() => onChange(selected.id, -1, selected.stock)}
                className={stepperButton}
              >
                −
              </button>
              <span className="w-6 text-center font-mono text-[15px] font-bold text-app-ink" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label={`Añadir una ${single ? 'unidad' : selected.label}`}
                disabled={disabled || (selected.stock !== null && quantity >= selected.stock)}
                onClick={() => onChange(selected.id, 1, selected.stock)}
                className={`${stepperButton} border-app-accent text-app-accent`}
              >
                +
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={disabled}
              onClick={() => setSelectedId(firstAvailable?.id ?? null)}
              className="min-h-10 text-[13px] font-semibold text-white/60"
            >
              Elige talla
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
};

export default MerchItemCard;

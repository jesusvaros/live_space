import React from 'react';
import Button from '../../../components/ui/Button';
import { formatEuros, MerchItem } from '../../../services/merch.service';
import { SINGLE_VARIANT_LABEL } from '../merchRules';

type MerchItemsListProps = {
  items: MerchItem[];
  busy?: boolean;
  onAdd: () => void;
  onEdit: (item: MerchItem) => void;
  onToggleActive: (item: MerchItem) => void;
};

const stockSummary = (item: MerchItem) => {
  if (item.variants.length === 1 && item.variants[0].label === SINGLE_VARIANT_LABEL) {
    const stock = item.variants[0].stock;
    return stock === null ? 'Sin límite' : `${stock} uds.`;
  }
  return item.variants.map(variant => (variant.stock === null ? variant.label : `${variant.label} ${variant.stock}`)).join(' · ');
};

// The seller's products: edit, hide or show, and «Añadir producto».
const MerchItemsList: React.FC<MerchItemsListProps> = ({ items, busy, onAdd, onEdit, onToggleActive }) => (
  <section className="flex flex-col gap-2">
    <h2 className="font-display text-xl font-bold">Productos</h2>
    {items.length === 0 ? (
      <p className="text-sm text-white/60">Añade lo que llevarás al puesto: camisetas, discos, pósters…</p>
    ) : null}
    {items.map(item => (
      <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-2.5">
        <button type="button" onClick={() => onEdit(item)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-white/[0.06]">
            {item.imageUrl ? <img src={item.imageUrl} alt="" className={`h-full w-full object-cover ${item.active ? '' : 'opacity-40'}`} /> : null}
          </span>
          <span className="min-w-0">
            <span className={`block truncate font-semibold ${item.active ? 'text-app-ink' : 'text-white/45'}`}>
              {item.name}
              {item.active ? '' : ' · oculto'}
            </span>
            <span className="block truncate text-xs text-white/55">
              {formatEuros(item.priceCents)} · {stockSummary(item)}
            </span>
          </span>
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onToggleActive(item)}
          className="min-h-11 shrink-0 px-2 text-sm font-semibold text-white/60"
        >
          {item.active ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
    ))}
    <Button size="lg" onClick={onAdd}>
      + Añadir producto
    </Button>
  </section>
);

export default MerchItemsList;

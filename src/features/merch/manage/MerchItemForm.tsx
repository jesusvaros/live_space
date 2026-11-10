import React, { useEffect, useRef, useState } from 'react';
import Button from '../../../components/ui/Button';
import { IconCamera } from '../../../components/icons';
import { addSize, draftToItem, ItemDraft, removeSize, SIZE_PRESETS } from '../merchRules';
import { fieldClass, labelClass } from './fields';

export type SavedItem = {
  id: string | null;
  name: string;
  priceCents: number;
  imageUrl: string;
  variants: { label: string; stock: number | null }[];
};

type MerchItemFormProps = {
  initial: ItemDraft;
  /** Compresses and uploads a photo; resolves to its https URL. */
  uploadPhoto: (file: File) => Promise<string>;
  onSave: (item: SavedItem) => Promise<void>;
  onCancel: () => void;
};

// «Añadir producto»: photo, name, price, units, and sizes only if it has them.
const MerchItemForm: React.FC<MerchItemFormProps> = ({ initial, uploadPhoto, onSave, onCancel }) => {
  const [draft, setDraft] = useState<ItemDraft>(initial);
  const [customSize, setCustomSize] = useState('');
  const [preview, setPreview] = useState<string>(initial.imageUrl);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement | null>(null);

  useEffect(() => () => {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview);
  }, [preview]);

  const set = (patch: Partial<ItemDraft>) => setDraft(current => ({ ...current, ...patch }));

  const pickPhoto = async (file: File | undefined) => {
    if (!file) return;
    setError('');
    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const url = await uploadPhoto(file);
      set({ imageUrl: url });
    } catch (err: any) {
      setPreview(draft.imageUrl);
      setError(err?.message || 'No se ha podido subir la foto.');
    } finally {
      setUploading(false);
    }
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = draftToItem(draft);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSave({ id: draft.id, name: result.name, priceCents: result.priceCents, imageUrl: draft.imageUrl, variants: result.variants });
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar.');
      setSaving(false);
    }
  };

  const toggleSize = (label: string) =>
    set({ sizes: draft.sizes.some(size => size.label === label) ? removeSize(draft.sizes, label) : addSize(draft.sizes, label) });

  const presetOrder = (label: string) => {
    const index = (SIZE_PRESETS as readonly string[]).indexOf(label);
    return index === -1 ? SIZE_PRESETS.length : index;
  };
  const orderedSizes = [...draft.sizes].sort((left, right) => presetOrder(left.label) - presetOrder(right.label));

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" aria-label={draft.id ? 'Editar producto' : 'Añadir producto'}>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-dashed border-white/25 bg-app-surface"
          aria-label={preview ? 'Cambiar foto' : 'Añadir foto'}
        >
          {preview ? (
            <img src={preview} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-white/60">
              <IconCamera size={26} />
              <span className="text-[12px] font-semibold">Añadir foto</span>
            </span>
          )}
          {uploading ? (
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-[12px] font-semibold text-white">Subiendo…</span>
          ) : null}
        </button>
        <div className="min-w-0 text-[13px] text-white/60">
          <p className="font-semibold text-app-ink">{preview ? 'Foto lista' : 'Una foto vende más'}</p>
          <p>Hazla con luz y fondo liso. La reducimos para que cargue rápido.</p>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={event => {
            void pickPhoto(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Nombre</span>
        <input className={fieldClass} placeholder="Camiseta gira 2026" maxLength={80} value={draft.name} onChange={e => set({ name: e.target.value })} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Precio</span>
          <div className="relative">
            <input
              className={`${fieldClass} pr-9`}
              inputMode="decimal"
              placeholder="25"
              value={draft.price}
              onChange={e => set({ price: e.target.value })}
            />
            <span className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-white/50">€</span>
          </div>
        </label>
        {!draft.hasSizes ? (
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Unidades</span>
            <input
              className={fieldClass}
              inputMode="numeric"
              placeholder="Sin límite"
              value={draft.units}
              onChange={e => set({ units: e.target.value.replace(/\D/g, '') })}
            />
          </label>
        ) : null}
      </div>

      <label className="flex min-h-12 items-center justify-between gap-3 rounded-xl border border-app-line bg-app-surface px-3.5">
        <span className="text-[15px] font-semibold text-app-ink">¿Tiene tallas?</span>
        <input
          type="checkbox"
          role="switch"
          checked={draft.hasSizes}
          onChange={e => set({ hasSizes: e.target.checked })}
          className="h-6 w-11 cursor-pointer appearance-none rounded-full bg-white/20 transition before:block before:h-5 before:w-5 before:translate-x-0.5 before:rounded-full before:bg-white before:transition checked:bg-app-accent checked:before:translate-x-[22px]"
        />
      </label>

      {draft.hasSizes ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tallas">
            {SIZE_PRESETS.map(label => {
              const on = draft.sizes.some(size => size.label === label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSize(label)}
                  className={`min-h-11 min-w-12 rounded-full border px-3 text-[14px] font-bold ${
                    on ? 'border-app-accent bg-app-accent text-[#14151a]' : 'border-app-line text-app-ink'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2">
            <input
              className={fieldClass}
              placeholder="Otra talla (p. ej. Niño 8 años)"
              maxLength={20}
              value={customSize}
              onChange={e => setCustomSize(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  set({ sizes: addSize(draft.sizes, customSize) });
                  setCustomSize('');
                }
              }}
            />
            <Button
              variant="secondary"
              disabled={!customSize.trim()}
              onClick={() => {
                set({ sizes: addSize(draft.sizes, customSize) });
                setCustomSize('');
              }}
            >
              Añadir
            </Button>
          </div>
          {orderedSizes.length ? (
            <ul className="flex flex-col divide-y divide-app-line rounded-xl border border-app-line bg-app-surface">
              {orderedSizes.map(size => (
                <li key={size.label} className="flex items-center gap-3 px-3.5 py-2">
                  <span className="min-w-12 font-bold text-app-ink">{size.label}</span>
                  <input
                    className={`${fieldClass} min-h-11 flex-1`}
                    inputMode="numeric"
                    placeholder="Sin límite"
                    aria-label={`Unidades de la talla ${size.label}`}
                    value={size.units}
                    onChange={e =>
                      set({
                        sizes: draft.sizes.map(other =>
                          other.label === size.label ? { ...other, units: e.target.value.replace(/\D/g, '') } : other,
                        ),
                      })
                    }
                  />
                  <button
                    type="button"
                    aria-label={`Quitar la talla ${size.label}`}
                    onClick={() => set({ sizes: removeSize(draft.sizes, size.label) })}
                    className="flex h-11 w-11 items-center justify-center rounded-full text-white/55"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <p className="text-[12px] text-white/50">Unidades vacías = sin límite. Cuenta solo lo que llevarás al puesto.</p>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <div className="flex gap-2">
        <Button type="submit" size="lg" disabled={saving || uploading} className="flex-1">
          {saving ? 'Guardando…' : draft.id ? 'Guardar cambios' : 'Añadir producto'}
        </Button>
        <Button type="button" size="lg" variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  );
};

export default MerchItemForm;

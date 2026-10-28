import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconChevronLeft } from '../components/icons';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { eventManagementService, ManagedEvent } from '../services/eventManagement.service';
import { formatEuros, MERCH_STATUS_LABELS, MerchItem, MerchOrder, merchService } from '../services/merch.service';
import { canGoBack } from '../app/useGoBack';

const fieldClass =
  'min-h-12 w-full rounded-xl border border-app-line bg-app-surface px-3.5 text-[15px] text-app-ink placeholder:text-white/35 focus:border-app-accent focus:outline-none';

type VariantDraft = { label: string; stock: string };
type ItemDraft = { id: string | null; name: string; price: string; description: string; imageUrl: string; variants: VariantDraft[] };

const emptyDraft = (): ItemDraft => ({
  id: null,
  name: '',
  price: '',
  description: '',
  imageUrl: '',
  variants: [{ label: 'Única', stock: '' }],
});

const toCents = (value: string) => Math.round(Number(value.replace(',', '.')) * 100);

const concertLabel = (event: ManagedEvent) =>
  `${new Date(event.starts_at).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })} · ${
    event.venue_name || event.city
  }`;

// Merch for the active artist or venue: payouts, catalogue, the concerts it
// sells at (with their pickup point) and handing orders over at the stand.
const MerchManage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const entity = activeWorkspace && activeWorkspace.type !== 'user' ? activeWorkspace : null;
  const subjectId = entity?.subject_id ?? null;
  const entityType = entity?.type === 'venue' ? 'venue' : 'artist';
  const entityId = entity ? (entity.type === 'venue' ? entity.venue?.id : entity.artist?.id) : null;

  const [status, setStatus] = useState<{ started: boolean; chargesEnabled: boolean } | null>(null);
  const [statusError, setStatusError] = useState('');
  const [items, setItems] = useState<MerchItem[]>([]);
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [stands, setStands] = useState<Map<string, string>>(new Map());
  const [pickupDrafts, setPickupDrafts] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [openEvent, setOpenEvent] = useState<string | null>(null);
  const [orders, setOrders] = useState<MerchOrder[]>([]);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!subjectId || !entityId) return;
    setLoading(true);
    setError('');
    try {
      const [nextItems, nextEvents, nextStands] = await Promise.all([
        merchService.listItems(subjectId),
        eventManagementService.listEvents(entityType, entityId),
        merchService.standsForSeller(subjectId),
      ]);
      setItems(nextItems);
      setEvents(nextEvents.filter(event => Date.parse(event.starts_at) > Date.now() - 3 * 60 * 60 * 1000));
      setStands(nextStands);
    } catch (err: any) {
      setError(err?.message || 'No se ha podido cargar el merch.');
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!subjectId) return;
    merchService
      .sellerStatus(subjectId)
      .then(setStatus)
      .catch(() => setStatusError('Solo el propietario o un administrador del perfil configura los cobros.'));
  }, [subjectId]);

  const upcoming = useMemo(() => events.filter(event => event.status === 'published'), [events]);

  const run = async (task: () => Promise<void>, done?: string) => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await task();
      if (done) setMessage(done);
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const saveItem = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !subjectId) return;
    const priceCents = toCents(draft.price);
    if (!draft.name.trim() || !Number.isFinite(priceCents) || priceCents < 100) {
      setError('Pon nombre y un precio de al menos 1 €.');
      return;
    }
    if (draft.imageUrl.trim() && !/^https:\/\//i.test(draft.imageUrl.trim())) {
      setError('La imagen tiene que ser un enlace https.');
      return;
    }
    void run(async () => {
      await merchService.saveItem({
        id: draft.id,
        sellerSubjectId: subjectId,
        name: draft.name,
        description: draft.description,
        imageUrl: draft.imageUrl,
        priceCents,
        variants: draft.variants.map(variant => ({
          label: variant.label,
          stock: variant.stock.trim() === '' ? null : Math.max(0, Math.floor(Number(variant.stock))),
        })),
      });
      setDraft(null);
      setItems(await merchService.listItems(subjectId));
    }, 'Producto guardado.');
  };

  const editItem = (item: MerchItem) =>
    setDraft({
      id: item.id,
      name: item.name,
      price: String(item.priceCents / 100).replace('.', ','),
      description: item.description || '',
      imageUrl: item.imageUrl || '',
      variants: item.variants.map(variant => ({ label: variant.label, stock: variant.stock === null ? '' : String(variant.stock) })),
    });

  const toggleStand = (event: ManagedEvent) => {
    if (!subjectId) return;
    const selling = stands.has(event.id);
    void run(async () => {
      if (selling) await merchService.closeStand(event.id, subjectId);
      else await merchService.openStand(event.id, subjectId, pickupDrafts[event.id] || 'Puesto de merch');
      setStands(await merchService.standsForSeller(subjectId));
    });
  };

  const savePickup = (event: ManagedEvent) => {
    if (!subjectId) return;
    void run(async () => {
      await merchService.openStand(event.id, subjectId, pickupDrafts[event.id] ?? stands.get(event.id) ?? '');
      setStands(await merchService.standsForSeller(subjectId));
    }, 'Punto de recogida guardado.');
  };

  const showOrders = (eventId: string) => {
    if (!subjectId) return;
    if (openEvent === eventId) {
      setOpenEvent(null);
      return;
    }
    setOpenEvent(eventId);
    setOrders([]);
    void run(async () => setOrders(await merchService.ordersForStand(eventId, subjectId)));
  };

  const collect = (eventId: string, value: string) => {
    if (!subjectId || !value.trim()) return;
    void run(async () => {
      await merchService.collect(eventId, value);
      setCode('');
      setOrders(await merchService.ordersForStand(eventId, subjectId));
    }, 'Entregado.');
  };

  if (!entity || !subjectId) {
    return (
      <div className="min-h-screen bg-app-bg p-4 pt-[calc(16px+env(safe-area-inset-top,0px))] text-app-ink">
        <p className="text-sm text-white/60">Elige primero el artista o la sala que gestionas.</p>
        <Button className="mt-4" onClick={() => (canGoBack() ? navigate(-1) : navigate('/gestion', { replace: true }))}>
          Ir a gestión
        </Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-app-bg pb-[calc(32px+env(safe-area-inset-bottom,0px))] text-app-ink">
      <header className="flex items-center gap-3 px-3 pb-2 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={() => (canGoBack() ? navigate(-1) : navigate('/gestion', { replace: true }))}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface"
        >
          <IconChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">Merch</p>
          <h1 className="truncate font-display text-lg font-bold">
            {entity.type === 'venue' ? entity.venue?.name : entity.artist?.name}
          </h1>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4">
        {message ? <p className="text-sm text-[#25d47b]">{message}</p> : null}
        {error ? <p className="text-sm text-rose-400">{error}</p> : null}

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">Cobros</h2>
          {statusError ? (
            <p className="text-sm text-white/60">{statusError}</p>
          ) : !status ? (
            <Spinner />
          ) : status.chargesEnabled ? (
            <p className="text-sm text-white/70">Listo: los pagos llegan a tu cuenta de Stripe, menos la comisión de Live Space.</p>
          ) : (
            <>
              <p className="text-sm text-white/70">
                Para vender necesitas una cuenta de cobros. Se crea con Stripe en unos minutos: datos fiscales y una cuenta bancaria.
              </p>
              <Button disabled={busy} onClick={() => run(() => merchService.startOnboarding(subjectId))}>
                {status.started ? 'Completar datos de cobro' : 'Configurar cobros'}
              </Button>
              {status.started ? (
                <button
                  type="button"
                  onClick={() => merchService.sellerStatus(subjectId).then(setStatus).catch(() => undefined)}
                  className="self-start text-sm font-semibold text-app-accent"
                >
                  Ya he terminado, comprobar
                </button>
              ) : null}
            </>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">Productos</h2>
          {loading ? <Spinner /> : null}
          {items.map(item => (
            <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-app-line bg-app-surface p-3">
              {item.imageUrl ? <img src={item.imageUrl} alt="" className="h-12 w-12 rounded-lg object-cover" /> : null}
              <div className="min-w-0 flex-1">
                <p className={`truncate font-semibold ${item.active ? '' : 'text-white/45'}`}>{item.name}</p>
                <p className="truncate text-xs text-white/55">
                  {formatEuros(item.priceCents)} ·{' '}
                  {item.variants.map(variant => `${variant.label}${variant.stock === null ? '' : ` (${variant.stock})`}`).join(', ')}
                </p>
              </div>
              <button type="button" onClick={() => editItem(item)} className="min-h-11 px-2 text-sm font-semibold">
                Editar
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await merchService.setItemActive(item.id, !item.active);
                    setItems(await merchService.listItems(subjectId));
                  })
                }
                className="min-h-11 px-2 text-sm font-semibold text-white/60"
              >
                {item.active ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
          ))}

          {draft ? (
            <form onSubmit={saveItem} className="flex flex-col gap-2.5 rounded-2xl border border-app-accent bg-app-surface p-3">
              <input className={fieldClass} placeholder="Nombre (Camiseta gira 2026)" value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <input className={fieldClass} inputMode="decimal" placeholder="Precio en €" value={draft.price} onChange={e => setDraft({ ...draft, price: e.target.value })} />
              <input className={fieldClass} placeholder="Foto (enlace https, opcional)" value={draft.imageUrl} onChange={e => setDraft({ ...draft, imageUrl: e.target.value })} />
              <textarea
                className={`${fieldClass} min-h-20 py-3`}
                placeholder="Descripción corta (opcional)"
                value={draft.description}
                onChange={e => setDraft({ ...draft, description: e.target.value })}
              />
              <p className="text-sm font-semibold">Tallas o modelos</p>
              {draft.variants.map((variant, index) => (
                <div key={index} className="grid grid-cols-[1fr_110px_44px] gap-2">
                  <input
                    className={fieldClass}
                    placeholder="Talla"
                    value={variant.label}
                    onChange={e => {
                      const variants = [...draft.variants];
                      variants[index] = { ...variant, label: e.target.value };
                      setDraft({ ...draft, variants });
                    }}
                  />
                  <input
                    className={fieldClass}
                    inputMode="numeric"
                    placeholder="Unidades"
                    aria-label="Unidades (vacío = sin límite)"
                    value={variant.stock}
                    onChange={e => {
                      const variants = [...draft.variants];
                      variants[index] = { ...variant, stock: e.target.value.replace(/\D/g, '') };
                      setDraft({ ...draft, variants });
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Quitar talla"
                    disabled={draft.variants.length === 1}
                    onClick={() => setDraft({ ...draft, variants: draft.variants.filter((_, position) => position !== index) })}
                    className="min-h-12 rounded-xl text-white/60 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setDraft({ ...draft, variants: [...draft.variants, { label: '', stock: '' }] })}
                className="self-start text-sm font-semibold text-app-accent"
              >
                + Añadir talla
              </button>
              <p className="text-xs text-white/50">Unidades vacías = sin límite. Cuenta solo lo que llevarás al concierto.</p>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} className="flex-1">
                  Guardar
                </Button>
                <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <Button variant="secondary" onClick={() => setDraft(emptyDraft())}>
              + Añadir producto
            </Button>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="font-display text-xl font-bold">Conciertos</h2>
          <p className="text-sm text-white/60">Activa el merch en cada concierto y di dónde se recoge.</p>
          {!loading && upcoming.length === 0 ? <p className="text-sm text-white/55">No hay conciertos próximos.</p> : null}
          {upcoming.map(event => {
            const selling = stands.has(event.id);
            return (
              <div key={event.id} className="flex flex-col gap-2 rounded-2xl border border-app-line bg-app-surface p-3">
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{event.headliner?.name || event.name}</p>
                    <p className="truncate text-xs capitalize text-white/55">{concertLabel(event)}</p>
                  </div>
                  <label className="flex min-h-11 items-center gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={selling} disabled={busy} onChange={() => toggleStand(event)} className="h-5 w-5 accent-[#ff5b2e]" />
                    Vender
                  </label>
                </div>
                {selling ? (
                  <>
                    <div className="flex gap-2">
                      <input
                        className={fieldClass}
                        placeholder="Punto de recogida"
                        value={pickupDrafts[event.id] ?? stands.get(event.id) ?? ''}
                        onChange={e => setPickupDrafts({ ...pickupDrafts, [event.id]: e.target.value })}
                      />
                      <Button variant="secondary" disabled={busy} onClick={() => savePickup(event)}>
                        Guardar
                      </Button>
                    </div>
                    <button type="button" onClick={() => showOrders(event.id)} className="self-start text-sm font-semibold text-app-accent">
                      {openEvent === event.id ? 'Ocultar pedidos' : 'Pedidos y entrega'}
                    </button>
                  </>
                ) : null}
                {openEvent === event.id ? (
                  <div className="flex flex-col gap-2">
                    <form
                      onSubmit={e => {
                        e.preventDefault();
                        collect(event.id, code);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        className={`${fieldClass} font-mono uppercase tracking-[0.2em]`}
                        placeholder="Código"
                        maxLength={6}
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase())}
                      />
                      <Button type="submit" disabled={busy || code.length !== 6}>
                        Entregar
                      </Button>
                    </form>
                    {orders.length === 0 ? <p className="text-sm text-white/55">Sin pedidos pagados todavía.</p> : null}
                    {orders.map(order => (
                      <div key={order.id} className="flex items-center gap-3 border-t border-app-line pt-2">
                        <span className="font-mono text-sm font-bold tracking-[0.15em]">{order.pickupCode}</span>
                        <span className="min-w-0 flex-1 truncate text-sm text-white/70">
                          {order.lines.map(line => `${line.quantity} × ${line.itemName} ${line.variantLabel}`).join(', ')}
                        </span>
                        {order.status === 'paid' ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => collect(event.id, order.pickupCode)}
                            className="min-h-11 px-2 text-sm font-semibold text-app-accent"
                          >
                            Entregar
                          </button>
                        ) : (
                          <span className="text-xs text-white/50">{MERCH_STATUS_LABELS[order.status]}</span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
};

export default MerchManage;

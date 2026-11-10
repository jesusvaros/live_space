import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/ui/Button';
import { Spinner } from '../components/ui/AppPrimitives';
import { IconChevronLeft } from '../components/icons';
import { useWorkspace } from '../contexts/WorkspaceContext';
import { eventManagementService, ManagedEvent } from '../services/eventManagement.service';
import { MerchItem, merchService, MerchStandSettings } from '../services/merch.service';
import { canGoBack } from '../app/useGoBack';
import { emptyItemDraft, ItemDraft, itemToDraft, paymentLabel, RESERVATIONS_CLOSE_AFTER_MS } from '../features/merch/merchRules';
import MerchItemForm, { SavedItem } from '../features/merch/manage/MerchItemForm';
import MerchItemsList from '../features/merch/manage/MerchItemsList';
import MerchStandEditor from '../features/merch/manage/MerchStandEditor';
import MerchStandOrders from '../features/merch/manage/MerchStandOrders';
import MerchPayouts from '../features/merch/manage/MerchPayouts';
import { concertDateLabel } from '../features/merch/manage/fields';

type View = { kind: 'home' } | { kind: 'item'; draft: ItemDraft } | { kind: 'stand'; event: ManagedEvent };

// Merch for the active artist or venue: products, the concerts it sells at
// (pickup point and how people pay) and handing orders over at the stand.
const MerchManage: React.FC = () => {
  const navigate = useNavigate();
  const { activeWorkspace } = useWorkspace();
  const entity = activeWorkspace && activeWorkspace.type !== 'user' ? activeWorkspace : null;
  const subjectId = entity?.subject_id ?? null;
  const entityType = entity?.type === 'venue' ? 'venue' : 'artist';
  const entityId = entity ? (entity.type === 'venue' ? entity.venue?.id : entity.artist?.id) : null;

  const [view, setView] = useState<View>({ kind: 'home' });
  const [items, setItems] = useState<MerchItem[]>([]);
  const [events, setEvents] = useState<ManagedEvent[]>([]);
  const [stands, setStands] = useState<Map<string, MerchStandSettings>>(new Map());
  const [chargesEnabled, setChargesEnabled] = useState(false);
  const [atStandAvailable, setAtStandAvailable] = useState(false);
  const [openOrders, setOpenOrders] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!subjectId || !entityId) return;
    setLoading(true);
    setError('');
    try {
      const [nextItems, nextEvents, nextStands, charges, atStand] = await Promise.all([
        merchService.listItems(subjectId),
        eventManagementService.listEvents(entityType, entityId),
        merchService.standsForSeller(subjectId),
        merchService.chargesEnabled(subjectId),
        merchService.atStandAvailable(),
      ]);
      setItems(nextItems);
      setEvents(nextEvents.filter(event => Date.parse(event.starts_at) > Date.now() - RESERVATIONS_CLOSE_AFTER_MS));
      setStands(nextStands);
      setChargesEnabled(charges);
      setAtStandAvailable(atStand);
    } catch (err: any) {
      setError(err?.message || 'No se ha podido cargar el merch.');
    } finally {
      setLoading(false);
    }
  }, [entityId, entityType, subjectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const upcoming = useMemo(() => events.filter(event => event.status === 'published'), [events]);
  const onChargesEnabled = useCallback(() => setChargesEnabled(true), []);
  const back = () => (canGoBack() ? navigate(-1) : navigate('/gestion', { replace: true }));
  const home = (done?: string) => {
    setView({ kind: 'home' });
    setMessage(done || '');
    setError('');
  };

  if (!entity || !subjectId) {
    return (
      <div className="min-h-screen bg-app-bg p-4 pt-[calc(16px+env(safe-area-inset-top,0px))] text-app-ink">
        <p className="text-sm text-white/60">Elige primero el artista o la sala que gestionas.</p>
        <Button className="mt-4" onClick={back}>
          Ir a gestión
        </Button>
      </div>
    );
  }

  const saveItem = async (item: SavedItem) => {
    await merchService.saveItem({ ...item, sellerSubjectId: subjectId });
    setItems(await merchService.listItems(subjectId));
    home(item.id ? 'Producto guardado.' : 'Producto añadido. Actívalo en un concierto para venderlo.');
  };

  const toggleActive = async (item: MerchItem) => {
    setBusy(true);
    setError('');
    try {
      await merchService.setItemActive(item.id, !item.active);
      setItems(await merchService.listItems(subjectId));
    } catch (err: any) {
      setError(err?.message || 'No se ha podido guardar.');
    } finally {
      setBusy(false);
    }
  };

  const saveStand = (event: ManagedEvent) => async (settings: MerchStandSettings) => {
    await merchService.openStand(event.id, subjectId, settings);
    setStands(await merchService.standsForSeller(subjectId));
    home(`Merch activado: ${paymentLabel(settings.paymentMethod).toLowerCase()}.`);
  };

  const stopStand = (event: ManagedEvent) => async () => {
    await merchService.closeStand(event.id, subjectId);
    setStands(await merchService.standsForSeller(subjectId));
    home('Ya no vendes merch en ese concierto.');
  };

  const title = view.kind === 'item' ? (view.draft.id ? 'Editar producto' : 'Añadir producto') : view.kind === 'stand' ? 'Merch en el concierto' : 'Merch';

  return (
    <div className="min-h-screen bg-app-bg pb-[calc(32px+env(safe-area-inset-bottom,0px))] text-app-ink">
      <header className="flex items-center gap-3 px-3 pb-2 pt-[calc(10px+env(safe-area-inset-top,0px))]">
        <button
          type="button"
          onClick={() => (view.kind === 'home' ? back() : home())}
          aria-label="Volver"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-app-line bg-app-surface"
        >
          <IconChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <p className="font-mono text-[11px] font-semibold uppercase text-[#8f8b84]">
            {entity.type === 'venue' ? entity.venue?.name : entity.artist?.name}
          </p>
          <h1 className="truncate font-display text-lg font-bold">{title}</h1>
        </div>
      </header>

      <div className="flex flex-col gap-6 px-4 pt-2">
        {view.kind === 'item' ? (
          <MerchItemForm
            initial={view.draft}
            uploadPhoto={file => merchService.uploadPhoto(subjectId, file)}
            onSave={saveItem}
            onCancel={() => home()}
          />
        ) : view.kind === 'stand' ? (
          <MerchStandEditor
            event={view.event}
            current={stands.get(view.event.id) ?? null}
            chargesEnabled={chargesEnabled}
            atStandAvailable={atStandAvailable}
            onSave={saveStand(view.event)}
            onStop={stopStand(view.event)}
            onClose={() => home()}
          />
        ) : (
          <>
            {message ? <p className="text-sm text-[#25d47b]">{message}</p> : null}
            {error ? <p className="text-sm text-rose-400">{error}</p> : null}
            {loading ? <Spinner /> : null}

            <MerchItemsList
              items={items}
              busy={busy}
              onAdd={() => setView({ kind: 'item', draft: emptyItemDraft() })}
              onEdit={item => setView({ kind: 'item', draft: itemToDraft(item) })}
              onToggleActive={item => void toggleActive(item)}
            />

            <section className="flex flex-col gap-2">
              <h2 className="font-display text-xl font-bold">Conciertos</h2>
              <p className="text-sm text-white/60">Activa el merch en cada concierto. Solo lo reserva quien va, y lo recoge allí.</p>
              {!loading && upcoming.length === 0 ? <p className="text-sm text-white/55">No hay conciertos próximos.</p> : null}
              {upcoming.map(event => {
                const stand = stands.get(event.id);
                return (
                  <div key={event.id} className="flex flex-col gap-2 rounded-2xl border border-app-line bg-app-surface p-3">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{event.headliner?.name || event.name}</p>
                        <p className="truncate text-xs capitalize text-white/55">
                          {[concertDateLabel(event.starts_at), event.venue_name || event.city].filter(Boolean).join(' · ')}
                        </p>
                        {stand ? (
                          <p className="truncate text-xs text-[#25d47b]">
                            Vendiendo · {paymentLabel(stand.paymentMethod)} · {stand.pickupPoint}
                          </p>
                        ) : null}
                      </div>
                      <Button size="sm" variant={stand ? 'secondary' : 'primary'} onClick={() => setView({ kind: 'stand', event })}>
                        {stand ? 'Editar' : 'Vender'}
                      </Button>
                    </div>
                    {stand ? (
                      <button
                        type="button"
                        onClick={() => setOpenOrders(openOrders === event.id ? null : event.id)}
                        className="min-h-11 self-start text-sm font-semibold text-app-accent"
                      >
                        {openOrders === event.id ? 'Ocultar pedidos' : 'Pedidos y entrega'}
                      </button>
                    ) : null}
                    {openOrders === event.id ? <MerchStandOrders eventId={event.id} subjectId={subjectId} /> : null}
                  </div>
                );
              })}
            </section>

            <MerchPayouts subjectId={subjectId} chargesEnabled={chargesEnabled} onChargesEnabled={onChargesEnabled} />
          </>
        )}
      </div>
    </div>
  );
};

export default MerchManage;

import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import CoverImage from '../../components/ui/CoverImage';
import GeneratedPoster from '../../components/ui/GeneratedPoster';
import { IconChevronRight, IconTicket } from '../../components/icons';
import { fetchEventCards } from '../../data/eventQueries';
import { PERSIST_MAX_AGE } from '../../lib/persistentCache';
import { formatEuros, merchService, orderStatusLabel, type MerchOrder } from '../../services/merch.service';
import { useQuery } from '../../shared/hooks/useQuery';
import { getEventCoverSources, getPrimaryArtistName } from '../events/utils';
import type { EventListItem } from '../events/types';
import { isOrderToCollect, RESERVATIONS_CLOSE_AFTER_MS } from '../merch/merchRules';
import { concertDateLabel } from './profileLayout';

// How far ahead the «merch near you» carousel looks, and how many it shows.
const NEARBY_WINDOW_DAYS = 60;
const NEARBY_MAX = 8;

type ProfileMerchSectionProps = {
  userId: string;
  /** The user's area: the city picked on Inicio, else the profile's. */
  city: string | null;
  /** Upcoming concerts the user is going to: their merch comes first. */
  goingEventIds: string[];
};

type NearbyMerch = { events: EventListItem[] };

const EMPTY_ORDERS: MerchOrder[] = [];

const SectionTitle: React.FC<{ children: React.ReactNode; action?: React.ReactNode }> = ({ children, action }) => (
  <div className="flex items-center justify-between px-4">
    <h2 id="perfil-merch" className="font-display text-lg font-bold text-app-ink">{children}</h2>
    {action}
  </div>
);

// «Merch» on the profile. With orders: what is waiting at the stand and a way
// to all of them. Without: the upcoming concerts nearby (or that the user is
// going to) where merch can be reserved and picked up. Never an empty box.
const ProfileMerchSection: React.FC<ProfileMerchSectionProps> = ({ userId, city, goingEventIds }) => {
  const navigate = useNavigate();
  const goingKey = [...goingEventIds].sort().join(',');

  const { data: orders, loading: ordersLoading } = useQuery<MerchOrder[]>(
    ['profile:merch-orders', userId],
    () => merchService.myOrders(),
    { ttlMs: 60_000, initialData: EMPTY_ORDERS, persist: { maxAgeMs: PERSIST_MAX_AGE.user, userId, key: 'profile:merch-orders' } },
  );
  const { data: nearby } = useQuery<NearbyMerch>(
    ['profile:merch-nearby', userId, city ?? '', goingKey],
    async () => {
      // Reservations stay open until three hours after doors.
      const fromIso = new Date(Date.now() - RESERVATIONS_CLOSE_AFTER_MS).toISOString();
      const toIso = new Date(Date.now() + NEARBY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const ids = await merchService.upcomingEventIdsWithMerch({ fromIso, city, eventIds: goingKey ? goingKey.split(',') : [] });
      if (ids.length === 0) return { events: [] };
      const going = new Set(goingKey.split(','));
      const events = (await fetchEventCards({ eventIds: ids, startIso: fromIso, endIso: toIso }))
        // Going first, then soonest (the query already sorts by date).
        .sort((left, right) => Number(going.has(right.id)) - Number(going.has(left.id)));
      return { events: events.slice(0, NEARBY_MAX) };
    },
    { ttlMs: 5 * 60_000, persist: { maxAgeMs: PERSIST_MAX_AGE.user, userId, key: 'profile:merch-nearby' } },
  );

  const allOrders = orders || EMPTY_ORDERS;
  const toCollect = useMemo(() => allOrders.filter(order => isOrderToCollect(order)), [allOrders]);
  const nearbyEvents = nearby?.events ?? [];
  const going = useMemo(() => new Set(goingEventIds), [goingEventIds]);

  // Nothing to say yet: no flash of an empty state while the orders load.
  if (ordersLoading && allOrders.length === 0 && !nearby) return null;

  const ordersLink =
    allOrders.length > 0 ? (
      <button
        type="button"
        onClick={() => navigate('/pedidos')}
        className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-app-accent"
      >
        Mis pedidos · {allOrders.length}
        <IconChevronRight size={16} />
      </button>
    ) : null;

  return (
    <section aria-labelledby="perfil-merch" className="mt-7 flex flex-col gap-3">
      <SectionTitle action={ordersLink}>Merch</SectionTitle>

      {toCollect.length > 0 ? (
        <div className="flex flex-col gap-2 px-4">
          {toCollect.map(order => (
            <button
              key={order.id}
              type="button"
              onClick={() => navigate(`/pedidos/${order.id}`)}
              className="flex items-center gap-3 rounded-2xl border border-app-accent/40 bg-app-surface p-3 text-left"
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-app-accent/15 text-app-accent">
                <IconTicket size={22} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                  Por recoger · {order.pickupCode}
                </span>
                <span className="block truncate font-display text-[15px] font-bold text-app-ink">{order.event?.name || 'Concierto'}</span>
                <span className="block truncate text-[12px] text-white/60">
                  {[orderStatusLabel(order), formatEuros(order.totalCents), order.pickupPoint].filter(Boolean).join(' · ')}
                </span>
              </span>
              <IconChevronRight size={18} className="shrink-0 text-white/50" />
            </button>
          ))}
        </div>
      ) : null}

      {toCollect.length === 0 && nearbyEvents.length > 0 ? (
        <>
          <p className="px-4 text-[13px] text-white/60">
            Resérvalo en la app y recógelo en el concierto. Solo para quien va.
          </p>
          <div className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {nearbyEvents.map(event => {
              const title = getPrimaryArtistName(event);
              return (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => navigate(`/event/${event.id}`)}
                  className="w-[132px] shrink-0 text-left"
                >
                  <span className="relative block aspect-[4/5] overflow-hidden rounded-2xl bg-app-surface ring-1 ring-white/5">
                    <CoverImage
                      sources={getEventCoverSources(event, 'thumb')}
                      className="absolute inset-0 h-full w-full object-cover"
                      fallback={<GeneratedPoster title={title} variant="thumb" />}
                    />
                    <span className="absolute left-2 top-2 rounded-full bg-app-accent px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-[#14151a]">
                      {going.has(event.id) ? 'Vas · merch' : 'Merch'}
                    </span>
                  </span>
                  <span className="mt-1.5 block font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-app-accent">
                    {concertDateLabel(event.starts_at)}
                  </span>
                  <span className="block truncate font-display text-[14px] font-bold text-app-ink">{title}</span>
                  <span className="block truncate text-[12px] text-white/55">{event.venue_place?.name || event.city}</span>
                </button>
              );
            })}
          </div>
        </>
      ) : null}

      {toCollect.length === 0 && nearbyEvents.length === 0 ? (
        <p className="px-4 text-[13px] text-white/60">
          {city
            ? `Ahora mismo no hay merch para recoger en conciertos de ${city}. Cuando lo haya, lo verás aquí.`
            : 'Cuando un concierto de tu ciudad venda merch, lo verás aquí para reservarlo y recogerlo allí.'}
        </p>
      ) : null}
    </section>
  );
};

export default ProfileMerchSection;

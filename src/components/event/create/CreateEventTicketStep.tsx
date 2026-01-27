import React from 'react';

export type PriceTier = { label: string; price: number };

type CreateEventTicketStepProps = {
  eventName: string;
  eventStart: string;
  eventUrl: string;
  isFree: boolean;
  tierLabel: string;
  tierPrice: string;
  priceTiers: PriceTier[];
  onEventNameChange: (value: string) => void;
  onEventStartChange: (value: string) => void;
  onEventUrlChange: (value: string) => void;
  onToggleFree: (value: boolean) => void;
  onTierLabelChange: (value: string) => void;
  onTierPriceChange: (value: string) => void;
  onAddTier: () => void;
  onRemoveTier: (index: number) => void;
};

const CreateEventTicketStep: React.FC<CreateEventTicketStepProps> = ({
  eventName,
  eventStart,
  eventUrl,
  isFree,
  tierLabel,
  tierPrice,
  priceTiers,
  onEventNameChange,
  onEventStartChange,
  onEventUrlChange,
  onToggleFree,
  onTierLabelChange,
  onTierPriceChange,
  onAddTier,
  onRemoveTier,
}) => {
  return (
    <section className="space-y-4 rounded-2xl bg-white/5 p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Tickets</p>
        <p className="mt-2 text-sm text-white/70">Essentials only. Everything else can wait.</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
          Event name
        </span>
        <input
          className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
          value={eventName}
          onChange={e => onEventNameChange(e.target.value)}
          placeholder="Night Session"
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Starts at</span>
        <input
          className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
          type="datetime-local"
          value={eventStart}
          onChange={e => onEventStartChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Event link</span>
        <input
          className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
          value={eventUrl}
          onChange={e => onEventUrlChange(e.target.value)}
          placeholder="https://..."
        />
      </label>

      <label className="flex items-center gap-3 text-sm text-white">
        <span className="relative inline-flex items-center">
          <input
            type="checkbox"
            className="peer h-5 w-10 appearance-none rounded-full bg-white/10 transition checked:border-app-accent checked:bg-app-accent"
            checked={isFree}
            onChange={e => onToggleFree(e.target.checked)}
          />
          <span className="pointer-events-none absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition peer-checked:translate-x-5" />
        </span>
        <span className="text-white/80">{isFree ? 'Free event' : 'Paid event'}</span>
      </label>

      {!isFree && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
                Tier name
              </span>
              <input
                className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                value={tierLabel}
                onChange={e => onTierLabelChange(e.target.value)}
                placeholder="Presale"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Price</span>
              <input
                className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
                value={tierPrice}
                onChange={e => onTierPriceChange(e.target.value)}
                placeholder="12"
              />
            </label>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            onClick={onAddTier}
          >
            Add tier
          </button>

          {priceTiers.length > 0 && (
            <div className="space-y-2">
              {priceTiers.map((tier, index) => (
                <div
                  key={`${tier.label}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-white">{tier.label}</p>
                    <p className="text-[10px] text-white/60">${tier.price.toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
                    onClick={() => onRemoveTier(index)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

export default CreateEventTicketStep;

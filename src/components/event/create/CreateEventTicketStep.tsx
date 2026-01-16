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
    <section className="app-card space-y-3 p-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Entrada</p>
        <p className="mt-2 text-sm text-slate-500">Define lo esencial y el tipo de ticket.</p>
      </div>
      <label className="app-field">
        <span className="app-label">Event name</span>
        <input
          className="app-input"
          value={eventName}
          onChange={e => onEventNameChange(e.target.value)}
          placeholder="Night Session"
        />
      </label>
      <label className="app-field">
        <span className="app-label">Starts at</span>
        <input
          className="app-input"
          type="datetime-local"
          value={eventStart}
          onChange={e => onEventStartChange(e.target.value)}
        />
      </label>
      <label className="app-field">
        <span className="app-label">Event link</span>
        <input
          className="app-input"
          value={eventUrl}
          onChange={e => onEventUrlChange(e.target.value)}
          placeholder="https://..."
        />
      </label>

      <label className="app-toggle">
        <input
          type="checkbox"
          checked={isFree}
          onChange={e => onToggleFree(e.target.checked)}
        />
        <span>{isFree ? 'Free event' : 'Paid event'}</span>
      </label>

      {!isFree && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="app-field">
              <span className="app-label">Tier name</span>
              <input
                className="app-input"
                value={tierLabel}
                onChange={e => onTierLabelChange(e.target.value)}
                placeholder="Presale"
              />
            </label>
            <label className="app-field">
              <span className="app-label">Price</span>
              <input
                className="app-input"
                value={tierPrice}
                onChange={e => onTierPriceChange(e.target.value)}
                placeholder="12"
              />
            </label>
          </div>
          <button
            type="button"
            className="app-button app-button--ghost app-button--small"
            onClick={onAddTier}
          >
            Add tier
          </button>

          {priceTiers.length > 0 && (
            <div className="space-y-2">
              {priceTiers.map((tier, index) => (
                <div
                  key={`${tier.label}-${index}`}
                  className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-50">{tier.label}</p>
                    <p className="text-[10px] text-slate-400">${tier.price.toFixed(2)}</p>
                  </div>
                  <button
                    type="button"
                    className="app-button app-button--ghost app-button--small"
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

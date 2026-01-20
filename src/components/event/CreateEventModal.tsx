import React, { useMemo, useState } from 'react';
import { ProfileRole } from '../../lib/types';
import { useCreateEventForm } from '../../hooks/useCreateEventForm';
import CreateEventVenueStep from './create/CreateEventVenueStep';
import CreateEventArtistStep from './create/CreateEventArtistStep';
import CreateEventTicketStep from './create/CreateEventTicketStep';
import CreateEventMoreInfoStep from './create/CreateEventMoreInfoStep';
import { buildPinIcon } from './create/MapHelpers';

type CreateEventModalProps = {
  onDismiss: () => void;
  onCreated?: (eventId: string) => void;
  userId?: string | null;
  profileRole?: ProfileRole | null;
  profileCity?: string | null;
  profileName?: string | null;
};

const steps = ['Sala', 'Artista', 'Entrada', 'Más info'];

const CreateEventModal: React.FC<CreateEventModalProps> = ({
  onDismiss,
  onCreated,
  userId,
  profileRole,
  profileCity,
  profileName,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const organizerAllowed = Boolean(profileRole && ['artist', 'venue', 'label'].includes(profileRole));
  const form = useCreateEventForm({ userId, profileRole, profileCity });
  const newVenueIcon = useMemo(() => buildPinIcon('venue', 'SALA'), []);

  const handleBack = () => setStepIndex(prev => Math.max(prev - 1, 0));
  const handleNext = () => setStepIndex(prev => Math.min(prev + 1, steps.length - 1));

  const handlePrimary = async () => {
    if (stepIndex < steps.length - 1) {
      handleNext();
      return;
    }
    const eventId = await form.handleCreate();
    if (eventId) {
      onCreated?.(eventId);
      onDismiss();
    }
  };

  const toggleVenueMode = () =>
    form.setVenueMode(prev => (prev === 'existing' ? 'new' : 'existing'));

  const content = (() => {
    switch (stepIndex) {
      case 0:
        return (
          <CreateEventVenueStep
            venueMode={form.venueMode}
            onToggleVenueMode={toggleVenueMode}
            venueSearch={form.venueSearch}
            onVenueSearchChange={form.setVenueSearch}
            mapCenter={form.mapCenter}
            venueMarkers={form.venueMarkers}
            newVenueIcon={newVenueIcon}
            visibleVenues={form.visibleVenues}
            venuesLoading={form.venuesLoading}
            selectedVenue={form.selectedVenue}
            onSelectVenue={form.selectVenue}
            onClearVenue={() => form.setSelectedVenue(null)}
            onBoundsChange={form.setMapBounds}
            onMapSelect={form.handleMapSelect}
            venueLat={form.venueLat}
            venueLng={form.venueLng}
            newVenueName={form.newVenueName}
            newVenueCity={form.newVenueCity}
            newVenueAddress={form.newVenueAddress}
            newVenueLat={form.newVenueLat}
            newVenueLng={form.newVenueLng}
            onNewVenueNameChange={form.setNewVenueName}
            onNewVenueCityChange={form.setNewVenueCity}
            onNewVenueAddressChange={form.setNewVenueAddress}
            onNewVenueLatChange={form.setNewVenueLat}
            onNewVenueLngChange={form.setNewVenueLng}
          />
        );
      case 1:
        return (
          <CreateEventArtistStep
            profileRole={profileRole}
            profileName={profileName}
            artists={form.artists}
            selectedArtistId={form.selectedArtistId}
            artistsLoading={form.artistsLoading}
            onSelectArtist={form.setSelectedArtistId}
          />
        );
      case 2:
        return (
          <CreateEventTicketStep
            eventName={form.eventName}
            eventStart={form.eventStart}
            eventUrl={form.eventUrl}
            isFree={form.isFree}
            tierLabel={form.tierLabel}
            tierPrice={form.tierPrice}
            priceTiers={form.priceTiers}
            onEventNameChange={form.setEventName}
            onEventStartChange={form.setEventStart}
            onEventUrlChange={form.setEventUrl}
            onToggleFree={value => {
              form.setIsFree(value);
              form.setError('');
            }}
            onTierLabelChange={form.setTierLabel}
            onTierPriceChange={form.setTierPrice}
            onAddTier={form.addPriceTier}
            onRemoveTier={form.removePriceTier}
          />
        );
      default:
        return (
          <CreateEventMoreInfoStep
            eventEnd={form.eventEnd}
            eventGenres={form.eventGenres}
            eventCoverUrl={form.eventCoverUrl}
            eventDescription={form.eventDescription}
            posterPreview={form.posterPreview}
            posterFile={form.posterFile}
            onEventEndChange={form.setEventEnd}
            onEventGenresChange={form.setEventGenres}
            onEventCoverUrlChange={form.setEventCoverUrl}
            onEventDescriptionChange={form.setEventDescription}
            onPosterFileChange={form.setPosterFile}
            onPosterRemove={() => form.setPosterFile(null)}
          />
        );
    }
  })();

  return (
    <div className="flex flex-col gap-4 rounded-3xl bg-[#141824] px-4 py-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <h2 className="font-display text-lg font-semibold text-slate-50">Create event</h2>
          <div className="relative mt-4">
            <div className="absolute left-0 right-0 top-4 h-px bg-white/10" />
            <div className="flex items-start justify-between">
              {steps.map((label, index) => (
                <div key={label} className="flex w-full flex-col items-center">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                      index === stepIndex
                        ? 'border-orange-400/70 bg-orange-500/20 text-orange-100'
                        : 'border-white/20 bg-slate-900 text-slate-300'
                    }`}
                  >
                    {index + 1}
                  </div>
                  <span className="mt-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                    {label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <button
          type="button"
          className="inline-flex items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-[#ffd1c4]"
          onClick={onDismiss}
        >
          Close
        </button>
      </div>

      {form.error && <p className="text-sm text-rose-400">{form.error}</p>}

      {content}

      <div className="flex flex-col gap-2 sm:flex-row tw">
        {stepIndex > 0 && (
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[#ff6b4a]/40 bg-transparent px-6 py-3 text-sm font-semibold text-[#ffd1c4] transition sm:w-auto"
            onClick={handleBack}
          >
            Back
          </button>
        )}
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-[#ff6b4a] px-6 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
          onClick={handlePrimary}
          disabled={form.saving || (stepIndex === steps.length - 1 && !organizerAllowed)}
        >
          {stepIndex === steps.length - 1 ? (form.saving ? 'Creating...' : 'Create event') : 'Next'}
        </button>
      </div>
    </div>
  );
};

export default CreateEventModal;

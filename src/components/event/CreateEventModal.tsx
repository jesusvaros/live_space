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
  defaultArtistId?: string | null;
  initialMapCenter?: [number, number] | null;
};

const steps = ['Sala', 'Artista', 'Entrada', 'Más info'];

const CreateEventModal: React.FC<CreateEventModalProps> = ({
  onDismiss,
  onCreated,
  userId,
  profileRole,
  profileCity,
  profileName,
  defaultArtistId,
  initialMapCenter,
}) => {
  const [stepIndex, setStepIndex] = useState(0);
  const organizerAllowed = Boolean(profileRole && ['artist', 'venue', 'label'].includes(profileRole));
  const form = useCreateEventForm({
    userId,
    profileRole,
    profileCity,
    defaultArtistId,
    defaultArtistName: profileName || undefined,
    initialCenter: initialMapCenter || undefined,
  });
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
            onBoundsChange={form.handleBoundsChange}
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
            selectedArtistIds={form.selectedArtistIds}
            artistsLoading={form.artistsLoading}
            artistSearch={form.artistSearch}
            artistSearchCount={form.artistSearchCount}
            onArtistSearchChange={form.setArtistSearch}
            onSelectArtists={form.setSelectedArtistIds}
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
    <div className="flex h-full max-h-[100vh] flex-col overflow-hidden rounded-3xl bg-app-bg">
      {/* Header - Title + Close in same row */}
      <div className="flex flex-shrink-0 items-center justify-between gap-4 p-4">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/60">
            Create
          </p>
          <h2 className="mt-1 font-display text-lg font-bold text-white">Event</h2>
        </div>
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
            onClick={onDismiss}
          >
            Close
          </button>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex-shrink-0 px-4">
        <div className="flex items-center gap-3 overflow-x-auto pb-2">
          {steps.map((label, index) => {
            const isActive = index === stepIndex;
            const isDone = index < stepIndex;
            return (
              <div key={label} className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.22em] ${
                    isActive ? 'text-app-accent' : isDone ? 'text-white/70' : 'text-white/45'
                  }`}
                >
                  {label}
                </span>
                {index < steps.length - 1 && <span className="text-white/20">•</span>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Error Message */}
      {form.error && (
        <div className="flex-shrink-0 px-4 pt-3">
          <p className="text-sm text-rose-400">{form.error}</p>
        </div>
      )}

      {/* Content - Scrollable */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {content}
      </div>

      {/* Footer - Always visible */}
      <div className="flex-shrink-0 p-4 pt-0">
        <div className="tw flex flex-col gap-2 sm:flex-row">
          {stepIndex > 0 && (
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15 sm:w-auto"
              onClick={handleBack}
            >
              Back
            </button>
          )}
          <button
            type="button"
            className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white/10 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handlePrimary}
            disabled={form.saving || (stepIndex === steps.length - 1 && !organizerAllowed)}
          >
            {stepIndex === steps.length - 1 ? (form.saving ? 'Creating...' : 'Create event') : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CreateEventModal;

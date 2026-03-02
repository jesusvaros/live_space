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

const steps = ['Venue', 'Artists', 'Tickets', 'Details'];

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
    <div className="relative flex h-full max-h-[100vh] flex-col overflow-hidden bg-app-bg">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-52 bg-[radial-gradient(circle_at_8%_8%,rgba(255,107,74,0.2),transparent_56%)]" />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_92%_10%,rgba(122,167,255,0.16),transparent_62%)]" />

      <div className="relative z-10 flex flex-1 flex-col overflow-hidden">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.01))] px-4 pb-4 pt-5">
          <div>
            <h2 className="font-display text-2xl font-bold text-white">Create event</h2>
          </div>
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-full border border-white/20 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/85 transition-colors hover:text-white"
            onClick={onDismiss}
          >
            Close
          </button>
        </div>

        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {steps.map((label, index) => {
              const isActive = index === stepIndex;
              const isDone = index < stepIndex;
              return (
                <div key={label} className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                      isActive
                        ? 'bg-app-accent text-white'
                        : isDone
                          ? 'bg-white/20 text-white'
                          : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {index + 1}
                  </span>
                  <span className={`text-[10px] font-semibold uppercase tracking-[0.18em] ${isActive ? 'text-white' : 'text-white/65'}`}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {form.error && (
          <div className="shrink-0 px-4 pt-3">
            <p className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{form.error}</p>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden px-4 py-4">
          {content}
        </div>

        <div className="shrink-0 border-t border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.03),rgba(255,255,255,0.01))] p-4">
          <div className="tw flex flex-col gap-2 sm:flex-row sm:justify-between">
            {stepIndex > 0 ? (
              <button
                type="button"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-white/15 sm:w-auto"
                onClick={handleBack}
              >
                Back
              </button>
            ) : (
              <div />
            )}
            <button
              type="button"
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-app-accent/35 bg-app-accent px-6 py-3 text-sm font-semibold text-white transition-transform duration-200 hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 motion-reduce:transition-none sm:w-auto"
              onClick={handlePrimary}
              disabled={form.saving || (stepIndex === steps.length - 1 && !organizerAllowed)}
            >
              {stepIndex === steps.length - 1 ? (form.saving ? 'Creating...' : 'Create event') : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreateEventModal;

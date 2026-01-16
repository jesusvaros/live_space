import React from 'react';

export type CreateEventMoreInfoStepProps = {
  eventEnd: string;
  eventGenres: string;
  eventCoverUrl: string;
  eventDescription: string;
  posterPreview: string | null;
  posterFile: File | null;
  onEventEndChange: (value: string) => void;
  onEventGenresChange: (value: string) => void;
  onEventCoverUrlChange: (value: string) => void;
  onEventDescriptionChange: (value: string) => void;
  onPosterFileChange: (file: File | null) => void;
  onPosterRemove: () => void;
};

const CreateEventMoreInfoStep: React.FC<CreateEventMoreInfoStepProps> = ({
  eventEnd,
  eventGenres,
  eventCoverUrl,
  eventDescription,
  posterPreview,
  posterFile,
  onEventEndChange,
  onEventGenresChange,
  onEventCoverUrlChange,
  onEventDescriptionChange,
  onPosterFileChange,
  onPosterRemove,
}) => {
  return (
    <section className="app-card space-y-3 p-4">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">More info</p>
        <p className="mt-2 text-sm text-slate-500">Extras opcionales para la ficha.</p>
      </div>
      <label className="app-field">
        <span className="app-label">Ends at</span>
        <input
          className="app-input"
          type="datetime-local"
          value={eventEnd}
          onChange={e => onEventEndChange(e.target.value)}
        />
      </label>
      <label className="app-field">
        <span className="app-label">Genres</span>
        <input
          className="app-input"
          value={eventGenres}
          onChange={e => onEventGenresChange(e.target.value)}
          placeholder="Jazz, Experimental"
        />
      </label>
      <label className="app-field">
        <span className="app-label">Poster upload</span>
        <input
          className="app-input"
          type="file"
          accept="image/*"
          onChange={e => onPosterFileChange(e.target.files?.[0] || null)}
        />
      </label>
      {posterPreview && (
        <div className="overflow-hidden rounded-2xl bg-slate-900">
          <img src={posterPreview} alt="Event poster preview" className="h-48 w-full object-cover" />
        </div>
      )}
      {posterFile && (
        <button
          type="button"
          className="app-button app-button--ghost app-button--small"
          onClick={onPosterRemove}
        >
          Remove poster
        </button>
      )}
      <label className="app-field">
        <span className="app-label">Poster URL (optional)</span>
        <input
          className="app-input"
          value={eventCoverUrl}
          onChange={e => onEventCoverUrlChange(e.target.value)}
          placeholder="https://..."
        />
      </label>
      <label className="app-field">
        <span className="app-label">Description</span>
        <textarea
          className="app-textarea"
          value={eventDescription}
          onChange={e => onEventDescriptionChange(e.target.value)}
          placeholder="Optional details..."
        />
      </label>
    </section>
  );
};

export default CreateEventMoreInfoStep;

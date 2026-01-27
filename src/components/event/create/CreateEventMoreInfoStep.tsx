import React, { useMemo, useRef, useState } from 'react';

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);

  const hasPoster = Boolean(posterPreview || posterFile);

  const posterHelp = useMemo(() => {
    if (posterFile) return posterFile.name;
    if (eventCoverUrl.trim()) return 'Using poster URL';
    return 'Upload a poster or paste a URL (optional).';
  }, [eventCoverUrl, posterFile]);

  return (
    <section className="space-y-4 rounded-2xl bg-white/5 p-4">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">More info</p>
        <p className="mt-2 text-sm text-white/70">Optional details (poster, genres, description).</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Ends at</span>
        <input
          className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/15"
          type="datetime-local"
          value={eventEnd}
          onChange={e => onEventEndChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Genres</span>
        <input
          className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
          value={eventGenres}
          onChange={e => onEventGenresChange(e.target.value)}
          placeholder="Jazz, Experimental"
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Poster</p>
            <p className="mt-1 text-xs text-white/60">{posterHelp}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload
            </button>
            {hasPoster && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white/80 transition hover:bg-white/15 hover:text-white"
                onClick={() => {
                  setFileInputKey(prev => prev + 1);
                  onPosterRemove();
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <input
          key={fileInputKey}
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => onPosterFileChange(e.target.files?.[0] || null)}
        />

        {posterPreview && (
          <div className="relative overflow-hidden rounded-2xl bg-black/30">
            <img src={posterPreview} alt="Event poster preview" className="h-52 w-full object-cover" />
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">
            Poster URL (optional)
          </span>
          <input
            className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
            value={eventCoverUrl}
            onChange={e => onEventCoverUrlChange(e.target.value)}
            placeholder="https://..."
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-white/60">Description</span>
        <textarea
          className="min-h-[110px] w-full resize-none rounded-2xl bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-white/15"
          value={eventDescription}
          onChange={e => onEventDescriptionChange(e.target.value)}
          placeholder="Optional details..."
        />
      </label>
    </section>
  );
};

export default CreateEventMoreInfoStep;

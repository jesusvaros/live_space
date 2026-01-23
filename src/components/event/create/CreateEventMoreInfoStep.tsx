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
    <section className="space-y-4 rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 to-slate-950/95 p-4 shadow-[0_24px_50px_rgba(0,0,0,0.45)]">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">Más info</p>
        <p className="mt-2 text-sm text-slate-500">Detalles opcionales (poster, descripción, géneros).</p>
      </div>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Ends at</span>
        <input
          className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100"
          type="datetime-local"
          value={eventEnd}
          onChange={e => onEventEndChange(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Genres</span>
        <input
          className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
          value={eventGenres}
          onChange={e => onEventGenresChange(e.target.value)}
          placeholder="Jazz, Experimental"
        />
      </label>

      <div className="space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Poster</p>
            <p className="mt-1 text-xs text-slate-500">{posterHelp}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => fileInputRef.current?.click()}
            >
              Upload
            </button>
            {hasPoster && (
              <button
                type="button"
                className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-100"
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
          <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0e14]">
            <img src={posterPreview} alt="Event poster preview" className="h-52 w-full object-cover" />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
          </div>
        )}

        <label className="flex flex-col gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">
            Poster URL (optional)
          </span>
          <input
            className="w-full rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
            value={eventCoverUrl}
            onChange={e => onEventCoverUrlChange(e.target.value)}
            placeholder="https://..."
          />
        </label>
      </div>

      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-400">Description</span>
        <textarea
          className="min-h-[110px] w-full resize-none rounded-2xl border border-white/10 bg-[#141824] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500"
          value={eventDescription}
          onChange={e => onEventDescriptionChange(e.target.value)}
          placeholder="Optional details..."
        />
      </label>
    </section>
  );
};

export default CreateEventMoreInfoStep;

import React, { useState } from 'react';

// The concert's description in its own card with a heading, cut to a few
// lines until «Ver más».
const EventDescription: React.FC<{ text: string }> = ({ text }) => {
  const [open, setOpen] = useState(false);
  const long = text.length > 220;
  return (
    <section className="rounded-2xl border border-app-line bg-app-surface px-4 py-3.5">
      <h2 className="m-0 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-white/55">Sobre el concierto</h2>
      <p className={`mt-1.5 whitespace-pre-line text-sm leading-relaxed text-white/75 ${open ? '' : 'line-clamp-4'}`}>{text}</p>
      {long ? (
        <button type="button" onClick={() => setOpen(value => !value)} className="mt-1 min-h-9 text-sm font-semibold text-app-accent">
          {open ? 'Ver menos' : 'Ver más'}
        </button>
      ) : null}
    </section>
  );
};

export default EventDescription;

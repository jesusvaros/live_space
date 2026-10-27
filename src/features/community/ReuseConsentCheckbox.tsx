import React, { useState } from 'react';
import { getReuseConsent, LICENCE_TERMS_PATH, setReuseConsent } from './licence';

type ReuseConsentCheckboxProps = {
  className?: string;
  onChange?: (allowReuse: boolean) => void;
};

/**
 * Upload licence choice. Self-contained: it remembers the choice on the
 * device and uploadEventPost reads it, so an upload screen only needs to
 * render this one line.
 */
const ReuseConsentCheckbox: React.FC<ReuseConsentCheckboxProps> = ({ className = '', onChange }) => {
  const [checked, setChecked] = useState(getReuseConsent);

  const toggle = (value: boolean) => {
    setChecked(value);
    setReuseConsent(value);
    onChange?.(value);
  };

  return (
    <div className={`rounded-2xl border border-app-line bg-app-surface p-3 ${className}`}>
      <label className="flex min-h-11 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={event => toggle(event.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-[#ff5b2e]"
        />
        <span className="text-sm leading-snug text-app-ink">
          Permitir que el artista y la sala reutilicen este momento citándome
        </span>
      </label>
      <p className="m-0 mt-1 pl-8 text-xs text-white/55">
        Puedes cambiarlo después en cada momento.{' '}
        {/* New tab: the files picked for upload stay selected here. */}
        <a
          href={LICENCE_TERMS_PATH}
          target="_blank"
          rel="noreferrer"
          className="font-semibold text-app-accent underline-offset-2 hover:underline"
        >
          Condiciones de uso
        </a>
      </p>
    </div>
  );
};

export default ReuseConsentCheckbox;

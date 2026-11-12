import React from 'react';
import { LICENCE_TERMS_PATH } from './licence';

type ReuseNoticeProps = {
  className?: string;
};

/**
 * Upload licence notice. Publishing grants the artist and the venue reuse
 * with credit (docs/legal/licencia-momentos.md); there is no per-upload
 * opt-out here. Authors switch it off afterwards on each moment, or for
 * every future upload in Ajustes.
 */
const ReuseNotice: React.FC<ReuseNoticeProps> = ({ className = '' }) => (
  <p className={`m-0 text-center text-xs leading-snug text-white/55 ${className}`}>
    Al publicar, el artista y la sala pueden compartirlo citándote.{' '}
    {/* New tab: the files picked for upload stay selected here. */}
    <a
      href={LICENCE_TERMS_PATH}
      target="_blank"
      rel="noreferrer"
      className="font-semibold text-app-accent underline-offset-2 hover:underline"
    >
      Condiciones
    </a>
  </p>
);

export default ReuseNotice;

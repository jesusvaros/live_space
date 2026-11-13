import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Content, Modal } from '../../components/ui/AppPrimitives';
import QrScanner from '../../components/QrScanner';
import { IconQrCode } from '../../components/icons';
import { parseScannedUploadValue } from '../../lib/uploadQr';
import { track } from '../analytics/analytics';

/**
 * Floating «Escanear QR» on Inicio. The concert's uploader does the rest:
 * welcome, «Voy»/«Fui» and the picker (Upload.tsx, fromQr).
 */
const ScanConcertFab: React.FC = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const onDetected = (value: string) => {
    const target = parseScannedUploadValue(value);
    track('qr_scan', { source: 'home_button', valid: Boolean(target) });
    if (!target) {
      setError('Este QR no es de ningún concierto de Live Space.');
      return;
    }
    setOpen(false);
    setError('');
    const query = 'token' in target ? `qr=${encodeURIComponent(target.token)}` : `event=${encodeURIComponent(target.eventId)}&via=qr`;
    // Already counted: the uploader only counts QR links opened from outside.
    navigate(`/tabs/upload?${query}`, { state: { qrCounted: true } });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Escanear el QR del concierto"
        className="fixed bottom-[calc(96px+env(safe-area-inset-bottom,0px))] right-4 z-[1200] flex h-14 items-center gap-2 rounded-full bg-app-accent px-5 text-sm font-bold text-[#14151a] shadow-xl"
      >
        <IconQrCode size={20} />
        Escanear QR
      </button>

      <Modal isOpen={open} onDidDismiss={() => setOpen(false)} title="Escanear QR del concierto">
        <Content fullscreen>
          <div className="flex flex-col gap-4 bg-app-bg p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="font-display text-lg font-bold text-white">Escanea el QR del concierto</h2>
              <button
                type="button"
                className="min-h-9 rounded-full border border-app-line px-3 text-xs font-semibold text-white"
                onClick={() => setOpen(false)}
              >
                Cerrar
              </button>
            </div>
            <p className="m-0 text-sm text-white/60">Lo encontrarás en la sala. Te apuntamos al concierto y subes lo que grabes.</p>
            {open ? <QrScanner onDetected={onDetected} /> : null}
            {error ? <p className="m-0 text-sm text-red-300">{error}</p> : null}
          </div>
        </Content>
      </Modal>
    </>
  );
};

export default ScanConcertFab;

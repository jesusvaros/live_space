import React, { useEffect, useRef, useState } from 'react';

type QrScannerProps = {
  onDetected: (value: string) => void;
};

const QrScanner: React.FC<QrScannerProps> = ({ onDetected }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [error, setError] = useState('');
  const [manualValue, setManualValue] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let detector: BarcodeDetector | null = null;
    let rafId = 0;
    let active = true;

    const stop = () => {
      if (rafId) cancelAnimationFrame(rafId);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };

    const scanLoop = async () => {
      if (!active || !videoRef.current || !detector) return;
      try {
        const barcodes = await detector.detect(videoRef.current);
        if (barcodes.length > 0) {
          const value = barcodes[0].rawValue;
          if (value) {
            onDetected(value);
            stop();
            return;
          }
        }
      } catch (err) {
        setError('Falló el escaneo. Pega el enlace a mano.');
        stop();
        return;
      }

      rafId = requestAnimationFrame(scanLoop);
    };

    const init = async () => {
      if (!('BarcodeDetector' in window)) {
        setError('Este navegador no puede escanear QR. Pega el enlace a mano.');
        return;
      }

      try {
        detector = new BarcodeDetector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          scanLoop();
        }
      } catch (err) {
        setError('Sin permiso de cámara. Pega el enlace a mano.');
      }
    };

    init();

    return () => {
      active = false;
      stop();
    };
  }, [onDetected]);

  return (
    <div className="space-y-4">
      <div className="overflow-hidden bg-black">
        <video ref={videoRef} className="w-full" muted playsInline />
      </div>

      {error && (
        <p className="text-sm text-amber-400">{error}</p>
      )}

      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Pega el enlace del evento</span>
        <input
          className="bg-white/10 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:outline-none"
          value={manualValue}
          onChange={e => setManualValue(e.target.value)}
          placeholder="https://..."
        />
      </label>
      <button
        type="button"
        className="inline-flex w-full items-center justify-center bg-white/10 px-4 py-3 text-sm font-semibold text-white"
        onClick={() => manualValue && onDetected(manualValue)}
      >
        Usar enlace
      </button>
    </div>
  );
};

export default QrScanner;

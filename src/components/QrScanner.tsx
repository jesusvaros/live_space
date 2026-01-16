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
        setError('Camera scan failed. Try manual input.');
        stop();
        return;
      }

      rafId = requestAnimationFrame(scanLoop);
    };

    const init = async () => {
      if (!('BarcodeDetector' in window)) {
        setError('QR scanning not supported on this browser. Use manual input.');
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
        setError('Camera permission denied. Use manual input.');
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
      <div className="overflow-hidden rounded-2xl bg-slate-900">
        <video ref={videoRef} className="w-full" muted playsInline />
      </div>

      {error && (
        <p className="text-sm text-amber-400">{error}</p>
      )}

      <label className="app-field">
        <span className="app-label">Paste event link</span>
        <input
          className="app-input"
          value={manualValue}
          onChange={e => setManualValue(e.target.value)}
          placeholder="https://..."
        />
      </label>
      <button
        type="button"
        className="app-button app-button--block"
        onClick={() => manualValue && onDetected(manualValue)}
      >
        Use link
      </button>
    </div>
  );
};

export default QrScanner;

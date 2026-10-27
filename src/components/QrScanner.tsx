import React, { useEffect, useRef, useState } from 'react';

type QrScannerProps = {
  onDetected: (value: string) => void;
};

type Decoder = (source: HTMLVideoElement | HTMLImageElement | ImageBitmap) => Promise<string | null>;

// Draws a frame on a small canvas and decodes it with jsQR. Used where the
// browser has no BarcodeDetector (iOS Safari and the iOS WebView).
const createJsQrDecoder = async (): Promise<Decoder> => {
  const { default: jsQR } = await import('jsqr');
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });
  return async source => {
    if (!context) return null;
    const width = 'videoWidth' in source ? source.videoWidth : source.width;
    const height = 'videoHeight' in source ? source.videoHeight : source.height;
    if (!width || !height) return null;
    const scale = Math.min(1, 720 / Math.max(width, height));
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    return jsQR(image.data, image.width, image.height, { inversionAttempts: 'attemptBoth' })?.data || null;
  };
};

const createDecoder = async (): Promise<Decoder> => {
  if ('BarcodeDetector' in window) {
    try {
      const detector = new BarcodeDetector({ formats: ['qr_code'] });
      return async source => (await detector.detect(source))[0]?.rawValue || null;
    } catch {
      // Some builds expose the class without QR support; fall through.
    }
  }
  return createJsQrDecoder();
};

const QrScanner: React.FC<QrScannerProps> = ({ onDetected }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState('');
  const [manualValue, setManualValue] = useState('');
  const [cameraLive, setCameraLive] = useState(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let decoder: Decoder | null = null;
    let timer = 0;
    let active = true;

    const stop = () => {
      if (timer) window.clearTimeout(timer);
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };

    const scanLoop = async () => {
      if (!active || !videoRef.current || !decoder) return;
      try {
        const value = await decoder(videoRef.current);
        if (value) {
          onDetected(value);
          stop();
          return;
        }
      } catch {
        setError('Falló el escaneo. Haz una foto al QR o pega el enlace.');
        stop();
        return;
      }
      timer = window.setTimeout(scanLoop, 180);
    };

    const init = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('No podemos abrir la cámara aquí. Haz una foto al QR o pega el enlace.');
        return;
      }
      try {
        decoder = await createDecoder();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
          audio: false,
        });
        if (!active) {
          stop();
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraLive(true);
          scanLoop();
        }
      } catch {
        setError('Sin permiso de cámara. Haz una foto al QR o pega el enlace.');
      }
    };

    init();

    return () => {
      active = false;
      stop();
    };
  }, [onDetected]);

  // Fallback: the system camera takes a photo and we decode the still image.
  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    const url = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = url;
      await image.decode();
      const decoder = await createDecoder();
      const value = await decoder(image);
      if (value) onDetected(value);
      else setError('No encontramos un QR en la foto. Prueba más cerca y con luz.');
    } catch {
      setError('No se pudo leer la foto.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="space-y-4">
      <div className={`overflow-hidden rounded-2xl bg-black ${cameraLive ? '' : 'hidden'}`}>
        <video ref={videoRef} className="w-full" muted playsInline autoPlay />
      </div>

      {error && (
        <p className="text-sm text-amber-400">{error}</p>
      )}

      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-app-line bg-app-surface px-4 text-sm font-semibold text-white"
        onClick={() => photoInputRef.current?.click()}
      >
        Hacer foto al QR
      </button>

      <label className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">Pega el enlace del evento</span>
        <input
          className="min-h-11 rounded-xl bg-white/10 px-4 text-sm text-white placeholder:text-white/40 focus:outline-none"
          value={manualValue}
          onChange={e => setManualValue(e.target.value)}
          placeholder="https://..."
        />
      </label>
      <button
        type="button"
        className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-white/10 px-4 text-sm font-semibold text-white"
        onClick={() => manualValue && onDetected(manualValue)}
      >
        Usar enlace
      </button>
    </div>
  );
};

export default QrScanner;

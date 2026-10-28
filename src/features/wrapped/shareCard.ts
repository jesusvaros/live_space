import QRCode from 'qrcode';
import { Capacitor } from '@capacitor/core';
import { POSTER_COLORS } from '../../lib/qrPoster';

// The story a fan posts after importing: "Sigo a mis 5 del Wrapped en Live
// Space", their artists and a QR to the app.

const env = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const DEFAULT_SITE_URL = 'https://livespace.pages.dev';

// Not window.location: inside the app that is https://localhost.
export const wrappedShareUrl = () => {
  const base = (env.VITE_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL).replace(/\/+$/, '');
  return `${base}/?utm_source=wrapped`;
};

export const wrappedShareText = (count: number) =>
  count === 1 ? 'Sigo a mi artista del Wrapped en Live Space' : `Sigo a mis ${count} del Wrapped en Live Space`;

const fitFont = (context: CanvasRenderingContext2D, text: string, build: (size: number) => string, start: number, maxWidth: number) => {
  let size = start;
  context.font = build(size);
  while (size > 16 && context.measureText(text).width > maxWidth) {
    size -= 4;
    context.font = build(size);
  }
  return size;
};

export const renderWrappedStory = async (artistNames: string[]): Promise<Blob> => {
  const { ground, ink, accent } = POSTER_COLORS.dark;
  const width = 1080;
  const height = 1920;
  const pad = 88;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas no disponible');

  const poster = (size: number) => `900 extra-condensed ${size}px Archivo, "Space Grotesk", sans-serif`;
  const mono = (size: number) => `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
  const grotesk = (size: number) => `700 ${size}px "Space Grotesk", sans-serif`;
  if (document.fonts?.load) {
    await Promise.allSettled([document.fonts.load(poster(120)), document.fonts.load(mono(32)), document.fonts.load(grotesk(32))]);
  }

  context.fillStyle = ground;
  context.fillRect(0, 0, width, height);

  context.fillStyle = accent;
  context.font = mono(34);
  context.fillText('MI WRAPPED · EN DIRECTO', pad, pad + 60);

  const names = artistNames.slice(0, 5);
  const headline = [`SIGO A MIS ${names.length}`, 'DEL WRAPPED'];
  if (names.length === 1) headline[0] = 'SIGO A MI Nº1';
  const headSize = fitFont(context, headline[1], poster, 200, width - pad * 2);
  context.font = poster(headSize);
  const headLine = headSize * 0.88;
  let y = pad + 90 + headLine;
  context.fillStyle = ink;
  context.fillText(headline[0], pad, y);
  y += headLine;
  context.fillStyle = accent;
  context.fillText(headline[1], pad, y);

  y += 160;
  for (const [index, name] of names.entries()) {
    context.fillStyle = accent;
    context.font = mono(44);
    context.fillText(String(index + 1).padStart(2, '0'), pad, y);
    context.fillStyle = ink;
    fitFont(context, name.toUpperCase(), poster, 104, width - pad * 2 - 110);
    context.fillText(name.toUpperCase(), pad + 110, y + 8);
    y += 124;
  }

  // Footer: QR to the app and the line to scan it.
  const qrBox = 300;
  const qrTop = height - pad - qrBox;
  context.fillStyle = '#ffffff';
  context.fillRect(pad, qrTop, qrBox, qrBox);
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, wrappedShareUrl(), {
    margin: 0,
    width: qrBox - 40,
    errorCorrectionLevel: 'M',
    color: { dark: '#14151a', light: '#ffffff' },
  });
  context.imageSmoothingEnabled = false;
  context.drawImage(qrCanvas, pad + 20, qrTop + 20, qrBox - 40, qrBox - 40);

  const textX = pad + qrBox + 48;
  const textWidth = width - textX - pad;
  context.fillStyle = ink;
  fitFont(context, 'Live Space', grotesk, 64, textWidth);
  context.fillText('Live Space', textX, qrTop + 90);
  context.fillStyle = 'rgba(243,239,231,0.72)';
  context.font = grotesk(34);
  ['Sus conciertos cerca', 'de ti, antes que nadie.'].forEach((line, index) => {
    fitFont(context, line, grotesk, 34, textWidth);
    context.fillText(line, textX, qrTop + 160 + index * 46);
  });

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
  });
};

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

export type ShareOutcome = 'shared' | 'downloaded' | 'cancelled';

export const shareWrappedStory = async (blob: Blob, count: number): Promise<ShareOutcome> => {
  const text = wrappedShareText(count);
  const url = wrappedShareUrl();

  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    const written = await Filesystem.writeFile({
      path: `wrapped-live-space-${Date.now()}.png`,
      data: await blobToBase64(blob),
      directory: Directory.Cache,
    });
    try {
      await Share.share({ title: text, text: `${text} ${url}`, files: [written.uri], dialogTitle: 'Compartir' });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  const file = new File([blob], 'wrapped-live-space.png', { type: 'image/png' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text: `${text} ${url}` });
      return 'shared';
    } catch {
      return 'cancelled';
    }
  }

  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
  return 'downloaded';
};

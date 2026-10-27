import QRCode from 'qrcode';

export type PosterVariant = 'paper' | 'dark';

export type PosterContent = {
  url: string;
  kicker: string; // "LA RIVIERA · JUE 29 OCT"
  artist: string;
  shareTag: string; // "#LSRIV29"
};

// TODO: switch to getEventTag(event) from feat/social-import once it lands.
// Fallback tag: #LS + first three letters of the venue + day of the month.
export const fallbackShareTag = (venueName: string | null, startsAt: string) => {
  const letters = (venueName || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(sala|la|el|los|las|the)\s+/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 3)
    .toUpperCase();
  const day = new Date(startsAt).toLocaleDateString('es-ES', { day: 'numeric', timeZone: 'Europe/Madrid' });
  return `#LS${letters || 'EVT'}${day}`;
};

export const POSTER_COLORS: Record<PosterVariant, { ground: string; ink: string; accent: string }> = {
  paper: { ground: '#f3efe7', ink: '#14151a', accent: '#ff5b2e' },
  dark: { ground: '#0d0e12', ink: '#f3efe7', accent: '#ff5b2e' },
};

export const qrSvg = (url: string) =>
  QRCode.toString(url, {
    type: 'svg',
    margin: 0,
    errorCorrectionLevel: 'M',
    color: { dark: '#14151a', light: '#ffffff' },
  });

const fitFont = (
  context: CanvasRenderingContext2D,
  text: string,
  build: (size: number) => string,
  start: number,
  maxWidth: number,
) => {
  let size = start;
  context.font = build(size);
  while (size > 12 && context.measureText(text).width > maxWidth) {
    size -= 2;
    context.font = build(size);
  }
  return size;
};

// Draws the printable poster (A-series ratio) at print resolution and returns
// it as a PNG blob. Uses the same fonts as the app; they are loaded first.
export const renderPosterPng = async (content: PosterContent, variant: PosterVariant): Promise<Blob> => {
  const colors = POSTER_COLORS[variant];
  const width = 1240;
  const height = 1754;
  const pad = 96;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas no disponible');

  // font-stretch goes in the shorthand: setting `font` resets ctx.fontStretch.
  const poster = (size: number) => `900 extra-condensed ${size}px Archivo, "Space Grotesk", sans-serif`;
  const mono = (size: number) => `600 ${size}px "IBM Plex Mono", ui-monospace, monospace`;
  const grotesk = (size: number) => `700 ${size}px "Space Grotesk", sans-serif`;
  if (document.fonts?.load) {
    await Promise.allSettled([
      document.fonts.load(poster(120)),
      document.fonts.load(mono(32)),
      document.fonts.load(grotesk(32)),
    ]);
  }

  context.fillStyle = colors.ground;
  context.fillRect(0, 0, width, height);
  context.textBaseline = 'alphabetic';

  // Kicker
  context.fillStyle = colors.ink;
  fitFont(context, content.kicker, mono, 34, width - pad * 2);
  context.fillText(content.kicker, pad, pad + 30);

  // Headline: "SUBE LO QUE / GRABES ESTA NOCHE"
  const lineTwo = 'GRABES ESTA NOCHE';
  const size = fitFont(context, lineTwo, poster, 190, width - pad * 2);
  context.font = poster(size);
  const lineHeight = size * 0.86;
  const headTop = pad + 60 + lineHeight;
  context.fillStyle = colors.ink;
  context.fillText('SUBE LO QUE', pad, headTop);
  context.fillStyle = colors.accent;
  context.fillText('GRABES', pad, headTop + lineHeight);
  const grabesWidth = context.measureText('GRABES ').width;
  context.fillStyle = colors.ink;
  context.fillText('ESTA NOCHE', pad + grabesWidth, headTop + lineHeight);

  // QR on a white card
  const footerTop = height - pad - 120;
  const qrTop = headTop + lineHeight + 70;
  const qrBox = Math.min(width - pad * 2 - 120, footerTop - qrTop - 110);
  const qrX = (width - qrBox) / 2;
  context.fillStyle = '#ffffff';
  context.fillRect(qrX, qrTop, qrBox, qrBox);
  const qrCanvas = document.createElement('canvas');
  await QRCode.toCanvas(qrCanvas, content.url, {
    margin: 0,
    width: qrBox - 64,
    errorCorrectionLevel: 'M',
    color: { dark: '#14151a', light: '#ffffff' },
  });
  context.imageSmoothingEnabled = false;
  context.drawImage(qrCanvas, qrX + 32, qrTop + 32, qrBox - 64, qrBox - 64);

  // Hashtag line under the QR
  const tagLine = `Etiqueta tus stories con ${content.shareTag}`;
  context.fillStyle = colors.ink;
  fitFont(context, tagLine, grotesk, 40, width - pad * 2);
  context.textAlign = 'center';
  context.fillText(tagLine, width / 2, qrTop + qrBox + 54);
  context.textAlign = 'left';

  // Footer: rule, artist, brand
  context.fillStyle = colors.ink;
  context.fillRect(pad, footerTop, width - pad * 2, 5);
  const brandText = 'Live Space';
  context.font = grotesk(40);
  const brandWidth = context.measureText(brandText).width;
  const markSize = 46;
  const brandX = width - pad - brandWidth;
  const baseline = footerTop + 92;
  context.fillText(brandText, brandX, baseline);
  const markCx = brandX - 16 - markSize / 2;
  const markCy = baseline - 15;
  context.strokeStyle = colors.accent;
  context.lineWidth = 6;
  context.beginPath();
  context.arc(markCx, markCy, markSize / 2 - 3, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = colors.accent;
  context.beginPath();
  context.arc(markCx, markCy, markSize / 4.4, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = colors.ink;
  const artist = content.artist.toUpperCase();
  fitFont(context, artist, poster, 84, markCx - markSize / 2 - pad - 32);
  context.fillText(artist, pad, baseline + 6);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error('No se pudo generar la imagen'))), 'image/png');
  });
};

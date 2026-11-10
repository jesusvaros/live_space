import { fitWithin } from './merchRules';

export const PHOTO_MAX_PX = 1200;

const loadImage = (file: Blob) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se ha podido leer la foto.'));
    };
    image.src = url;
  });

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>(resolve => canvas.toBlob(resolve, type, quality));

/**
 * Shrinks a product photo to fit 1200×1200 and re-encodes it as WebP (JPEG
 * where the browser cannot write WebP, e.g. older iOS). A phone photo of
 * several MB ends up around 100–250 KB.
 */
export const compressProductPhoto = async (file: Blob): Promise<{ blob: Blob; extension: 'webp' | 'jpg' }> => {
  const image = await loadImage(file);
  const { width, height } = fitWithin(image.naturalWidth || image.width, image.naturalHeight || image.height, PHOTO_MAX_PX);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se ha podido preparar la foto.');
  context.drawImage(image, 0, 0, width, height);

  const webp = await toBlob(canvas, 'image/webp', 0.82);
  if (webp && webp.type === 'image/webp') return { blob: webp, extension: 'webp' };
  const jpeg = await toBlob(canvas, 'image/jpeg', 0.85);
  if (!jpeg) throw new Error('No se ha podido preparar la foto.');
  return { blob: jpeg, extension: 'jpg' };
};

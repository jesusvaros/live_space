// Concert photos are shrunk on the device before uploading: a 12 MP phone
// photo (4–8 MB) becomes ~2560 px JPEG of ~400–900 KB, several times faster
// on mobile data. Small files and anything that fails to decode go as they are.

export const PHOTO_UPLOAD_MAX_PX = 2560;
const SKIP_BELOW_BYTES = 1_200_000;

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
      reject(new Error('decode failed'));
    };
    image.src = url;
  });

export const fitWithinMax = (width: number, height: number, max: number) => {
  const scale = Math.min(1, max / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
};

export const compressMomentPhoto = async (file: File): Promise<File> => {
  if (file.size < SKIP_BELOW_BYTES || typeof document === 'undefined') return file;
  try {
    const image = await loadImage(file);
    const { width, height } = fitWithinMax(image.naturalWidth || image.width, image.naturalHeight || image.height, PHOTO_UPLOAD_MAX_PX);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.86));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
};

import { Capacitor } from '@capacitor/core';

// An image shared into the app (Spotify -> Compartir -> Live Space) arrives as
// a copy in the app cache (@capgo/capacitor-share-target keeps it 24 h); the
// listener hands its path to /wrapped through the query string.

export const WRAPPED_PATH = '/wrapped';

export const wrappedPathFor = (fileUri: string) => `${WRAPPED_PATH}?${new URLSearchParams({ imagen: fileUri }).toString()}`;

// Only the share plugin's own cache folder is read.
export const isSharedCachePath = (value: string) =>
  /\/cache\/shared_files\/[^/]+$/.test(value) && !value.includes('..');

export const loadSharedImage = async (fileUri: string): Promise<Blob> => {
  if (!isSharedCachePath(fileUri)) throw new Error('Ruta de imagen no válida');
  const response = await fetch(Capacitor.convertFileSrc(fileUri));
  if (!response.ok) throw new Error('No se pudo abrir la imagen compartida');
  return response.blob();
};

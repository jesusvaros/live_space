import { Capacitor } from '@capacitor/core';

// Saving fan moments (photos and videos) to the device.
//
// - App (Android/iOS): the file is downloaded natively into the app cache —
//   no browser CORS involved, so it works for R2 videos too — and handed to
//   the system share sheet, where «Guardar vídeo» / «Guardar en Fotos» lives.
//   Several files go in one sheet.
// - Web: fetched as a blob and saved with its name. The R2 bucket needs a
//   CORS rule for that (docs/runbooks.md, «Descargar vídeos de R2»); without
//   it the file opens in a new tab, where the browser can save it.

export type MediaFile = { url: string; fileName: string };
export type SaveOutcome = 'saved' | 'shared' | 'opened' | 'cancelled';

const saveBlob = (blob: Blob, fileName: string) => {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
};

/** Tries each URL in order on the web; true when one was saved. */
export const saveFirstReachable = async (urls: string[], fileName: string) => {
  for (const url of [...new Set(urls)]) {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) continue;
      saveBlob(await response.blob(), fileName);
      return true;
    } catch {
      // CORS or network: try the next one
    }
  }
  return false;
};

const safeName = (fileName: string) => fileName.replace(/[^A-Za-z0-9._@-]+/g, '_').slice(0, 120);

const shareNatively = async (files: MediaFile[]): Promise<SaveOutcome> => {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([import('@capacitor/filesystem'), import('@capacitor/share')]);
  const uris: string[] = [];
  for (const file of files) {
    const path = `momentos/${Date.now()}-${safeName(file.fileName)}`;
    // Deprecated in favour of @capacitor/file-transfer, but still shipped in
    // v8 and it avoids adding a native plugin just for this.
    await Filesystem.downloadFile({ url: file.url, path, directory: Directory.Cache, recursive: true });
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
    uris.push(uri);
  }
  try {
    await Share.share({ files: uris, dialogTitle: files.length > 1 ? `Guardar ${files.length} momentos` : 'Guardar momento' });
    return 'shared';
  } catch {
    return 'cancelled';
  }
};

/**
 * Saves one or more moments. On the web, files are saved one after another
 * (browsers ask once for multiple downloads); a file the bucket will not
 * serve to scripts opens in a new tab instead.
 */
export const saveMediaFiles = async (files: MediaFile[]): Promise<SaveOutcome> => {
  if (files.length === 0) return 'cancelled';
  if (Capacitor.isNativePlatform()) return shareNatively(files);

  let opened = false;
  for (const [index, file] of files.entries()) {
    if (index > 0) await new Promise(resolve => window.setTimeout(resolve, 400));
    const saved = await saveFirstReachable([file.url], file.fileName);
    if (!saved) {
      window.open(file.url, '_blank', 'noopener');
      opened = true;
    }
  }
  return opened ? 'opened' : 'saved';
};

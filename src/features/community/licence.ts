import type { MomentLicence } from './api';

export const LICENCE_TERMS_PATH = '/legal/licencia-momentos';

// ---- Upload consent: remembered per device, on by default -----------------

const CONSENT_KEY = 'live_space.allow_reuse';

export const getReuseConsent = (): boolean => {
  try {
    return globalThis.localStorage?.getItem(CONSENT_KEY) !== 'false';
  } catch {
    return true;
  }
};

export const setReuseConsent = (value: boolean) => {
  try {
    globalThis.localStorage?.setItem(CONSENT_KEY, value ? 'true' : 'false');
  } catch {
    // Storage blocked: the choice still applies to this session's uploads
    // through the checkbox state.
  }
};

// ---- File naming -----------------------------------------------------------

const slug = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'concierto';

const handle = (credit: string) => credit.replace(/^@/, '').replace(/[^A-Za-z0-9._-]+/g, '') || 'livespace';

const extensionFor = (licence: MomentLicence) => {
  if (licence.format && /^[a-z0-9]{2,5}$/i.test(licence.format)) return licence.format.toLowerCase();
  return licence.resource_type === 'video' ? 'mp4' : 'jpg';
};

/** livespace_<artista>_<fecha>_@usuario.<ext> */
export const momentFileName = (licence: MomentLicence) =>
  `livespace_${slug(licence.artist_name || '')}_${licence.event_date || 'fecha'}_@${handle(licence.credit || '')}.${extensionFor(licence)}`;

// ---- Cloudinary delivery URLs -------------------------------------------------

const CLOUDINARY_UPLOAD = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/(?:image|video)\/upload\/)(.+)$/;

const encodeOverlayText = (text: string) =>
  // Cloudinary reads the text layer URL-decoded once more, so the
  // separators it parses (% , /) are escaped twice.
  encodeURIComponent(text).replace(/%/g, '%25');

/**
 * Inserts transformations right after /upload/. Returns null for media that
 * is not on Cloudinary.
 *  - attachment: Content-Disposition attachment. Cloudinary only accepts
 *    [A-Za-z0-9_-] in that name, so the "@" lives in the blob download name.
 *  - overlay: "@usuario vía Live Space", bottom right, scaled to 40 % of the
 *    width. Images only.
 */
export const cloudinaryDownloadUrl = (
  mediaUrl: string,
  options: { fileName: string; credit: string; overlay: boolean; resourceType?: 'image' | 'video' },
) => {
  const match = CLOUDINARY_UPLOAD.exec(mediaUrl);
  if (!match) return null;
  const attachmentName = options.fileName.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]+/g, '');
  const steps: string[] = [];
  if (options.overlay && options.resourceType !== 'video') {
    steps.push(`l_text:Arial_64_bold:${encodeOverlayText(`${options.credit} vía Live Space`)},co_white,o_90`);
    steps.push('fl_layer_apply,fl_relative,w_0.4,g_south_east,x_0.03,y_0.03');
  }
  steps.push(`fl_attachment:${attachmentName}`);
  return `${match[1]}${steps.join('/')}/${match[2]}`;
};

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

/**
 * Downloads a reusable moment named with its credit. Tries the credited
 * overlay first, then the untouched file (an account with strict
 * transformations refuses new overlays), then opens the attachment URL.
 */
export const downloadMoment = async (licence: MomentLicence, options: { overlay: boolean }) => {
  if (!licence.can_download || !licence.media_url) throw new Error('Este momento no se puede descargar.');
  const fileName = momentFileName(licence);
  const credit = licence.credit || '@livespace';
  const candidates = [
    options.overlay
      ? cloudinaryDownloadUrl(licence.media_url, { fileName, credit, overlay: true, resourceType: licence.resource_type })
      : null,
    cloudinaryDownloadUrl(licence.media_url, { fileName, credit, overlay: false, resourceType: licence.resource_type }),
    licence.media_url,
  ].filter((url): url is string => Boolean(url));

  for (const url of [...new Set(candidates)]) {
    try {
      const response = await fetch(url, { mode: 'cors' });
      if (!response.ok) continue;
      saveBlob(await response.blob(), fileName);
      return fileName;
    } catch {
      // try the next candidate
    }
  }
  window.open(candidates.at(-2) ?? candidates[0], '_blank', 'noopener');
  return fileName;
};

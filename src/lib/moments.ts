import { findMp4Location, gpsFromExif, type LatLng } from './mediaLocation';
import type { GalleryAsset } from '../media/native/gallery';
import type { PickedMomentMedia } from '../media/native';

export type MomentItem = {
  id: string;
  // Picked with the system picker. Null for camera-roll assets (the app's
  // in-app gallery), which upload from their native path instead.
  file: File | null;
  // GalleryScan asset id, when it came from the in-app gallery.
  galleryAssetId?: string;
  // Native path from the app's system picker (pickMomentMedia): a content://
  // URI on Android, a private copy on iOS. The upload queue compresses videos
  // and reads photos from it.
  nativePath?: string;
  // Thumbnail file written by the picker, deleted with the item.
  nativeThumbnailPath?: string | null;
  // Length known up front (the gallery reports it); files measure it on preview.
  durationSec?: number | null;
  previewUrl: string;
  mediaType: 'image' | 'video';
  captureAt: Date | null;
  captureSource: string | null;
  manualValue: string;
  // Where it was taken, from the file's own metadata. In memory only, to pick
  // the concert on the upload screen: never uploaded, stored or logged.
  location: LatLng | null;
};

const MAC_EPOCH_OFFSET_SECONDS = 2082844800;

const toPadded = (value: number) => value.toString().padStart(2, '0');

export const toDatetimeLocalValue = (date: Date) =>
  `${date.getFullYear()}-${toPadded(date.getMonth() + 1)}-${toPadded(date.getDate())}T${toPadded(
    date.getHours()
  )}:${toPadded(date.getMinutes())}`;

export const parseDatetimeLocalValue = (value: string) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const readType = (view: DataView, offset: number) => {
  if (offset + 4 > view.byteLength) return '';
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3)
  );
};

const readUint64 = (view: DataView, offset: number) => {
  const high = view.getUint32(offset);
  const low = view.getUint32(offset + 4);
  return high * 2 ** 32 + low;
};

const readBoxHeader = (view: DataView, offset: number, end: number) => {
  if (offset + 8 > end) return null;
  let size = view.getUint32(offset);
  const type = readType(view, offset + 4);
  let headerSize = 8;

  if (size === 1) {
    if (offset + 16 > end) return null;
    size = readUint64(view, offset + 8);
    headerSize = 16;
  } else if (size === 0) {
    size = end - offset;
  }

  if (size < headerSize) return null;
  return { size, type, headerSize };
};

const parseMvhdSeconds = (view: DataView, offset: number, end: number) => {
  if (offset + 4 > end) return null;
  const version = view.getUint8(offset);
  if (version === 1) {
    if (offset + 12 > end) return null;
    return readUint64(view, offset + 4);
  }
  if (offset + 8 > end) return null;
  return view.getUint32(offset + 4);
};

export const findMp4CreationSeconds = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  const end = view.byteLength;
  let offset = 0;

  while (offset + 8 <= end) {
    const header = readBoxHeader(view, offset, end);
    if (!header) break;
    const boxEnd = Math.min(offset + header.size, end);

    if (header.type === 'moov') {
      let childOffset = offset + header.headerSize;
      while (childOffset + 8 <= boxEnd) {
        const child = readBoxHeader(view, childOffset, boxEnd);
        if (!child) break;
        if (child.type === 'mvhd') {
          const seconds = parseMvhdSeconds(view, childOffset + child.headerSize, boxEnd);
          if (seconds !== null) return seconds;
        }
        if (child.size <= 0) break;
        childOffset += child.size;
      }
    }

    if (header.size <= 0) break;
    offset += header.size;
  }

  return findMvhdBySignature(view);
};

// The tail slice of a phone video starts in the middle of `mdat`, not on a box
// boundary, so walking boxes from 0 never reaches `moov` (phones write it at
// the end). Find the `mvhd` box by its type instead.
const MVHD = [0x6d, 0x76, 0x68, 0x64]; // "mvhd"
const findMvhdBySignature = (view: DataView) => {
  const end = view.byteLength;
  for (let at = 4; at + 4 <= end; at += 1) {
    if (
      view.getUint8(at) === MVHD[0] && view.getUint8(at + 1) === MVHD[1]
      && view.getUint8(at + 2) === MVHD[2] && view.getUint8(at + 3) === MVHD[3]
    ) {
      const size = view.getUint32(at - 4);
      if (size < 16) continue;
      const seconds = parseMvhdSeconds(view, at + 4, Math.min(end, at - 4 + size));
      if (seconds !== null && seconds > MAC_EPOCH_OFFSET_SECONDS) return seconds;
    }
  }
  return null;
};

const toCaptureDate = (seconds: number | null) => {
  if (!seconds || seconds <= MAC_EPOCH_OFFSET_SECONDS) return null;
  const date = new Date((seconds - MAC_EPOCH_OFFSET_SECONDS) * 1000);
  return Number.isNaN(date.getTime()) ? null : date;
};

// Time and place of a video from its first and last 2 MB (the `moov` box with
// the metadata sits at one end), never the whole file.
const detectVideoMetadata = async (file: File) => {
  const maxBytes = 2 * 1024 * 1024;
  const slices = [file.slice(0, maxBytes)];
  if (file.size > maxBytes) {
    slices.push(file.slice(Math.max(file.size - maxBytes, 0), file.size));
  }

  let capturedAt: Date | null = null;
  let location: LatLng | null = null;
  for (const slice of slices) {
    if (capturedAt && location) break;
    try {
      const buffer = await slice.arrayBuffer();
      capturedAt ??= toCaptureDate(findMp4CreationSeconds(buffer));
      location ??= findMp4Location(buffer);
    } catch {
      // Ignore parsing errors.
    }
  }

  return { capturedAt, location };
};

const EXIF_TAGS = [
  'DateTimeOriginal', 'CreateDate', 'ModifyDate',
  'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef',
];

type CaptureInfo = { capturedAt: Date | null; source: string | null; location: LatLng | null };

const detectCaptureInfo = async (file: File): Promise<CaptureInfo> => {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  let location: LatLng | null = null;
  if (isImage) {
    try {
      const exifrModule = await import('exifr');
      const exifr = (exifrModule as any).default ?? exifrModule;
      const data = await exifr.parse(file, { pick: EXIF_TAGS });
      // PRIVACY: the GPS is read here, on the device, only to choose the
      // concert. It stays in this MomentItem in memory and is never uploaded,
      // stored, logged or sent anywhere (see lib/mediaLocation.ts).
      location = gpsFromExif(data);
      const candidate = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
      const parsed =
        candidate instanceof Date
          ? candidate
          : typeof candidate === 'string'
            ? new Date(candidate)
            : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        return { capturedAt: parsed, source: 'exif', location };
      }
    } catch {
      // Ignore EXIF parsing errors.
    }
  }

  if (isVideo) {
    // PRIVACY: same rule as for photos: the location is only used in memory to
    // choose the concert, never uploaded, stored or logged.
    const video = await detectVideoMetadata(file);
    location = video.location;
    if (video.capturedAt) {
      return { capturedAt: video.capturedAt, source: 'video.metadata', location };
    }
  }

  if (Number.isFinite(file.lastModified) && file.lastModified > 0) {
    return { capturedAt: new Date(file.lastModified), source: 'file.lastModified', location };
  }

  return { capturedAt: null, source: null, location };
};

const newItemId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const buildMomentItems = async (files: File[]) => {
  const now = new Date();
  const items = await Promise.all(
    files.map(async file => {
      const { capturedAt, source, location } = await detectCaptureInfo(file);
      const mediaType = file.type.startsWith('video') ? 'video' : 'image';
      const initialDate = capturedAt ?? now;
      const captureSource = capturedAt ? source : 'manual';
      return {
        id: newItemId(),
        file,
        previewUrl: URL.createObjectURL(file),
        mediaType,
        captureAt: capturedAt ?? initialDate,
        captureSource: captureSource ?? null,
        manualValue: toDatetimeLocalValue(initialDate),
        location,
      } as MomentItem;
    })
  );

  return items;
};

// An item without a File (it uploads from a native path), from a capture time
// the platform already read. Without one, the user sets it by hand.
const nativeMomentItem = (
  base: Pick<MomentItem, 'id' | 'mediaType' | 'previewUrl' | 'durationSec' | 'location'> &
    Partial<Pick<MomentItem, 'galleryAssetId' | 'nativePath' | 'nativeThumbnailPath'>>,
  capturedAt: Date | null,
  source: string,
): MomentItem => {
  const valid = capturedAt && !Number.isNaN(capturedAt.getTime()) ? capturedAt : null;
  const initialDate = valid ?? new Date();
  return {
    file: null,
    ...base,
    captureAt: initialDate,
    captureSource: valid ? source : 'manual',
    manualValue: toDatetimeLocalValue(initialDate),
  };
};

// A camera-roll asset from the in-app gallery as an uploader item. The
// gallery's capture time is more reliable than file metadata. PRIVACY: the
// location stays in memory, like the one read from files above.
export const momentItemFromGallery = (asset: GalleryAsset): MomentItem =>
  nativeMomentItem(
    {
      id: `gallery:${asset.id}`,
      galleryAssetId: asset.id,
      durationSec: asset.durationSec,
      previewUrl: asset.thumbnailUri ?? '',
      mediaType: asset.kind === 'video' ? 'video' : 'image',
      location: asset.location,
    },
    new Date(asset.createdAt),
    'gallery',
  );

// A photo or video from the app's system picker (pickMomentMedia). The capture
// time comes from the file's own metadata, read natively. PRIVACY: the
// location stays in memory, like the one read from files above.
export const momentItemFromNativePick = (picked: PickedMomentMedia): MomentItem =>
  nativeMomentItem(
    {
      id: newItemId(),
      nativePath: picked.path,
      nativeThumbnailPath: picked.thumbnailPath,
      durationSec: picked.kind === 'video' && picked.durationSeconds > 0 ? picked.durationSeconds : null,
      previewUrl: picked.previewUri ?? '',
      mediaType: picked.kind,
      location: picked.location ? { lat: picked.location.latitude, lng: picked.location.longitude } : null,
    },
    picked.capturedAt ? new Date(picked.capturedAt) : null,
    picked.kind === 'video' ? 'video.metadata' : 'exif',
  );

// Only object URLs made here need releasing (gallery thumbnails are files).
export const releasePreview = (item: Pick<MomentItem, 'previewUrl'>) => {
  if (item.previewUrl.startsWith('blob:')) URL.revokeObjectURL(item.previewUrl);
};

export type MomentItem = {
  id: string;
  file: File;
  previewUrl: string;
  mediaType: 'image' | 'video';
  captureAt: Date | null;
  captureSource: string | null;
  manualValue: string;
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

const findMp4CreationSeconds = (buffer: ArrayBuffer) => {
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

  return null;
};

const detectVideoCaptureTime = async (file: File) => {
  const maxBytes = 2 * 1024 * 1024;
  const slices = [file.slice(0, maxBytes)];
  if (file.size > maxBytes) {
    slices.push(file.slice(Math.max(file.size - maxBytes, 0), file.size));
  }

  for (const slice of slices) {
    try {
      const buffer = await slice.arrayBuffer();
      const seconds = findMp4CreationSeconds(buffer);
      if (seconds && seconds > MAC_EPOCH_OFFSET_SECONDS) {
        const date = new Date((seconds - MAC_EPOCH_OFFSET_SECONDS) * 1000);
        if (!Number.isNaN(date.getTime())) return date;
      }
    } catch {
      // Ignore parsing errors.
    }
  }

  return null;
};

const detectCaptureInfo = async (file: File) => {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (isImage) {
    try {
      const exifrModule = await import('exifr');
      const exifr = (exifrModule as any).default ?? exifrModule;
      const data = await exifr.parse(file, ['DateTimeOriginal', 'CreateDate', 'ModifyDate']);
      const candidate = data?.DateTimeOriginal || data?.CreateDate || data?.ModifyDate;
      const parsed =
        candidate instanceof Date
          ? candidate
          : typeof candidate === 'string'
            ? new Date(candidate)
            : null;
      if (parsed && !Number.isNaN(parsed.getTime())) {
        return { capturedAt: parsed, source: 'exif' };
      }
    } catch {
      // Ignore EXIF parsing errors.
    }
  }

  if (isVideo) {
    const videoCapturedAt = await detectVideoCaptureTime(file);
    if (videoCapturedAt) {
      return { capturedAt: videoCapturedAt, source: 'video.metadata' };
    }
  }

  if (Number.isFinite(file.lastModified) && file.lastModified > 0) {
    return { capturedAt: new Date(file.lastModified), source: 'file.lastModified' };
  }

  return { capturedAt: null, source: null };
};

export const buildMomentItems = async (files: File[]) => {
  const now = new Date();
  const items = await Promise.all(
    files.map(async file => {
      const { capturedAt, source } = await detectCaptureInfo(file);
      const mediaType = file.type.startsWith('video') ? 'video' : 'image';
      const initialDate = capturedAt ?? now;
      const captureSource = capturedAt ? source : 'manual';
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      return {
        id,
        file,
        previewUrl: URL.createObjectURL(file),
        mediaType,
        captureAt: capturedAt ?? initialDate,
        captureSource: captureSource ?? null,
        manualValue: toDatetimeLocalValue(initialDate),
      } as MomentItem;
    })
  );

  return items;
};

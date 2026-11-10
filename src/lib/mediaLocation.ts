// Where a photo or video was taken, read from its own metadata on the device.
//
// PRIVACY: these coordinates exist only in memory, on the upload screen, and
// only to choose the concert. They are never uploaded, stored in the database,
// logged, sent anywhere, or written to local storage. Only the concert the user
// ends up publishing to is saved. See docs/legal/privacidad.md («Tu ubicación»).
//
// Pure parsing, no I/O: the callers in lib/moments.ts hand in what exifr
// returned (photos) or a few bytes of the file (videos).

export type LatLng = { lat: number; lng: number };

const valid = (lat: number, lng: number): LatLng | null => {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  // 0,0 is what a camera writes when it had no fix.
  if (lat === 0 && lng === 0) return null;
  return { lat, lng };
};

// ---- photos (EXIF) ------------------------------------------------------------

const toNumber = (value: unknown) => {
  const number = typeof value === 'string' ? Number(value) : value;
  return typeof number === 'number' && Number.isFinite(number) ? number : null;
};

// [degrees, minutes, seconds] or a plain number.
const fromDms = (value: unknown): number | null => {
  if (Array.isArray(value)) {
    const [degrees, minutes = 0, seconds = 0] = value.map(toNumber);
    if (degrees === null || minutes === null || seconds === null) return null;
    return degrees + minutes / 60 + seconds / 3600;
  }
  return toNumber(value);
};

const signed = (value: number | null, ref: unknown, negative: string) =>
  value === null ? null : typeof ref === 'string' && ref.trim().toUpperCase() === negative ? -Math.abs(value) : value;

/**
 * GPS from what exifr returned: its computed latitude/longitude, or the raw
 * GPSLatitude/GPSLongitude [d, m, s] with their N/S, E/W refs.
 */
export const gpsFromExif = (data: Record<string, unknown> | null | undefined): LatLng | null => {
  if (!data) return null;
  const lat = toNumber(data.latitude);
  const lng = toNumber(data.longitude);
  if (lat !== null && lng !== null) return valid(lat, lng);
  const rawLat = signed(fromDms(data.GPSLatitude), data.GPSLatitudeRef, 'S');
  const rawLng = signed(fromDms(data.GPSLongitude), data.GPSLongitudeRef, 'W');
  return rawLat === null || rawLng === null ? null : valid(rawLat, rawLng);
};

// ---- videos (ISO 6709 in QuickTime / MP4 metadata) ----------------------------

// ±DD[MM[SS]][.d] latitude, ±DDD[MM[SS]][.d] longitude, optional altitude and
// CRS, usually closed with "/". Phones write decimal degrees ("+40.4168-003.7038+650.000/").
const ISO6709 = /^([+-])(\d+(?:\.\d*)?)([+-])(\d+(?:\.\d*)?)(?:[+-]\d+(?:\.\d*)?)?(?:CRS[^/]*)?\/?$/;

const sexagesimal = (digits: string, degreeDigits: number): number | null => {
  const [whole, fraction = ''] = digits.split('.');
  const extra = fraction ? Number(`0.${fraction}`) : 0;
  if (whole.length === degreeDigits) return Number(whole) + extra;
  if (whole.length === degreeDigits + 2) {
    return Number(whole.slice(0, degreeDigits)) + (Number(whole.slice(degreeDigits)) + extra) / 60;
  }
  if (whole.length === degreeDigits + 4) {
    return Number(whole.slice(0, degreeDigits))
      + Number(whole.slice(degreeDigits, degreeDigits + 2)) / 60
      + (Number(whole.slice(degreeDigits + 2)) + extra) / 3600;
  }
  return null;
};

/** "+40.4168-003.7038+650.000/" → { lat: 40.4168, lng: -3.7038 }. */
export const parseIso6709 = (text: string): LatLng | null => {
  const match = ISO6709.exec(text.trim().replace(/\0+$/, ''));
  if (!match) return null;
  const lat = sexagesimal(match[2], 2);
  const lng = sexagesimal(match[4], 3);
  if (lat === null || lng === null) return null;
  return valid(match[1] === '-' ? -lat : lat, match[3] === '-' ? -lng : lng);
};

const ascii = (bytes: Uint8Array, from: number, length: number) => {
  let text = '';
  const end = Math.min(bytes.length, from + length);
  for (let index = from; index < end; index += 1) text += String.fromCharCode(bytes[index]);
  return text;
};

const indexOf = (bytes: Uint8Array, pattern: number[], from = 0) => {
  const last = bytes.length - pattern.length;
  outer: for (let index = from; index <= last; index += 1) {
    for (let offset = 0; offset < pattern.length; offset += 1) {
      if (bytes[index + offset] !== pattern[offset]) continue outer;
    }
    return index;
  }
  return -1;
};

const readUint32 = (bytes: Uint8Array, at: number) =>
  at < 0 || at + 4 > bytes.length ? -1 : ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
const readUint16 = (bytes: Uint8Array, at: number) =>
  at + 2 > bytes.length ? -1 : (bytes[at] << 8) + bytes[at + 1];

const codes = (text: string) => Array.from(text, char => char.charCodeAt(0));
const XYZ = [0xa9, ...codes('xyz')]; // "©xyz"
const DATA = codes('data');
const APPLE_KEY = codes('com.apple.quicktime.location.ISO6709');
const MAX_ISO_LENGTH = 64;

// Payload of a `data` box (iTunes-style metadata): 4 bytes type, 4 locale, value.
const isoFromDataBox = (bytes: Uint8Array, typeAt: number): LatLng | null => {
  const size = readUint32(bytes, typeAt - 4);
  if (size < 17 || size > 16 + MAX_ISO_LENGTH) return null;
  return parseIso6709(ascii(bytes, typeAt + 12, size - 16));
};

/**
 * Location of an MP4/MOV, from a slice of the file (its start or its end: the
 * `moov` box may be at either). Finds:
 * - `©xyz` in `udta`: iPhone (QuickTime) and Android (MediaRecorder) videos;
 *   16-bit length, 16-bit language, then the ISO 6709 string.
 * - `©xyz` as an `ilst` item holding a `data` box.
 * - Apple's `mdta` key "com.apple.quicktime.location.ISO6709", whose value
 *   is a `data` box later in the same `meta`.
 * The slice need not start on a box boundary: it is searched by signature.
 */
export const findMp4Location = (input: ArrayBuffer | Uint8Array): LatLng | null => {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

  for (let at = indexOf(bytes, XYZ); at >= 0; at = indexOf(bytes, XYZ, at + 1)) {
    const boxSize = readUint32(bytes, at - 4);
    const length = readUint16(bytes, at + 4);
    if (length > 0 && length <= MAX_ISO_LENGTH && (boxSize < 0 || boxSize >= 12 + length)) {
      const found = parseIso6709(ascii(bytes, at + 8, length));
      if (found) return found;
    }
    if (ascii(bytes, at + 8, 4) === 'data') {
      const found = isoFromDataBox(bytes, at + 8);
      if (found) return found;
    }
  }

  const key = indexOf(bytes, APPLE_KEY);
  if (key >= 0) {
    // The ilst values follow the keys; a meta box is small.
    const until = Math.min(bytes.length, key + 64 * 1024);
    const region = bytes.subarray(0, until);
    for (let at = indexOf(region, DATA, key); at >= 0; at = indexOf(region, DATA, at + 1)) {
      const found = isoFromDataBox(bytes, at);
      if (found) return found;
    }
  }

  return null;
};

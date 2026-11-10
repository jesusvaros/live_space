import exifr from 'exifr';
import { describe, expect, it } from 'vitest';
import { findMp4Location, gpsFromExif, parseIso6709 } from './mediaLocation';

const bytes = (text: string) => Array.from(text, char => char.charCodeAt(0));
const u32 = (value: number) => [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];
const u16 = (value: number) => [(value >>> 8) & 255, value & 255];
const box = (type: number[], payload: number[]) => [...u32(8 + payload.length), ...type, ...payload];
const XYZ = [0xa9, ...bytes('xyz')];
const noise = (length: number, seed = 7) => Array.from({ length }, (_, index) => (index * 131 + seed) % 251);

// udta/©xyz as written by iPhones (QuickTime) and Android's MediaRecorder.
const udtaXyz = (iso: string) => box(bytes('udta'), box(XYZ, [...u16(iso.length), ...u16(0x15c7), ...bytes(iso)]));
const dataBox = (value: string) => box(bytes('data'), [...u32(1), ...u32(0), ...bytes(value)]);

// A minimal JPEG whose EXIF has DateTimeOriginal and GPS, like a phone photo.
const jpegWithGps = (date: string, lat: number, lng: number) => {
  const tiff = new DataView(new ArrayBuffer(178));
  const raw = new Uint8Array(tiff.buffer);
  raw[0] = 0x4d; raw[1] = 0x4d; tiff.setUint16(2, 42); tiff.setUint32(4, 8);
  const entry = (at: number, tag: number, type: number, count: number, value: number) => {
    tiff.setUint16(at, tag); tiff.setUint16(at + 2, type); tiff.setUint32(at + 4, count); tiff.setUint32(at + 8, value);
  };
  tiff.setUint16(8, 2); entry(10, 0x8769, 4, 1, 38); entry(22, 0x8825, 4, 1, 76);
  tiff.setUint16(38, 1); entry(40, 0x9003, 2, 20, 56);
  for (let index = 0; index < 19; index += 1) raw[56 + index] = date.charCodeAt(index);
  const ref = (at: number, tag: number, letter: string) => {
    tiff.setUint16(at, tag); tiff.setUint16(at + 2, 2); tiff.setUint32(at + 4, 2); raw[at + 8] = letter.charCodeAt(0);
  };
  tiff.setUint16(76, 4);
  ref(78, 1, lat >= 0 ? 'N' : 'S'); entry(90, 2, 5, 3, 130);
  ref(102, 3, lng >= 0 ? 'E' : 'W'); entry(114, 4, 5, 3, 154);
  const rational = (at: number, value: number) => {
    const abs = Math.abs(value);
    const degrees = Math.floor(abs);
    const minutes = Math.floor((abs - degrees) * 60);
    const seconds = Math.round(((abs - degrees) * 60 - minutes) * 60 * 1000);
    [degrees, 1, minutes, 1, seconds, 1000].forEach((part, index) => tiff.setUint32(at + index * 4, part));
  };
  rational(130, lat); rational(154, lng);
  const length = 2 + 6 + raw.length;
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, length >> 8, length & 255, ...bytes('Exif'), 0, 0, ...raw, 0xff, 0xd9]);
};

describe('parseIso6709', () => {
  it('reads decimal degrees with and without altitude', () => {
    expect(parseIso6709('+40.4168-003.7038+650.000/')).toEqual({ lat: 40.4168, lng: -3.7038 });
    expect(parseIso6709('+41.3874+002.1686/')).toEqual({ lat: 41.3874, lng: 2.1686 });
    expect(parseIso6709('-33.8568+151.2153')).toEqual({ lat: -33.8568, lng: 151.2153 });
  });

  it('reads degrees-minutes(-seconds) forms', () => {
    const minutes = parseIso6709('+4025.008-00342.228/');
    expect(minutes?.lat).toBeCloseTo(40.4168, 4);
    expect(minutes?.lng).toBeCloseTo(-3.7038, 4);
    const seconds = parseIso6709('+402500.48-0034213.68/');
    expect(seconds?.lat).toBeCloseTo(40.4168, 4);
    expect(seconds?.lng).toBeCloseTo(-3.7038, 4);
  });

  it('rejects garbage, out-of-range and no-fix values', () => {
    expect(parseIso6709('')).toBeNull();
    expect(parseIso6709('hello')).toBeNull();
    expect(parseIso6709('+95.0000+010.0000/')).toBeNull();
    expect(parseIso6709('+00.0000+000.0000/')).toBeNull();
  });
});

describe('gpsFromExif', () => {
  it('uses exifr latitude/longitude, or the raw DMS with refs', () => {
    expect(gpsFromExif({ latitude: 40.4, longitude: -3.7 })).toEqual({ lat: 40.4, lng: -3.7 });
    const raw = gpsFromExif({ GPSLatitude: [40, 25, 0.48], GPSLatitudeRef: 'N', GPSLongitude: [3, 42, 13.68], GPSLongitudeRef: 'W' });
    expect(raw?.lat).toBeCloseTo(40.4168, 4);
    expect(raw?.lng).toBeCloseTo(-3.7038, 4);
  });

  it('is null without GPS', () => {
    expect(gpsFromExif(null)).toBeNull();
    expect(gpsFromExif({ DateTimeOriginal: new Date() })).toBeNull();
  });

  it('reads a real EXIF block through exifr', async () => {
    const data = await exifr.parse(jpegWithGps('2026:11:08 22:15:30', 40.4168, -3.7038), {
      pick: ['DateTimeOriginal', 'GPSLatitude', 'GPSLatitudeRef', 'GPSLongitude', 'GPSLongitudeRef'],
    });
    const location = gpsFromExif(data);
    expect(location?.lat).toBeCloseTo(40.4168, 4);
    expect(location?.lng).toBeCloseTo(-3.7038, 4);
    expect(data.DateTimeOriginal).toBeInstanceOf(Date);
  });
});

describe('findMp4Location', () => {
  it('finds ©xyz inside moov/udta', () => {
    const file = [
      ...box(bytes('ftyp'), bytes('qt  ')),
      ...box(bytes('moov'), [...box(bytes('mvhd'), noise(100)), ...udtaXyz('+40.4168-003.7038+650.000/')]),
    ];
    expect(findMp4Location(new Uint8Array(file))).toEqual({ lat: 40.4168, lng: -3.7038 });
  });

  it('finds it in a slice that does not start on a box (the end of the file)', () => {
    const tail = [...noise(333), ...udtaXyz('+41.3874+002.1686/'), ...noise(50, 3)];
    expect(findMp4Location(new Uint8Array(tail).buffer)).toEqual({ lat: 41.3874, lng: 2.1686 });
  });

  it('finds ©xyz as an ilst item with a data box', () => {
    const file = box(bytes('ilst'), box(XYZ, dataBox('+39.4699-000.3763/')));
    expect(findMp4Location(new Uint8Array(file))).toEqual({ lat: 39.4699, lng: -0.3763 });
  });

  it('finds Apple mdta com.apple.quicktime.location.ISO6709', () => {
    const key = 'com.apple.quicktime.location.ISO6709';
    const keys = box(bytes('keys'), [...u32(0), ...u32(2), ...box(bytes('mdta'), bytes('com.apple.quicktime.make')), ...box(bytes('mdta'), bytes(key))]);
    const ilst = box(bytes('ilst'), [...box(u32(1), dataBox('Apple')), ...box(u32(2), dataBox('+37.3891-005.9845+012.345/'))]);
    const file = box(bytes('meta'), [...box(bytes('hdlr'), noise(24)), ...keys, ...ilst]);
    expect(findMp4Location(new Uint8Array(file))).toEqual({ lat: 37.3891, lng: -5.9845 });
  });

  it('is null when the video has no location', () => {
    const file = [...box(bytes('ftyp'), bytes('isom')), ...box(bytes('moov'), box(bytes('mvhd'), noise(100)))];
    expect(findMp4Location(new Uint8Array(file))).toBeNull();
    expect(findMp4Location(new Uint8Array(noise(4096)))).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { hasReliableTime } from './concertDetection';
import { momentItemFromGallery, momentItemFromNativePick } from './moments';

describe('momentItemFromGallery', () => {
  it('takes the gallery capture time, thumbnail and length, without a File', () => {
    const item = momentItemFromGallery({
      id: 'video:42',
      kind: 'video',
      createdAt: '2026-10-03T20:05:00.000Z',
      durationSec: 75,
      location: { lat: 40.4, lng: -3.7 },
      thumbnailUri: 'https://localhost/_capacitor_file_/thumb.jpg',
      width: 1080,
      height: 1920,
    });
    expect(item).toMatchObject({
      id: 'gallery:video:42',
      file: null,
      galleryAssetId: 'video:42',
      mediaType: 'video',
      durationSec: 75,
      previewUrl: 'https://localhost/_capacitor_file_/thumb.jpg',
      captureSource: 'gallery',
      location: { lat: 40.4, lng: -3.7 },
    });
    expect(item.captureAt?.toISOString()).toBe('2026-10-03T20:05:00.000Z');
    expect(hasReliableTime([item])).toBe(true);
  });
});

describe('momentItemFromNativePick', () => {
  const picked = {
    kind: 'video' as const,
    path: 'content://media/picker/0/com.android.providers.media.photopicker/media/42',
    mimeType: 'video/mp4',
    sizeBytes: 180_000_000,
    capturedAt: '2026-10-03T20:05:00.000Z',
    durationSeconds: 38.5,
    width: 1920,
    height: 1080,
    location: { latitude: 40.4, longitude: -3.7 },
    thumbnailPath: '/data/ls-uploads/pick-1.jpg',
    previewUri: 'https://localhost/_capacitor_file_/data/ls-uploads/pick-1.jpg',
  };

  it('keeps the native path for the queue and the capture time from the metadata', () => {
    const item = momentItemFromNativePick(picked);
    expect(item).toMatchObject({
      file: null,
      nativePath: picked.path,
      nativeThumbnailPath: picked.thumbnailPath,
      mediaType: 'video',
      durationSec: 38.5,
      previewUrl: picked.previewUri,
      captureSource: 'video.metadata',
      location: { lat: 40.4, lng: -3.7 },
    });
    expect(item.captureAt?.toISOString()).toBe('2026-10-03T20:05:00.000Z');
    expect(hasReliableTime([item])).toBe(true);
  });

  it('falls back to a manual time when the file has no date', () => {
    const item = momentItemFromNativePick({ ...picked, kind: 'image', capturedAt: null, durationSeconds: 0, location: null });
    expect(item).toMatchObject({ mediaType: 'image', captureSource: 'manual', durationSec: null, location: null });
    expect(hasReliableTime([item])).toBe(false);
  });
});

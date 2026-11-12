import { describe, expect, it } from 'vitest';
import { hasReliableTime } from './concertDetection';
import { momentItemFromGallery } from './moments';

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

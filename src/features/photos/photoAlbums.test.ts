import { describe, expect, it } from 'vitest';
import type { TimelineMoment } from '../moments/concertTimeline';
import {
  ALL_ALBUM_ID,
  cloudinaryResized,
  concertPhotos,
  groupPhotoAlbums,
  neighbourIndexes,
  photoCredit,
  photoThumbUrl,
  withoutHidden,
} from './photoAlbums';

let seq = 0;
const moment = (overrides: Partial<TimelineMoment>): TimelineMoment => {
  seq += 1;
  return {
    id: `m${seq}`,
    userId: 'u-lucia',
    userName: 'lucia',
    mediaType: 'image',
    mediaUrl: `https://res.cloudinary.com/live/image/upload/v1/p${seq}.jpg`,
    thumbnailUrl: null,
    capturedAt: `2026-10-10T21:${String(seq % 60).padStart(2, '0')}:00.000Z`,
    createdAt: '2026-10-11T10:00:00.000Z',
    songId: null,
    ...overrides,
  };
};

describe('concertPhotos', () => {
  it('keeps uploaded photos only, in capture order', () => {
    const late = moment({ capturedAt: '2026-10-10T22:30:00.000Z' });
    const early = moment({ capturedAt: '2026-10-10T20:10:00.000Z' });
    const video = moment({ mediaType: 'video', mediaUrl: 'https://cdn.test/v.mp4' });
    const imported = moment({ external: true });
    expect(concertPhotos([late, video, early, imported]).map(item => item.id)).toEqual([early.id, late.id]);
  });

  it('orders photos without a capture time by upload time', () => {
    const noCapture = moment({ capturedAt: null, createdAt: '2026-10-10T20:05:00.000Z' });
    const captured = moment({ capturedAt: '2026-10-10T20:00:00.000Z' });
    expect(concertPhotos([noCapture, captured]).map(item => item.id)).toEqual([captured.id, noCapture.id]);
  });
});

describe('groupPhotoAlbums', () => {
  it('is empty without photos', () => {
    expect(groupPhotoAlbums([moment({ mediaType: 'video' })], null)).toEqual([]);
  });

  it('puts «Todas» first, then yours, then the biggest albums', () => {
    const photos = [
      moment({ userId: 'u-ana', userName: 'ana' }),
      moment({ userId: 'u-bea', userName: 'bea' }),
      moment({ userId: 'u-bea', userName: 'bea' }),
      moment({ userId: 'u-me', userName: 'yo' }),
      moment({ userId: 'u-carla', userName: 'carla' }),
    ];
    const albums = groupPhotoAlbums(photos, 'u-me');
    expect(albums.map(album => album.id)).toEqual([ALL_ALBUM_ID, 'u-me', 'u-bea', 'u-ana', 'u-carla']);
    expect(albums[0].photos).toHaveLength(5);
    expect(albums[1]).toMatchObject({ label: 'Tus fotos', isMe: true });
    expect(albums[2]).toMatchObject({ label: '@bea' });
    expect(albums[2].photos).toHaveLength(2);
  });

  it('labels people without a name as anónimo', () => {
    const albums = groupPhotoAlbums([moment({ userId: 'u-x', userName: null })], null);
    expect(albums[1].label).toBe('@anónimo');
  });
});

describe('withoutHidden', () => {
  it('drops the posts this viewer hid', () => {
    const items = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    expect(withoutHidden(items, new Set(['b']), item => item.id).map(item => item.id)).toEqual(['a', 'c']);
  });

  it('returns the same list when nothing is hidden', () => {
    const items = [{ id: 'a' }];
    expect(withoutHidden(items, new Set(), item => item.id)).toBe(items);
  });
});

describe('image URLs', () => {
  it('asks Cloudinary for a resized copy', () => {
    expect(cloudinaryResized('https://res.cloudinary.com/live/image/upload/v1/a.jpg', 360)).toBe(
      'https://res.cloudinary.com/live/image/upload/w_360,c_limit,q_auto,f_auto/v1/a.jpg',
    );
  });

  it('leaves other hosts alone', () => {
    expect(cloudinaryResized('https://media.example.com/a.jpg', 360)).toBe('https://media.example.com/a.jpg');
  });

  it('falls back to the stored thumbnail outside Cloudinary', () => {
    expect(photoThumbUrl({ mediaUrl: 'https://media.example.com/a.jpg', thumbnailUrl: 'https://media.example.com/t.jpg' })).toBe(
      'https://media.example.com/t.jpg',
    );
  });
});

describe('photoCredit', () => {
  it('is @user · hora', () => {
    const credit = photoCredit({ userName: 'lucia', capturedAt: '2026-10-10T21:39:00.000Z', createdAt: '2026-10-11T10:00:00.000Z' });
    expect(credit.startsWith('@lucia · ')).toBe(true);
    expect(credit).toMatch(/\d{2}:\d{2}$/);
  });
});

describe('neighbourIndexes', () => {
  it('keeps the current slide and one each side, inside the list', () => {
    expect(neighbourIndexes(0, 5)).toEqual([0, 1]);
    expect(neighbourIndexes(2, 5)).toEqual([1, 2, 3]);
    expect(neighbourIndexes(4, 5)).toEqual([3, 4]);
    expect(neighbourIndexes(0, 0)).toEqual([]);
  });
});

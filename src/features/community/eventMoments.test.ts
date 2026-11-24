import { describe, expect, it } from 'vitest';
import { creditLine, downloadableFiles, momentDownloadName, type ManagedMoment } from './eventMoments';

const moment = (over: Partial<ManagedMoment>): ManagedMoment => ({
  post_id: 'p',
  author_id: 'a',
  credit: '@lucia',
  created_at: '2026-11-20T22:00:00Z',
  resource_type: 'video',
  format: 'mp4',
  thumbnail_url: null,
  media_url: 'https://media.example/v/1.mp4',
  allow_reuse: true,
  hidden: false,
  open_reports: 0,
  ...over,
});

describe('momentDownloadName', () => {
  it('carries the concert and the credit in the name', () => {
    expect(momentDownloadName('Love of Lesbian', moment({}), 0)).toBe('livespace_love-of-lesbian_01_@lucia.mp4');
  });

  it('falls back to jpg for images without a known format and cleans the handle', () => {
    expect(momentDownloadName('Sala Apolo', moment({ credit: '@sara bcn!', format: null, resource_type: 'image' }), 11)).toBe(
      'livespace_sala-apolo_12_@sarabcn.jpg',
    );
  });
});

describe('downloadableFiles', () => {
  it('only lists moments whose licence allows reuse', () => {
    const files = downloadableFiles('Concierto', [
      moment({ post_id: 'a' }),
      moment({ post_id: 'b', allow_reuse: false, media_url: null }),
      moment({ post_id: 'c', media_url: null }),
    ]);
    expect(files).toHaveLength(1);
    expect(files[0].url).toBe('https://media.example/v/1.mp4');
  });
});

describe('creditLine', () => {
  it('names every author once', () => {
    expect(creditLine([moment({}), moment({ credit: '@marcos' }), moment({})])).toBe('📹 @lucia @marcos vía Live Space');
  });

  it('is empty without moments', () => {
    expect(creditLine([])).toBe('');
  });
});

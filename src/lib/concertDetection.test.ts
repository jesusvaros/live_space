import { describe, expect, it } from 'vitest';
import { detectConcert, hasReliableTime, rankConcerts, type DetectionCandidate, type DetectionMedia } from './concertDetection';

// Two Madrid venues ~1.3 km apart and one in Barcelona.
const RIVIERA = { lat: 40.4133, lng: -3.7265 };
const LARIVIERA_DOOR = { lat: 40.4138, lng: -3.7262 }; // ~60 m
const WIZINK = { lat: 40.4241, lng: -3.6716 };
const RAZZ = { lat: 41.3976, lng: 2.1911 };
const NEAR_WIZINK = { lat: 40.4251, lng: -3.6800 }; // ~720 m from WiZink
const ATOCHA = { lat: 40.4065, lng: -3.6895 }; // a few km from both

const at = (iso: string) => new Date(iso);
const shot = (iso: string, location: DetectionMedia['location'] = null, captureSource = 'exif'): DetectionMedia => ({
  captureAt: at(iso),
  captureSource,
  location,
});
const concert = (
  id: string,
  startsAt: string,
  venue: DetectionCandidate<string>['venue'],
  local = true,
  endsAt: string | null = null,
): DetectionCandidate<string> => ({ event: id, startsAt, endsAt, venue, local });

describe('detectConcert', () => {
  it('keeps detecting by time when the media has no GPS', () => {
    const result = detectConcert(
      [shot('2026-11-08T21:30:00Z'), shot('2026-11-08T21:45:00Z')],
      [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA), concert('other-day', '2026-11-06T21:00:00Z', WIZINK)],
    );
    expect(result).toEqual({ event: 'riviera', reason: 'time', confidence: 'high' });
  });

  it('lets the place decide between two concerts at the same time in the same city', () => {
    const candidates = [
      concert('riviera', '2026-11-08T21:00:00Z', RIVIERA),
      concert('wizink', '2026-11-08T21:00:00Z', WIZINK),
    ];
    expect(detectConcert([shot('2026-11-08T21:30:00Z', WIZINK)], candidates)).toMatchObject({ event: 'wizink', reason: 'time-place' });
    expect(detectConcert([shot('2026-11-08T21:30:00Z', LARIVIERA_DOOR)], candidates)).toMatchObject({ event: 'riviera', reason: 'time-place' });
    // Within 2 km of one venue only: a weak match still decides.
    expect(detectConcert([shot('2026-11-08T21:30:00Z', NEAR_WIZINK)], candidates)).toMatchObject({ event: 'wizink', reason: 'time-place' });
  });

  it('prefers the venue where it was taken over a slightly better time fit elsewhere', () => {
    const result = detectConcert(
      [shot('2026-11-08T18:30:00Z', RIVIERA)],
      [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA), concert('wizink', '2026-11-08T19:00:00Z', WIZINK)],
    );
    expect(result).toMatchObject({ event: 'riviera', reason: 'time-place' });
  });

  it('never picks a concert in another city, even if the time fits', () => {
    const result = detectConcert(
      [shot('2026-11-08T21:30:00Z', RAZZ)],
      [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA), concert('wizink', '2026-11-08T21:00:00Z', WIZINK)],
    );
    expect(result).toBeNull();
  });

  it('falls back to time when the place is in town but at no venue, penalising nearby venues', () => {
    const candidates = [
      concert('riviera', '2026-11-08T21:00:00Z', RIVIERA),
      concert('no-pin', '2026-11-08T21:00:00Z', null),
    ];
    // A few km away from Riviera: the concert without coordinates ranks above it.
    expect(detectConcert([shot('2026-11-08T21:30:00Z', ATOCHA)], candidates)).toEqual({ event: 'no-pin', reason: 'time', confidence: 'high' });
    // Only the penalised one: still suggested by time.
    expect(detectConcert([shot('2026-11-08T21:30:00Z', ATOCHA)], [candidates[0]])).toEqual({ event: 'riviera', reason: 'time', confidence: 'high' });
  });

  it('uses what most of the media says when locations are mixed', () => {
    const media = [
      shot('2026-11-08T21:10:00Z', WIZINK),
      shot('2026-11-08T21:20:00Z', WIZINK),
      shot('2026-11-08T21:30:00Z', RIVIERA), // one outlier
      shot('2026-11-08T21:40:00Z', null), // no GPS
      shot('2026-11-08T21:50:00Z', WIZINK),
    ];
    const result = detectConcert(media, [
      concert('riviera', '2026-11-08T21:00:00Z', RIVIERA),
      concert('wizink', '2026-11-08T21:00:00Z', WIZINK),
    ]);
    expect(result).toMatchObject({ event: 'wizink', reason: 'time-place' });
  });

  it('a photo from home among the concert ones does not rule the concert out', () => {
    const media = [shot('2026-11-08T21:10:00Z', WIZINK), shot('2026-11-08T21:20:00Z', WIZINK), shot('2026-11-08T21:30:00Z', RAZZ)];
    expect(detectConcert(media, [concert('wizink', '2026-11-08T21:00:00Z', WIZINK)])).toMatchObject({ event: 'wizink', reason: 'time-place' });
  });

  it('with an unreliable time, suggests the concert at that venue within a day, less sure', () => {
    // File date: saved a day later (copied from WhatsApp, say).
    const media = [shot('2026-11-09T15:00:00Z', WIZINK, 'file.lastModified')];
    const result = detectConcert(media, [
      concert('riviera', '2026-11-09T14:00:00Z', RIVIERA),
      concert('wizink', '2026-11-08T21:00:00Z', WIZINK),
    ]);
    expect(result).toEqual({ event: 'wizink', reason: 'place', confidence: 'low' });
  });

  it('with an unreliable time and no venue within a day, keeps the old time-only guess', () => {
    const media = [shot('2026-11-08T21:30:00Z', null, 'file.lastModified')];
    const result = detectConcert(media, [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA)]);
    expect(result).toEqual({ event: 'riviera', reason: 'time', confidence: 'low' });
    const far = [shot('2026-11-12T21:30:00Z', WIZINK, 'file.lastModified')];
    expect(detectConcert(far, [concert('wizink', '2026-11-08T21:00:00Z', WIZINK)])).toBeNull();
  });

  it('ignores file dates when some media has a real capture time', () => {
    const media = [shot('2026-11-08T21:30:00Z'), shot('2026-11-10T09:00:00Z', null, 'file.lastModified')];
    expect(hasReliableTime(media)).toBe(true);
    expect(detectConcert(media, [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA)])).toMatchObject({ event: 'riviera', confidence: 'high' });
  });

  it('breaks a time tie with the user city when the place says nothing', () => {
    const result = detectConcert(
      [shot('2026-11-08T21:30:00Z')],
      [concert('bcn', '2026-11-08T21:00:00Z', RAZZ, false), concert('mad', '2026-11-08T21:00:00Z', RIVIERA, true)],
    );
    expect(result?.event).toBe('mad');
  });

  it('returns nothing when no concert fits', () => {
    expect(detectConcert([shot('2026-11-08T21:30:00Z')], [concert('later', '2026-11-09T21:00:00Z', RIVIERA)])).toBeNull();
    expect(detectConcert([], [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA)])).toBeNull();
  });
});

describe('rankConcerts', () => {
  it('lists every concert that fits, best first, so the user can pick another', () => {
    const ranked = rankConcerts(
      [shot('2026-11-08T21:30:00Z', LARIVIERA_DOOR)],
      [
        concert('wizink', '2026-11-08T21:00:00Z', WIZINK),
        concert('riviera-late', '2026-11-08T23:00:00Z', RIVIERA),
        concert('riviera', '2026-11-08T21:00:00Z', RIVIERA),
        concert('razz', '2026-11-08T21:00:00Z', RAZZ),
      ],
    );
    // Both Riviera gigs fit (a real tie: the user picks); the far venue comes last; Barcelona never.
    const events = ranked.map(match => match.event);
    expect(events).toHaveLength(3);
    expect(events.slice(0, 2).sort()).toEqual(['riviera', 'riviera-late']);
    expect(events[2]).toBe('wizink');
    expect(ranked[0].reason).toBe('time-place');
  });

  it('is empty when nothing fits', () => {
    expect(rankConcerts([shot('2026-11-08T21:30:00Z', RAZZ)], [concert('riviera', '2026-11-08T21:00:00Z', RIVIERA)])).toEqual([]);
  });
});

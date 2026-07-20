import { describe, expect, it } from 'vitest';
import { mapArtist, mapEvent, mapProfile, mapVenue } from './canonicalMappers';

describe('canonical Supabase row mappers', () => {
  it('maps application roles without reviving legacy professional profile roles', () => {
    expect(mapProfile({ id: 'p1', app_role: 'moderator' }, 's1')).toMatchObject({
      id: 'p1',
      subject_id: 's1',
      role: 'user',
      is_verified: true,
    });
  });

  it('maps read-model media and numeric coordinates', () => {
    expect(mapArtist({ artist_id: 'a1', name: 'Artist', avatar_url: 'https://img' })).toMatchObject({
      id: 'a1',
      avatar_url: 'https://img',
    });
    expect(mapVenue({ venue_place_id: 'v1', name: 'Sala', city: 'Madrid', latitude: '40.4', photos: ['x'] })).toMatchObject({
      id: 'v1',
      latitude: 40.4,
      photos: ['x'],
    });
  });

  it('maps canonical publication fields to the current UI contract', () => {
    expect(mapEvent({ id: 'e1', name: 'Live', city: 'Madrid', starts_at: '2026-07-18T20:00:00Z', status: 'published', created_by: 'p1' })).toMatchObject({
      id: 'e1',
      organizer_id: 'p1',
      is_public: true,
    });
  });
});

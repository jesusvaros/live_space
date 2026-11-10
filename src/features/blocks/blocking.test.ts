import { describe, expect, it } from 'vitest';
import { blockTargetLabel, withoutBlocked } from './blocking';

const posts = [
  { id: 'a', user_id: 'u1' },
  { id: 'b', user_id: 'u2' },
  { id: 'c', user_id: null },
  { id: 'd', user_id: 'u1' },
];

describe('withoutBlocked', () => {
  it('drops everything by a blocked author and keeps the rest in order', () => {
    expect(withoutBlocked(posts, new Set(['u1']), post => post.user_id).map(post => post.id)).toEqual(['b', 'c']);
  });

  it('returns the same list when nobody is blocked', () => {
    expect(withoutBlocked(posts, new Set(), post => post.user_id)).toBe(posts);
  });

  it('keeps items without an author (imported clips, catalogue)', () => {
    expect(withoutBlocked(posts, new Set(['u1', 'u2']), post => post.user_id).map(post => post.id)).toEqual(['c']);
  });
});

describe('blockTargetLabel', () => {
  it('prefers @username, then the display name', () => {
    expect(blockTargetLabel({ username: 'ana', display_name: 'Ana' })).toBe('@ana');
    expect(blockTargetLabel({ username: null, display_name: 'Ana' })).toBe('Ana');
    expect(blockTargetLabel(null)).toBe('esta persona');
  });
});

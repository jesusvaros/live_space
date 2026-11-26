import { beforeEach, describe, expect, it, vi } from 'vitest';

const caches = vi.hoisted(() => ({ invalidateQueries: vi.fn(), clearCached: vi.fn() }));
vi.mock('../../lib/supabase', () => ({ supabase: {} }));
vi.mock('../../lib/queryClient', () => ({ invalidateQueries: caches.invalidateQueries }));
vi.mock('../../lib/requestCache', () => ({ clearCached: caches.clearCached }));

import { isNewOthersPost, newMomentsLabel, notifyOwnPostPublished, onOwnPostPublished } from './livePosts';

beforeEach(() => {
  caches.invalidateQueries.mockClear();
  caches.clearCached.mockClear();
});

describe('notifyOwnPostPublished', () => {
  it('drops the cached reads that include the post and tells every screen listening', () => {
    const concert = vi.fn();
    const profile = vi.fn();
    const stopConcert = onOwnPostPublished(concert);
    const stopProfile = onOwnPostPublished(profile);
    const post = { postId: 'p1', eventId: 'e1', authorId: 'u1' };

    notifyOwnPostPublished(post);
    expect(caches.invalidateQueries).toHaveBeenCalledWith('["profile:data"');
    expect(caches.clearCached).toHaveBeenCalledWith('posts:count:user:');
    expect(concert).toHaveBeenCalledWith(post);
    expect(profile).toHaveBeenCalledWith(post);

    stopConcert();
    notifyOwnPostPublished(post);
    expect(concert).toHaveBeenCalledTimes(1);
    expect(profile).toHaveBeenCalledTimes(2);
    stopProfile();
  });

  it('keeps telling the other screens when one throws', () => {
    const broken = onOwnPostPublished(() => {
      throw new Error('unmounted');
    });
    const fine = vi.fn();
    const stop = onOwnPostPublished(fine);
    expect(() => notifyOwnPostPublished({ postId: 'p1', eventId: 'e1', authorId: 'u1' })).not.toThrow();
    expect(fine).toHaveBeenCalled();
    broken();
    stop();
  });
});

describe('isNewOthersPost', () => {
  const seen = new Set<string>(['old']);
  const base = { currentUserId: 'me', seen };

  it('announces a published post by someone else', () => {
    expect(isNewOthersPost({ id: 'p1', author_id: 'other', event_id: 'e1', status: 'published' }, base)).toBe(true);
  });

  it('skips my own posts (they reload by themselves), drafts, repeats and empty rows', () => {
    expect(isNewOthersPost({ id: 'p1', author_id: 'me', status: 'published' }, base)).toBe(false);
    expect(isNewOthersPost({ id: 'p1', author_id: 'other', status: 'review' }, base)).toBe(false);
    expect(isNewOthersPost({ id: 'old', author_id: 'other', status: 'published' }, base)).toBe(false);
    expect(isNewOthersPost({}, base)).toBe(false);
    expect(isNewOthersPost(null, base)).toBe(false);
  });

  it('only counts the watched concert', () => {
    const row = { id: 'p1', author_id: 'other', event_id: 'e2', status: 'published' };
    expect(isNewOthersPost(row, { ...base, eventId: 'e1' })).toBe(false);
    expect(isNewOthersPost(row, { ...base, eventId: 'e2' })).toBe(true);
  });

  it('counts everything for someone signed out', () => {
    expect(isNewOthersPost({ id: 'p1', author_id: 'other', status: 'published' }, { currentUserId: null, seen })).toBe(true);
  });
});

describe('newMomentsLabel', () => {
  it('says it in Spanish', () => {
    expect(newMomentsLabel(1)).toBe('1 momento nuevo');
    expect(newMomentsLabel(4)).toBe('4 momentos nuevos');
    expect(newMomentsLabel(4, false)).toBe('Momentos nuevos');
  });
});

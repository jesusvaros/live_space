import { describe, expect, it } from 'vitest';
import { FIRST_PAST_PAGE, PAST_PAGE, emptyPastConcerts, mergePastPage, momentCountLabel, nextPastPageSize } from './pastConcerts';

const concerts = (...ids: string[]) => ids.map(id => ({ id }));

describe('mergePastPage', () => {
  it('a full first page: listed, loaded, maybe more', () => {
    const state = mergePastPage(emptyPastConcerts<{ id: string }>(), concerts('a', 'b', 'c'), new Map(), 3);
    expect(state.items.map(item => item.id)).toEqual(['a', 'b', 'c']);
    expect(state.hasMore).toBe(true);
    expect(state.loaded).toBe(true);
  });

  it('a short page ends the list, an empty one too', () => {
    expect(mergePastPage(emptyPastConcerts<{ id: string }>(), concerts('a'), {}, 3).hasMore).toBe(false);
    const empty = mergePastPage(emptyPastConcerts<{ id: string }>(), [], {}, 3);
    expect(empty).toEqual({ items: [], stats: {}, hasMore: false, loaded: true });
  });

  it('appends in order and drops a concert already listed (offsets moved)', () => {
    const first = mergePastPage(emptyPastConcerts<{ id: string }>(), concerts('a', 'b', 'c'), {}, 3);
    const second = mergePastPage(first, concerts('c', 'd', 'd'), {}, 3);
    expect(second.items.map(item => item.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(second.hasMore).toBe(true);
  });

  it('keeps the moment stats of every page, only for concerts with moments', () => {
    const first = mergePastPage(
      emptyPastConcerts<{ id: string }>(),
      concerts('a', 'b'),
      new Map([
        ['a', { count: 3, latestThumbnailUrl: 'https://x/a.jpg' }],
        ['b', { count: 0, latestThumbnailUrl: null }],
      ]),
      2,
    );
    const second = mergePastPage(first, concerts('c'), { c: { count: 1, latestThumbnailUrl: null } }, 2);
    expect(second.stats).toEqual({
      a: { count: 3, latestThumbnailUrl: 'https://x/a.jpg' },
      c: { count: 1, latestThumbnailUrl: null },
    });
  });
});

describe('nextPastPageSize', () => {
  it('a short first page, then full pages', () => {
    expect(nextPastPageSize(0)).toBe(FIRST_PAST_PAGE);
    expect(nextPastPageSize(FIRST_PAST_PAGE)).toBe(PAST_PAGE);
    expect(nextPastPageSize(FIRST_PAST_PAGE + PAST_PAGE)).toBe(PAST_PAGE);
  });
});

describe('momentCountLabel', () => {
  it('singular and plural', () => {
    expect(momentCountLabel(1)).toBe('1 momento');
    expect(momentCountLabel(12)).toBe('12 momentos');
  });
});

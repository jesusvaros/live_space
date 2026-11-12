import { afterEach, describe, expect, it } from 'vitest';
import { canGoBack, nextNavigationStack, resetNavigationStack, trackNavigation } from './useGoBack';

describe('in-app back history', () => {
  afterEach(resetNavigationStack);

  it('venue → concert → back lands on the venue, not home', () => {
    trackNavigation('POP', 'home'); // first render
    expect(canGoBack()).toBe(false);
    trackNavigation('PUSH', 'venue');
    trackNavigation('PUSH', 'event');
    expect(canGoBack()).toBe(true);
    trackNavigation('POP', 'venue');
    expect(canGoBack()).toBe(true);
    trackNavigation('POP', 'home');
    expect(canGoBack()).toBe(false);
  });

  it('artist → concert → venue walks back in that order', () => {
    let stack = nextNavigationStack([], 'POP', 'artist');
    stack = nextNavigationStack(stack, 'PUSH', 'event');
    stack = nextNavigationStack(stack, 'PUSH', 'venue');
    expect(stack).toEqual(['artist', 'event', 'venue']);
    stack = nextNavigationStack(stack, 'POP', 'event');
    expect(stack).toEqual(['artist', 'event']);
    stack = nextNavigationStack(stack, 'POP', 'artist');
    expect(stack).toEqual(['artist']);
  });

  it('a replace does not add a step; a deep link has nothing behind it', () => {
    let stack = nextNavigationStack([], 'POP', 'qr');
    stack = nextNavigationStack(stack, 'REPLACE', 'upload');
    expect(stack).toEqual(['upload']);
    stack = nextNavigationStack(stack, 'POP', 'forward');
    expect(stack).toEqual(['upload', 'forward']);
  });
});

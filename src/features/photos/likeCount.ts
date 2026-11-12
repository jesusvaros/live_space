/**
 * Like count to show for a post: the count loaded with the concert, moved by
 * what this person changed since (liking it adds one, unliking removes one).
 */
export const likesShown = (loaded: number, likedWhenLoaded: boolean, likedNow: boolean) =>
  Math.max(0, loaded + (likedNow ? 1 : 0) - (likedWhenLoaded ? 1 : 0));

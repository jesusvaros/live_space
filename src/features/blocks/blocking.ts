// Blocking between people (user_blocks). The database is the guarantee:
// posts_read hides every post whose author and reader block each other, and
// every moment list reads posts through security_invoker views
// (v_post_cards, v_event_posts_with_setlist), so a fresh fetch never returns
// them. This helper only hides what a screen had already loaded when the
// block happened, so the content goes away at once without a refetch.

export const withoutBlocked = <T>(
  items: readonly T[],
  blocked: ReadonlySet<string>,
  authorOf: (item: T) => string | null | undefined,
): T[] => {
  if (blocked.size === 0) return items as T[];
  return items.filter(item => {
    const author = authorOf(item);
    return !author || !blocked.has(author);
  });
};

/** "@usuario" when there is a username, else the display name, else "esta persona". */
export const blockTargetLabel = (profile: { username?: string | null; display_name?: string | null } | null | undefined) =>
  profile?.username ? `@${profile.username}` : profile?.display_name || 'esta persona';

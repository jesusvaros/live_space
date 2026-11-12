// Seamless cuts between clips in the concert player. Pure, so the player and
// the tests share the same rules.
//
// A <video> only takes the screen once it has really shown a frame at the
// right time; until then the outgoing one stays on screen (frozen on its last
// frame). Then the incoming one fades in over CROSSFADE_MS, which also hides
// the one compositor frame a just-revealed video may still need.

/** Fade of the incoming video over the outgoing one. */
export const CROSSFADE_MS = 140;
/** Never hold the outgoing picture longer than this: show the new clip (and its spinner). */
export const HANDOFF_TIMEOUT_MS = 1500;
/** How far the decoded frame may be from where the concert is (seconds). */
export const FRAME_TOLERANCE_SEC = 0.5;
/** Below this the video is close enough to its target: no new seek. */
export const SEEK_TOLERANCE_SEC = 0.35;

export type FrameState = {
  // HTMLMediaElement.readyState: 2 = HAVE_CURRENT_DATA (a frame is decoded).
  readyState: number;
  seeking: boolean;
  currentTime: number;
  // A frame was presented since the last seek: requestVideoFrameCallback
  // where available, else `seeked`/`loadeddata`/`playing`/`timeupdate`.
  presented: boolean;
};

/** Whether a video can take the screen: a frame at `targetSec` is on it. */
export const frameReadyAt = (state: FrameState, targetSec: number, tolerance = FRAME_TOLERANCE_SEC) =>
  state.presented
  && !state.seeking
  && state.readyState >= 2
  && Math.abs(state.currentTime - targetSec) <= tolerance;

/**
 * Which video stays on screen while `nextId` gets its first frame: the one
 * the viewer is looking at now — the previous clip if it was already showing,
 * else whatever was being handed off from — and none if that is `nextId`
 * itself or the next clip is not a video.
 */
export const handoffSource = (options: {
  previousId: string | null;
  previousIsVideo: boolean;
  revealedId: string | null;
  handoffId: string | null;
  nextId: string | null;
  nextIsVideo: boolean;
}): string | null => {
  const { previousId, previousIsVideo, revealedId, handoffId, nextId, nextIsVideo } = options;
  if (!nextIsVideo || !nextId) return null;
  const onScreen = previousIsVideo && previousId && revealedId === previousId ? previousId : handoffId;
  return onScreen && onScreen !== nextId ? onScreen : null;
};

/**
 * The <video> elements to keep mounted, at most two: the clip on screen plus,
 * during a handoff, the outgoing one; otherwise the next clip, preloading.
 * Elements already mounted keep their order (`previousOrder`): moving a
 * <video> in the DOM pauses it.
 */
export const videoSlots = <T extends { id: string; kind: string }>(
  active: T | null,
  upcoming: T | null,
  handoff: T | null,
  previousOrder: readonly string[] = [],
): T[] => {
  const slots: T[] = [];
  const add = (clip: T | null) => {
    if (clip && clip.kind === 'video' && !slots.some(other => other.id === clip.id)) slots.push(clip);
  };
  add(handoff);
  add(active);
  if (!handoff || handoff.kind !== 'video') add(upcoming);
  const rank = (clip: T) => {
    const index = previousOrder.indexOf(clip.id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return slots.slice(0, 2).sort((left, right) => rank(left) - rank(right));
};

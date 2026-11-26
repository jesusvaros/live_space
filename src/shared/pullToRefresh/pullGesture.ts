// The finger logic of pull-to-refresh, without the DOM, so it can be tested.
//
// A pull only starts when the list is at its very top and the finger moves
// mostly downwards: scrolling up, a horizontal carousel or a list that is
// already scrolled are left alone. The distance follows the finger with
// resistance (less and less the further it goes) up to MAX_PULL.

/** Pulled at least this far (after resistance) when the finger lifts: refresh. */
export const PULL_THRESHOLD = 64;
/** The indicator never goes further than this. */
export const MAX_PULL = 110;
/** Finger travel before deciding whether this is a pull, a scroll or a swipe. */
const DECIDE_AFTER = 8;

/**
 * Finger travel → indicator distance: about 0.6 px per px at first, then
 * flattening towards MAX_PULL (never past it). The threshold takes ~160 px.
 */
export const pullDistance = (fingerDy: number) => {
  if (fingerDy <= 0) return 0;
  return Math.round(MAX_PULL * (1 - Math.exp(-fingerDy / 180)));
};

type Phase = 'idle' | 'undecided' | 'pulling' | 'ignored';

export type PullMove = {
  /** Indicator distance, 0 when not pulling. */
  distance: number;
  /** Stop the browser from scrolling or bouncing: this move is the pull. */
  preventDefault: boolean;
};

export class PullGesture {
  private phase: Phase = 'idle';
  private startX = 0;
  private startY = 0;
  private distance = 0;

  /** `atTop`: the scroller (and anything scrollable under the finger) is at scrollTop 0. */
  start(x: number, y: number, atTop: boolean) {
    this.startX = x;
    this.startY = y;
    this.distance = 0;
    this.phase = atTop ? 'undecided' : 'ignored';
  }

  /** `atTop` again: momentum may have moved the list since the finger went down. */
  move(x: number, y: number, atTop: boolean): PullMove {
    const dx = x - this.startX;
    const dy = y - this.startY;
    if (this.phase === 'undecided') {
      if (Math.abs(dx) < DECIDE_AFTER && Math.abs(dy) < DECIDE_AFTER) return { distance: 0, preventDefault: false };
      // Down, mostly vertical, still at the top: a pull. Anything else is a scroll or a swipe.
      this.phase = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 && atTop ? 'pulling' : 'ignored';
    }
    if (this.phase !== 'pulling') return { distance: 0, preventDefault: false };
    this.distance = pullDistance(dy - DECIDE_AFTER);
    // Back above where it started: let the list scroll normally again.
    return { distance: this.distance, preventDefault: dy > 0 };
  }

  /** The finger lifted (or the touch was cancelled): refresh or not. */
  end(): boolean {
    const refresh = this.phase === 'pulling' && this.distance >= PULL_THRESHOLD;
    this.phase = 'idle';
    this.distance = 0;
    return refresh;
  }

  get pulling() {
    return this.phase === 'pulling';
  }
}

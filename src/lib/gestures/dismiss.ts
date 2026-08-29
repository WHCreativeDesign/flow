/*
  The universal exit gesture — interactive dismissal, iOS-style.

  Drag up from the bottom edge and the app follows your finger, shrinking
  back toward the point it bloomed from. What happens on release is decided
  the way a physical object would decide it: by where the gesture is *going*,
  not only where it ended. A fast flick from an inch up dismisses; the same
  inch travelled slowly and released does not.

  The action only measures and reports. The view owns what the motion looks
  like, so the transform work stays in one place and off the reactive path.
*/

export interface DragSample {
  /** upward travel in px, rubber-banded past the screen */
  travel: number;
  /** horizontal drift in px — the app leans with your thumb */
  drift: number;
  /** 0..1 toward a committed dismissal */
  progress: number;
}

export interface DismissRelease {
  /** upward speed at release, px/ms */
  velocity: number;
  travel: number;
  /** how far it still has to go to be gone, px */
  remaining: number;
}

export interface DismissOptions {
  onstart?: () => void;
  onmove?: (s: DragSample) => void;
  /** committed: finish the dismissal, then unmount */
  ondismiss?: (r: DismissRelease) => void;
  /** not committed: settle back to full screen */
  oncancel?: (r: DismissRelease) => void;
  /** height of the capture zone at the bottom edge, px */
  zone?: number;
}

/** past this, the gesture reads as a flick regardless of distance (px/ms) */
const FLICK_VELOCITY = 0.45;
/** how far ahead the release velocity is projected when deciding (ms) */
const PROJECTION_MS = 110;
/** fraction of screen height that counts as a committed drag */
const COMMIT_FRACTION = 0.28;
/** ignore a drag that is mostly sideways */
const DIRECTION_RATIO = 1.2;

export function dismissGesture(node: HTMLElement, options: DismissOptions) {
  let opts = options;
  let active = false;
  let engaged = false;
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  // a short trail of recent points — velocity from the last ~80ms of motion,
  // not from the whole gesture, so a pause before release reads as a stop
  let trail: Array<{ t: number; y: number }> = [];

  const zone = () => opts.zone ?? 48;
  const commitDistance = () => window.innerHeight * COMMIT_FRACTION;

  function velocityNow(): number {
    const now = performance.now();
    const recent = trail.filter((p) => now - p.t < 90);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (first.y - last.y) / dt : 0;
  }

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.clientY < window.innerHeight - zone()) return;
    active = true;
    engaged = false;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
    trail = [{ t: performance.now(), y: e.clientY }];
  }

  function move(e: PointerEvent) {
    if (!active || e.pointerId !== pointerId) return;
    const dy = startY - e.clientY;
    const dx = e.clientX - startX;

    if (!engaged) {
      // wait until the intent is clearly upward before taking the gesture
      if (dy < 6) return;
      if (Math.abs(dx) > Math.abs(dy) * DIRECTION_RATIO) {
        active = false;
        return;
      }
      engaged = true;
      node.setPointerCapture(e.pointerId);
      opts.onstart?.();
    }

    trail.push({ t: performance.now(), y: e.clientY });
    if (trail.length > 12) trail.shift();

    // past the commit distance the surface resists — you can feel the end
    const raw = Math.max(0, dy);
    const commit = commitDistance();
    const travel = raw <= commit ? raw : commit + (raw - commit) * 0.42;

    opts.onmove?.({
      travel,
      drift: dx * 0.32,
      progress: Math.min(1, travel / commit)
    });
  }

  function up(e: PointerEvent) {
    if (!active || e.pointerId !== pointerId) return;
    const wasEngaged = engaged;
    active = false;
    engaged = false;
    pointerId = null;
    if (!wasEngaged) return;

    const travel = Math.max(0, startY - e.clientY);
    const velocity = velocityNow();
    const commit = commitDistance();
    // where the gesture is heading, not just where it stopped
    const projected = travel + velocity * PROJECTION_MS;
    const committed = velocity > FLICK_VELOCITY || projected > commit;

    const release: DismissRelease = {
      velocity: Math.max(velocity, 0),
      travel,
      remaining: Math.max(0, window.innerHeight - travel)
    };
    if (committed) opts.ondismiss?.(release);
    else opts.oncancel?.(release);
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);

  return {
    update(next: DismissOptions) {
      opts = next;
    },
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    }
  };
}

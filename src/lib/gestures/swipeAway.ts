/*
  Swipe a card off the glance.

  Same release rule as the rest of the system: the card tracks your finger, and
  what happens on release is decided by where the gesture is heading, not only
  where it ended. A short flick clears; the same distance dragged slowly falls
  back into place.

  Touch only. A pointer device gets a real target instead — dragging a small
  row with a mouse is a poor gesture, and a stray horizontal drag there is far
  more likely to be a text selection or a page swipe than an intent to clear.
*/
export interface SwipeAwayOptions {
  onaway: () => void;
  /** px of travel that counts as committed */
  threshold?: number;
}

const FLICK_VELOCITY = 0.45;
const PROJECTION_MS = 110;
const ENGAGE_PX = 10;
const DIRECTION_RATIO = 1.2;

export function swipeAway(node: HTMLElement, options: SwipeAwayOptions) {
  let opts = options;
  let active = false;
  let engaged = false;
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let trail: Array<{ t: number; x: number }> = [];

  const threshold = () => opts.threshold ?? Math.max(90, node.clientWidth * 0.35);

  function velocityNow() {
    const now = performance.now();
    const recent = trail.filter((p) => now - p.t < 90);
    if (recent.length < 2) return 0;
    const dt = recent[recent.length - 1].t - recent[0].t;
    return dt > 0 ? (recent[recent.length - 1].x - recent[0].x) / dt : 0;
  }

  function paint(dx: number) {
    const t = threshold();
    node.style.transform = `translate3d(${dx}px, 0, 0)`;
    node.style.opacity = String(Math.max(0.15, 1 - Math.abs(dx) / (t * 1.8)));
  }

  function reset(animate: boolean) {
    node.style.transition = animate ? 'transform 320ms var(--ease-overshoot), opacity 240ms ease' : 'none';
    node.style.transform = '';
    node.style.opacity = '';
  }

  function down(e: PointerEvent) {
    // pointer devices use the clear button; only touch swipes
    if (e.pointerType === 'mouse') return;
    active = true;
    engaged = false;
    startX = e.clientX;
    startY = e.clientY;
    pointerId = e.pointerId;
    trail = [{ t: performance.now(), x: e.clientX }];
  }

  function move(e: PointerEvent) {
    if (!active || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!engaged) {
      if (Math.abs(dx) < ENGAGE_PX) return;
      // a mostly-vertical drag is the feed scrolling, not a clear
      if (Math.abs(dy) > Math.abs(dx) * DIRECTION_RATIO) {
        active = false;
        return;
      }
      engaged = true;
      node.setPointerCapture(e.pointerId);
      node.style.transition = 'none';
    }

    trail.push({ t: performance.now(), x: e.clientX });
    if (trail.length > 12) trail.shift();
    paint(dx);
  }

  function up(e: PointerEvent) {
    if (!active || e.pointerId !== pointerId) return;
    const wasEngaged = engaged;
    active = false;
    engaged = false;
    pointerId = null;
    if (!wasEngaged) return;

    const dx = e.clientX - startX;
    const v = velocityNow();
    const projected = dx + v * PROJECTION_MS;
    const committed = Math.abs(v) > FLICK_VELOCITY || Math.abs(projected) > threshold();

    if (committed) {
      // finish the throw in the direction it was already going
      const away = Math.sign(dx || v) * (node.clientWidth + 80);
      node.style.transition = 'transform 220ms cubic-bezier(0.3, 0, 0.6, 1), opacity 200ms ease';
      node.style.transform = `translate3d(${away}px, 0, 0)`;
      node.style.opacity = '0';
      opts.onaway();
    } else {
      reset(true);
    }
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);

  return {
    update(next: SwipeAwayOptions) {
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

/*
  Horizontal paging for the home surface.

  Same physics philosophy as the app dismissal: the surface tracks your finger,
  and the release is decided by where the gesture is heading rather than only
  where it ended — a short flick turns the page, the same distance dragged
  slowly falls back.

  The action measures and reports; the view decides what the motion looks like,
  which keeps per-frame transform work off the reactive path.
*/

export interface PageDrag {
  /** signed offset in px: negative moves toward the next page */
  dx: number;
  /** current page index plus the fraction dragged, for parallax and dots */
  position: number;
}

export interface PageRelease {
  /** the page index the surface should settle on */
  page: number;
  /** horizontal speed at release, px/ms, always positive */
  velocity: number;
}

export interface PagerOptions {
  page: number;
  pages: number;
  onstart?: () => void;
  onmove?: (d: PageDrag) => void;
  onrelease?: (r: PageRelease) => void;
  /** px from the bottom edge reserved for the app-exit gesture */
  bottomReserve?: number;
}

/** past this a flick turns the page regardless of distance (px/ms) */
const FLICK_VELOCITY = 0.4;
/** how far ahead release velocity is projected when deciding (ms) */
const PROJECTION_MS = 120;
/** engage only once the drag is clearly horizontal */
const DIRECTION_RATIO = 1.15;
const ENGAGE_PX = 8;

export function pager(node: HTMLElement, options: PagerOptions) {
  let opts = options;
  let active = false;
  let engaged = false;
  let startX = 0;
  let startY = 0;
  let pointerId: number | null = null;
  let trail: Array<{ t: number; x: number }> = [];

  const width = () => node.clientWidth || window.innerWidth;

  function velocityNow(): number {
    const now = performance.now();
    const recent = trail.filter((p) => now - p.t < 90);
    if (recent.length < 2) return 0;
    const first = recent[0];
    const last = recent[recent.length - 1];
    const dt = last.t - first.t;
    return dt > 0 ? (last.x - first.x) / dt : 0;
  }

  function down(e: PointerEvent) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // never steal the bottom strip: that belongs to the app-exit gesture
    if (e.clientY >= window.innerHeight - (opts.bottomReserve ?? 0)) return;
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
      // a mostly-vertical drag belongs to scrolling, not to paging
      if (Math.abs(dy) > Math.abs(dx) * DIRECTION_RATIO) {
        active = false;
        return;
      }
      engaged = true;
      node.setPointerCapture(e.pointerId);
      opts.onstart?.();
    }

    trail.push({ t: performance.now(), x: e.clientX });
    if (trail.length > 12) trail.shift();

    // the ends of the run resist, so the edge of the surface can be felt
    const raw = dx;
    const atStart = opts.page === 0 && raw > 0;
    const atEnd = opts.page === opts.pages - 1 && raw < 0;
    const eased = atStart || atEnd ? raw * 0.32 : raw;

    opts.onmove?.({ dx: eased, position: opts.page - eased / width() });
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

    let page = opts.page;
    if (Math.abs(v) > FLICK_VELOCITY) page = opts.page - Math.sign(v);
    else if (Math.abs(projected) > width() * 0.4) page = opts.page - Math.sign(projected);

    opts.onrelease?.({
      page: Math.min(opts.pages - 1, Math.max(0, page)),
      velocity: Math.abs(v)
    });
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);

  return {
    update(next: PagerOptions) {
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

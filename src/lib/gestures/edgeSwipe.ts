/*
  The one universal exit gesture: swipe up from the bottom edge, identical in
  every app. It lives on a system-level layer above app content, so no app
  needs (or is allowed) its own navigation chrome, and no app can consume
  the gesture zone. Attached as a Svelte action.
*/
interface SwipeOptions {
  onexit: () => void;
  /** height of the capture zone at the bottom edge, px */
  zone?: number;
  /** upward travel required to commit, px */
  threshold?: number;
}

export function edgeSwipeUp(node: HTMLElement, options: SwipeOptions) {
  const zone = options.zone ?? 36;
  const threshold = options.threshold ?? 70;

  let startY: number | null = null;
  let tracking = false;

  function down(e: PointerEvent) {
    if (e.clientY >= window.innerHeight - zone) {
      startY = e.clientY;
      tracking = true;
      node.setPointerCapture(e.pointerId);
    }
  }

  function move(e: PointerEvent) {
    if (!tracking || startY === null) return;
    const travel = startY - e.clientY;
    node.style.setProperty('--swipe-progress', String(Math.min(1, Math.max(0, travel / threshold))));
    if (travel > threshold) {
      tracking = false;
      startY = null;
      node.style.removeProperty('--swipe-progress');
      options.onexit();
    }
  }

  function up() {
    tracking = false;
    startY = null;
    node.style.removeProperty('--swipe-progress');
  }

  node.addEventListener('pointerdown', down);
  node.addEventListener('pointermove', move);
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', up);

  return {
    destroy() {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', up);
      node.removeEventListener('pointercancel', up);
    }
  };
}

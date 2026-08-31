<script lang="ts">
  import { appById } from '../apps/registry';
  import { dismissGesture, type DismissRelease, type DragSample } from '../gestures/dismiss';
  import { play } from '../sound/engine';
  import { settings } from '../settings.svelte';
  import type { BloomOrigin } from './state.svelte';

  interface Props {
    appId: string;
    origin: BloomOrigin;
    onexit: () => void;
  }
  let { appId, origin, onexit }: Props = $props();

  const app = $derived(appById(appId));

  let el: HTMLDivElement | undefined = $state();
  let open = $state(false);
  let dragging = $state(false);
  let closing = $state(false);

  // The bloom: mount at scale(0.06) anchored to the press point, then expand
  // to fill the screen on the next frame. Grow from the touch — never slide,
  // never cut, never cross-fade.
  $effect(() => {
    const raf = requestAnimationFrame(() => (open = true));
    return () => cancelAnimationFrame(raf);
  });

  /* Tier 1 (see settings.svelte.ts): border-radius is not a compositor
     property — changing it forces a repaint of the clip shape on every
     single call, and paint() runs on every pointermove of a drag, i.e. far
     more often than any other animation in the app. Skipping it there is
     the single biggest win available for a dragged app on a weak GPU; the
     transform (translate + scale) still carries the whole gesture. */
  function cheapGfx() {
    return settings.current.graphics === 1;
  }

  /*
    Drag transforms are written straight to the node. Routing 60fps of pointer
    motion through reactive state would re-run effects on every frame for a
    value only the compositor needs.
  */
  function paint(s: DragSample) {
    if (!el) return;
    const scale = 1 - s.progress * 0.42;
    el.style.transform = `translate3d(${s.drift}px, ${-s.travel * 0.28}px, 0) scale(${scale})`;
    if (cheapGfx()) return;
    // the card stays opaque while held — a held object does not go translucent,
    // and letting home read through it muddies both surfaces
    el.style.borderRadius = `${s.progress * 42}px`;
  }

  function onstart() {
    if (closing) return;
    dragging = true;
    if (el) el.style.transition = 'none';
  }

  /* Release velocity sets the duration: a flick finishes fast, a slow release
     takes its time. Same curve either way — nothing here moves linearly. */
  function settle(r: DismissRelease, to: 'gone' | 'back') {
    if (!el || closing) return;
    dragging = false;
    const distance = to === 'gone' ? r.remaining : Math.max(1, r.travel);
    const speed = Math.max(r.velocity, 0.35);
    const ms = Math.min(520, Math.max(170, distance / speed));

    // tier 1 drops border-radius from the transition list entirely, so the
    // borderRadius writes below still happen — they just snap in one frame
    // instead of interpolating across the whole curve
    el.style.transition = cheapGfx()
      ? `transform ${ms}ms var(--ease-bloom), opacity ${ms * 0.8}ms ease`
      : `transform ${ms}ms var(--ease-bloom), opacity ${ms * 0.8}ms ease, border-radius ${ms}ms var(--ease-bloom)`;

    if (to === 'gone') {
      // collapse back into the orb it grew from
      closing = true;
      play('home');
      el.style.transform = 'scale(0.06)';
      el.style.opacity = '0';
      el.style.borderRadius = '50%';
      settleTimer = setTimeout(onexit, Math.min(ms, 260));
    } else {
      el.style.transform = '';
      el.style.opacity = '';
      el.style.borderRadius = '';
      settleTimer = setTimeout(() => {
        if (el && !dragging) el.style.transition = '';
      }, ms);
    }
  }

  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => clearTimeout(settleTimer));

  /*
    The home key and Escape used to call onexit() directly, which unmounted the
    app on the spot — the two ways out that had no motion at all, against a
    system whose whole premise is that surfaces grow and shrink rather than
    cut. This is the drag path's collapse without a gesture to read speed from,
    so the duration is fixed: the same reverse bloom back into the orb.
  */
  const CLOSE_MS = 380;

  function close() {
    if (closing) return;
    if (!el) {
      onexit();
      return;
    }
    closing = true;
    dragging = false;
    play('home');
    el.style.transition = cheapGfx()
      ? `transform ${CLOSE_MS}ms var(--ease-bloom), opacity ${CLOSE_MS * 0.7}ms ease`
      : `transform ${CLOSE_MS}ms var(--ease-bloom), opacity ${CLOSE_MS * 0.7}ms ease, border-radius ${CLOSE_MS}ms var(--ease-bloom)`;
    el.style.transform = 'scale(0.06)';
    el.style.opacity = '0';
    el.style.borderRadius = '50%';
    // unmount a little before the curve lands, so the field is already there
    settleTimer = setTimeout(onexit, CLOSE_MS - 40);
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }
</script>

<svelte:window onkeydown={key} />

<div
  bind:this={el}
  class="bloom"
  class:open
  class:dragging
  class:closing
  style:transform-origin={`${origin.x}% ${origin.y}%`}
>
  {#if app}
    <div class="surface">
      <app.component />
    </div>
  {/if}

  <!-- The universal exit layer sits ABOVE app content, so no app can consume
       the gesture zone and none needs its own navigation chrome. -->
  <div
    class="exit-layer"
    use:dismissGesture={{
      onstart,
      onmove: paint,
      ondismiss: (r) => settle(r, 'gone'),
      oncancel: (r) => settle(r, 'back')
    }}
  >
    <!-- Touch gets the bar and the drag; pointer devices get a real button in
         the same place, because a drag is a poor gesture with a mouse. One
         control, one position, two input models. -->
    <span class="grabber" aria-hidden="true"></span>
    <button class="home-key" onclick={close} aria-label="go home">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4l8 7h-2.5v8h-11v-8H4l8-7z" /></svg>
      <span>home</span>
    </button>
  </div>
</div>

<style>
  /* app: edge to edge, zero window chrome. */
  .bloom {
    position: fixed;
    inset: 0;
    opacity: 0;
    transform: scale(0.06);
    border-radius: 50%;
    background:
      radial-gradient(ellipse 60% 44% at 30% 14%, rgba(255, 255, 255, 0.9) 0%, transparent 60%),
      linear-gradient(168deg, #f6fdff 0%, #dbf2fc 42%, #b6e3f7 78%, #8fd2f0 100%);
    transition:
      transform var(--bloom-duration) var(--ease-bloom),
      opacity 0.42s ease,
      border-radius var(--bloom-duration) var(--ease-bloom);
    overflow: hidden;
  }
  /* Promotion is borrowed GPU memory, not a free speed-up: hold the layer only
     while it is actually moving. */
  .bloom:not(.open),
  .bloom.dragging,
  .bloom.closing {
    will-change: transform;
  }
  .bloom.open {
    opacity: 1;
    transform: scale(1);
    border-radius: 0;
  }
  /* mid-gesture the app is a held object: it casts a shadow off the surface,
     and it keeps casting it on the way back down into the orb */
  .bloom.dragging,
  .bloom.closing {
    box-shadow: 0 40px 90px rgba(13, 63, 143, 0.32);
  }
  /* the gesture bar has nothing left to grab once the collapse starts */
  .bloom.closing .exit-layer {
    pointer-events: none;
  }

  /*
    Tier 1: this is the single heaviest animation in the whole app — a
    full-viewport surface, and JS already stops writing border-radius to it
    (see paint()/settle()/close() above) for a drag or an explicit close.
    This covers the third path, the initial mount-open transition, which is
    driven by the .open class rather than JS: dropping border-radius from
    the transition list here means the browser applies the new value in one
    frame instead of interpolating the clip shape across --bloom-duration.
    The held-object shadow goes too — a static box-shadow on a transform-only
    layer is cheap, but a 90px blur radius is still real work to rasterise
    the first time the class lands, and it happens on every drag start.
  */
  :global(html[data-gfx='1']) .bloom {
    transition:
      transform var(--bloom-duration) var(--ease-bloom),
      opacity 0.42s ease;
  }
  :global(html[data-gfx='1']) .bloom.dragging,
  :global(html[data-gfx='1']) .bloom.closing {
    box-shadow: none;
  }

  .surface {
    position: absolute;
    inset: 0;
    opacity: 0;
    transform: translateY(14px) scale(0.985);
    transition:
      opacity 0.4s ease 0.24s,
      transform 0.56s var(--ease-rise) 0.24s;
  }
  .open .surface {
    opacity: 1;
    transform: none;
  }
  /* freeze the app's own scrolling and pointer work while it is being dragged
     or collapsing */
  .dragging .surface,
  .closing .surface {
    pointer-events: none;
  }

  .exit-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 52px;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: calc(9px + env(safe-area-inset-bottom));
    touch-action: none;
    cursor: grab;
  }
  .exit-layer:active {
    cursor: grabbing;
  }
  .grabber {
    width: 118px;
    height: 5px;
    border-radius: 99px;
    background: rgba(13, 63, 143, 0.3);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
    transition: transform 0.3s var(--ease-overshoot), background 0.3s ease;
  }
  .dragging .grabber {
    background: rgba(13, 63, 143, 0.5);
    transform: scaleX(1.12);
  }

  /* Desktop home key — same spot as the gesture bar it replaces. */
  .home-key {
    display: none;
    align-items: center;
    gap: 8px;
    padding: 8px 18px;
    cursor: pointer;
    border-radius: 999px;
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--deep);
    background: var(--glass-bg);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    opacity: 0;
    transition: opacity 0.4s ease 0.4s, transform 0.32s var(--ease-overshoot);
  }
  .open .home-key {
    opacity: 1;
  }
  .home-key:hover {
    transform: translateY(-2px);
  }
  .home-key:active {
    transform: scale(0.94);
    transition-duration: var(--press-duration);
    transition-timing-function: var(--ease-press);
  }
  .home-key svg {
    width: 14px;
    height: 14px;
    stroke: var(--deep);
    stroke-width: 1.9;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* touch: the bar only, driven entirely by the gesture */
  @media (pointer: coarse) {
    .home-key {
      display: none;
    }
  }
  /* pointer devices: the button instead of the bar */
  @media (pointer: fine) {
    .grabber {
      display: none;
    }
    .home-key {
      display: inline-flex;
    }
  }
</style>

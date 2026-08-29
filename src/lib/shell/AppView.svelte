<script lang="ts">
  import { appById } from '../apps/registry';
  import { dismissGesture, type DismissRelease, type DragSample } from '../gestures/dismiss';
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

  // The bloom: mount at scale(0.06) anchored to the press point, then expand
  // to fill the screen on the next frame. Grow from the touch — never slide,
  // never cut, never cross-fade.
  $effect(() => {
    const raf = requestAnimationFrame(() => (open = true));
    return () => cancelAnimationFrame(raf);
  });

  /*
    Drag transforms are written straight to the node. Routing 60fps of pointer
    motion through reactive state would re-run effects on every frame for a
    value only the compositor needs.
  */
  function paint(s: DragSample) {
    if (!el) return;
    const scale = 1 - s.progress * 0.42;
    el.style.transform = `translate3d(${s.drift}px, ${-s.travel * 0.28}px, 0) scale(${scale})`;
    // the card stays opaque while held — a held object does not go translucent,
    // and letting home read through it muddies both surfaces
    el.style.borderRadius = `${s.progress * 42}px`;
  }

  function onstart() {
    dragging = true;
    if (el) el.style.transition = 'none';
  }

  /* Release velocity sets the duration: a flick finishes fast, a slow release
     takes its time. Same curve either way — nothing here moves linearly. */
  function settle(r: DismissRelease, to: 'gone' | 'back') {
    if (!el) return;
    dragging = false;
    const distance = to === 'gone' ? r.remaining : Math.max(1, r.travel);
    const speed = Math.max(r.velocity, 0.35);
    const ms = Math.min(520, Math.max(170, distance / speed));

    el.style.transition = `transform ${ms}ms var(--ease-bloom), opacity ${ms * 0.8}ms ease, border-radius ${ms}ms var(--ease-bloom)`;

    if (to === 'gone') {
      // collapse back into the orb it grew from
      el.style.transform = 'scale(0.06)';
      el.style.opacity = '0';
      el.style.borderRadius = '50%';
      setTimeout(onexit, Math.min(ms, 260));
    } else {
      el.style.transform = '';
      el.style.opacity = '';
      el.style.borderRadius = '';
      setTimeout(() => {
        if (el && !dragging) el.style.transition = '';
      }, ms);
    }
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onexit();
  }
</script>

<svelte:window onkeydown={key} />

<div
  bind:this={el}
  class="bloom"
  class:open
  class:dragging
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
    aria-hidden="true"
  >
    <span class="grabber"></span>
  </div>

  <!-- keyboard/mouse fallback (input priority 2) — gesture stays primary -->
  <button class="home-fallback" onclick={onexit} aria-label="go home">
    <svg viewBox="0 0 24 24"><path d="M12 4l8 7h-2.5v8h-11v-8H4l8-7z" /></svg>
  </button>
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
    will-change: transform;
  }
  .bloom.open {
    opacity: 1;
    transform: scale(1);
    border-radius: 0;
  }
  /* mid-gesture the app is a held object: it casts a shadow off the surface */
  .bloom.dragging {
    box-shadow: 0 40px 90px rgba(13, 63, 143, 0.32);
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
  /* freeze the app's own scrolling and pointer work while it is being dragged */
  .dragging .surface {
    pointer-events: none;
  }

  .exit-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 46px;
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

  .home-fallback {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top));
    right: 16px;
    z-index: 10;
    width: 42px;
    height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--deep);
    border-radius: 50%;
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow);
    border: var(--glass-border);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
    opacity: 0;
    transition: opacity 0.4s ease 0.4s, transform 0.3s var(--ease-overshoot);
  }
  .open .home-fallback {
    opacity: 1;
  }
  .home-fallback:active {
    transform: scale(0.9);
  }
  .home-fallback svg {
    width: 18px;
    height: 18px;
    stroke: var(--deep);
    stroke-width: 1.8;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  /* the home indicator is a touch affordance; pointer devices get the button */
  @media (pointer: fine) {
    .grabber {
      opacity: 0.4;
    }
  }
</style>

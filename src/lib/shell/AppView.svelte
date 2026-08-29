<script lang="ts">
  import { appById } from '../apps/registry';
  import { edgeSwipeUp } from '../gestures/edgeSwipe';
  import type { BloomOrigin } from './state.svelte';

  interface Props {
    appId: string;
    origin: BloomOrigin;
    onexit: () => void;
  }
  let { appId, origin, onexit }: Props = $props();

  const app = $derived(appById(appId));

  // The bloom: mount at scale(0.06) anchored to the press point, then expand
  // to fill the screen on the next frame. Grow from the touch — never slide,
  // never cut, never cross-fade.
  let open = $state(false);
  $effect(() => {
    const raf = requestAnimationFrame(() => (open = true));
    return () => cancelAnimationFrame(raf);
  });

  function key(e: KeyboardEvent) {
    if (e.key === 'Escape') onexit();
  }
</script>

<svelte:window onkeydown={key} />

<div class="bloom" class:open style:transform-origin={`${origin.x}% ${origin.y}%`}>
  {#if app}
    <div class="surface">
      <app.component />
    </div>
  {/if}

  <!-- The universal exit layer sits ABOVE app content, so no app can consume
       the gesture zone and none needs its own navigation chrome. -->
  <div class="exit-layer" use:edgeSwipeUp={{ onexit }} aria-hidden="true">
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
  }
  .bloom.open {
    opacity: 1;
    transform: scale(1);
    border-radius: 0;
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

  .exit-layer {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 44px;
    z-index: 10;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    padding-bottom: calc(9px + env(safe-area-inset-bottom));
    touch-action: none;
    cursor: grab;
  }
  .grabber {
    width: 118px;
    height: 5px;
    border-radius: 99px;
    background: rgba(13, 63, 143, 0.3);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.7);
    transform: translateY(calc(var(--swipe-progress, 0) * -16px)) scaleX(calc(1 + var(--swipe-progress, 0) * 0.25));
    transition: transform 0.15s ease-out;
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

  @media (pointer: fine) {
    .exit-layer {
      display: none;
    }
  }
</style>

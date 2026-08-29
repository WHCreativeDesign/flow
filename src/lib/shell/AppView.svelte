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

<div
  class="bloom"
  class:open
  style:transform-origin={`${origin.x}% ${origin.y}%`}
  use:edgeSwipeUp={{ onexit }}
>
  {#if app}
    <div class="inner">
      <div class="app-orb" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <!-- eslint-disable-next-line svelte/no-at-html-tags — static registry markup -->
          {@html app.icon}
        </svg>
      </div>
      <h1 class="title">{app.label}</h1>
      <p class="sub">app stub · swipe up from the bottom edge to return home</p>
    </div>
  {/if}

  <!-- the system gesture zone: visual affordance only, the whole surface tracks the swipe -->
  <div class="gesture-hint" aria-hidden="true"><span></span></div>

  <!-- keyboard/mouse fallback (input priority 2) — gesture stays primary -->
  <button class="home-fallback" onclick={onexit}>
    <svg viewBox="0 0 24 24"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
    home
  </button>
</div>

<style>
  /* app: edge to edge, zero chrome. */
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
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    touch-action: none;
  }
  .bloom.open {
    opacity: 1;
    transform: scale(1);
    border-radius: 0;
  }

  .inner {
    text-align: center;
    opacity: 0;
    transform: translateY(18px) scale(0.96);
    transition:
      opacity 0.42s ease 0.22s,
      transform 0.58s var(--ease-rise) 0.22s;
  }
  .open .inner {
    opacity: 1;
    transform: none;
  }

  .app-orb {
    width: 88px;
    height: 88px;
    border-radius: 50%;
    margin: 0 auto 26px;
    background:
      radial-gradient(ellipse 58% 42% at 32% 20%, rgba(255, 255, 255, 0.99) 0%, rgba(255, 255, 255, 0) 62%),
      radial-gradient(circle at 50% 55%, rgba(255, 255, 255, 0.3) 0%, rgba(127, 212, 245, 0.45) 52%, rgba(53, 169, 236, 0.62) 100%);
    box-shadow:
      inset 0 3px 10px rgba(255, 255, 255, 0.95),
      inset 0 -14px 24px rgba(30, 111, 217, 0.3),
      0 18px 34px rgba(13, 63, 143, 0.22);
    display: flex;
    align-items: center;
    justify-content: center;
    border: 1px solid rgba(255, 255, 255, 0.8);
  }
  .app-orb svg {
    width: 38px;
    height: 38px;
    stroke: var(--deep);
    stroke-width: 1.6;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .title {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 46px;
    letter-spacing: -0.03em;
    color: var(--deep);
  }
  .sub {
    margin-top: 10px;
    font-size: 14.5px;
    color: var(--ink-soft);
  }

  .gesture-hint {
    position: absolute;
    bottom: calc(10px + env(safe-area-inset-bottom));
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    pointer-events: none;
  }
  .gesture-hint span {
    width: 120px;
    height: 5px;
    border-radius: 99px;
    background: rgba(13, 63, 143, 0.28);
    transform: translateY(calc(var(--swipe-progress, 0) * -14px)) scaleX(calc(1 + var(--swipe-progress, 0) * 0.2));
  }

  .home-fallback {
    position: absolute;
    top: calc(20px + env(safe-area-inset-top));
    left: 20px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 11px 20px;
    cursor: pointer;
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: var(--deep);
    border-radius: 999px;
    background: var(--glass-bg);
    box-shadow: var(--glass-shadow);
    border: var(--glass-border);
    backdrop-filter: var(--glass-blur);
    opacity: 0;
    transition: opacity 0.4s ease 0.4s, transform 0.3s var(--ease-rise);
  }
  .open .home-fallback {
    opacity: 1;
  }
  .home-fallback:active {
    transform: scale(0.94);
  }
  .home-fallback svg {
    width: 14px;
    height: 14px;
    stroke: var(--deep);
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  @media (pointer: fine) {
    .gesture-hint {
      display: none;
    }
  }
</style>

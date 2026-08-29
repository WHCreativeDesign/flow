<script lang="ts">
  import type { FlowApp } from '../apps/registry';
  import type { BloomOrigin } from '../shell/state.svelte';
  import { play } from '../sound/engine';

  interface Props {
    app: FlowApp;
    index: number;
    onopen: (appId: string, origin: BloomOrigin) => void;
  }

  let { app, index, onopen }: Props = $props();

  let el: HTMLButtonElement;

  // Per-orb float timing so the field never reads as a synchronized grid.
  const duration = $derived((5.6 + ((index * 2.7) % 2.9)).toFixed(2) + 's');
  const delay = $derived((-(index * 1.17) % 4).toFixed(2) + 's');
  const drift = $derived([0, -14, 7, 9, -9, 0][index % 6] + 'px');

  function release() {
    const r = el.getBoundingClientRect();
    onopen(app.id, {
      x: ((r.left + r.width / 2) / window.innerWidth) * 100,
      y: ((r.top + r.height / 2) / window.innerHeight) * 100
    });
  }
</script>

<button
  bind:this={el}
  class="orb"
  style:--float-duration={duration}
  style:--float-delay={delay}
  style:--drift={drift}
  onpointerdown={() => play('press')}
  onclick={release}
  aria-label={`open ${app.label}`}
>
  <svg class="ico" viewBox="0 0 24 24" aria-hidden="true">
    <!-- eslint-disable-next-line svelte/no-at-html-tags — icon markup is static, from the local registry -->
    {@html app.icon}
  </svg>
  <span class="cap">{app.label}</span>
</button>

<style>
  /*
    Orb construction (handoff §4): specular hotspot upper-left, rim light,
    inner occlusion at the base, secondary bounce highlight lower-right,
    ground shadow below. Not a circle with a gradient.
  */
  .orb {
    position: relative;
    aspect-ratio: 1;
    border: none;
    padding: 0;
    cursor: pointer;
    border-radius: 50%;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 9px;
    font: inherit;
    transform: translateY(var(--drift));
    transition: transform 0.62s var(--ease-rise), filter 0.4s ease;
    animation: float-orb var(--float-duration) var(--float-delay) ease-in-out infinite alternate;
  }

  @keyframes float-orb {
    from { translate: 0 0; }
    to { translate: 0 -9px; }
  }

  /* glass sphere body */
  .orb::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background:
      radial-gradient(ellipse 58% 42% at 32% 20%, rgba(255, 255, 255, 0.99) 0%, rgba(255, 255, 255, 0) 62%),
      radial-gradient(ellipse 80% 70% at 70% 88%, rgba(159, 232, 221, 0.72) 0%, rgba(159, 232, 221, 0) 58%),
      radial-gradient(circle at 50% 55%, rgba(255, 255, 255, 0.3) 0%, rgba(127, 212, 245, 0.42) 52%, rgba(53, 169, 236, 0.6) 78%, rgba(30, 111, 217, 0.52) 100%);
    box-shadow:
      inset 0 3px 10px rgba(255, 255, 255, 0.95),
      inset 0 -16px 26px rgba(30, 111, 217, 0.3),
      inset 10px 6px 22px rgba(255, 255, 255, 0.42),
      inset -8px -4px 18px rgba(13, 63, 143, 0.18),
      0 20px 38px rgba(13, 63, 143, 0.24),
      0 6px 12px rgba(13, 63, 143, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.75);
    transition: box-shadow 0.42s ease;
  }

  /* specular hotspot + secondary bounce highlight */
  .orb::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 50%;
    pointer-events: none;
    background:
      radial-gradient(ellipse 34% 22% at 30% 17%, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 70%),
      radial-gradient(ellipse 20% 12% at 68% 80%, rgba(255, 255, 255, 0.65) 0%, rgba(255, 255, 255, 0) 70%);
    mix-blend-mode: screen;
  }

  .ico,
  .cap {
    position: relative;
    z-index: 2;
  }
  .ico {
    width: 29px;
    height: 29px;
    stroke: var(--deep);
    stroke-width: 1.7;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 1.5px 0 rgba(255, 255, 255, 0.9));
  }
  .cap {
    font-size: 11.5px;
    font-weight: 600;
    letter-spacing: 0.015em;
    color: var(--deep);
    text-shadow: 0 1px 0 rgba(255, 255, 255, 0.85);
  }

  .orb:hover {
    filter: brightness(1.05);
  }
  .orb:hover::before {
    box-shadow:
      inset 0 3px 10px rgba(255, 255, 255, 1),
      inset 0 -16px 26px rgba(30, 111, 217, 0.34),
      inset 10px 6px 22px rgba(255, 255, 255, 0.5),
      inset -8px -4px 18px rgba(13, 63, 143, 0.2),
      0 28px 52px rgba(13, 63, 143, 0.3),
      0 8px 16px rgba(13, 63, 143, 0.16);
  }

  /* press: compress under the finger, fast ease-in — everything has weight */
  .orb:active {
    transform: translateY(var(--drift)) scale(0.83);
    transition: transform var(--press-duration) var(--ease-press);
  }
  .orb:active::before {
    box-shadow:
      inset 0 2px 6px rgba(255, 255, 255, 0.8),
      inset 0 -8px 16px rgba(30, 111, 217, 0.42),
      inset 6px 4px 14px rgba(255, 255, 255, 0.3),
      0 6px 14px rgba(13, 63, 143, 0.28);
  }
</style>

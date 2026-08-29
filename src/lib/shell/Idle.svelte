<script lang="ts">
  import { settings } from '../settings.svelte';

  interface Props {
    onwake: () => void;
  }
  let { onwake }: Props = $props();

  let now = $state(new Date());

  $effect(() => {
    const t = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(t);
  });

  const time = $derived(
    now
      .toLocaleTimeString([], settings.current.use24hClock
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: 'numeric', minute: '2-digit' })
      .toLowerCase()
  );
  const date = $derived(
    now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }).toLowerCase()
  );
</script>

<!--
  idle: ambient drift. Wakes on ANY touch, click, key, or pointer motion —
  there is deliberately no gesture to memorize.
-->
<div
  class="idle"
  role="button"
  tabindex="0"
  aria-label="wake"
  onpointerdown={onwake}
  onpointermove={onwake}
  onkeydown={onwake}
>
  <span class="drifter d1"></span>
  <span class="drifter d2"></span>
  <span class="drifter d3"></span>
  <div class="clock">
    <div class="time">{time}</div>
    <div class="date">{date}</div>
  </div>
</div>

<style>
  .idle {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    outline: none;
  }

  .drifter {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(
      circle at 33% 30%,
      rgba(255, 255, 255, 0.95),
      rgba(159, 232, 221, 0.5) 45%,
      rgba(53, 169, 236, 0.28)
    );
    animation: bob 1s ease-in-out infinite alternate;
  }
  .d1 { width: 120px; height: 120px; top: 22%; left: 18%; animation-duration: 9s; }
  .d2 { width: 64px; height: 64px; top: 60%; left: 48%; animation-duration: 11s; animation-delay: -3s; }
  .d3 { width: 90px; height: 90px; top: 30%; left: 68%; animation-duration: 13s; animation-delay: -6s; }

  @keyframes bob {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(14px, -22px, 0); }
  }

  .clock {
    text-align: center;
    animation: breathe 7s ease-in-out infinite alternate;
  }
  .time {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: clamp(64px, 14vw, 140px);
    letter-spacing: -0.04em;
    color: rgba(13, 63, 143, 0.55);
    text-shadow: 0 2px 0 rgba(255, 255, 255, 0.7);
  }
  .date {
    margin-top: 6px;
    font-size: 15px;
    font-weight: 500;
    letter-spacing: 0.08em;
    color: var(--ink-faint);
  }

  @keyframes breathe {
    from { transform: translateY(0); opacity: 0.92; }
    to { transform: translateY(-10px); opacity: 1; }
  }
</style>

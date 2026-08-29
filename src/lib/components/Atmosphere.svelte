<script lang="ts">
  interface Props {
    /* Occluded behind a full-screen app, or turned down in settings. Paused
       layers stay composited but stop re-rasterizing, which is the whole cost. */
    paused?: boolean;
  }
  let { paused = false }: Props = $props();
</script>

<!--
  The atmosphere stack — six fixed layers behind everything: sky gradient,
  aurora, bokeh at three depths, caustics, lens bloom, grain.

  Performance contract for this file: no `filter`, no `mix-blend-mode`, and
  nothing animated except `transform`. Filters and blend modes force the
  compositor to re-rasterize and read back full-screen layers on every frame,
  forever — the cost never stops and it grows with whatever is drawn above.
  Softness here comes from gradient alpha falloff instead, which rasterizes
  once and then only ever gets moved.
-->
<div class="atmosphere" class:paused aria-hidden="true">
  <div class="sky-layer"></div>
  <div class="aurora"></div>
  <div class="bloom-streak"></div>
  <div class="bokeh">
    <span class="bk far bk1"></span>
    <span class="bk mid bk2"></span>
    <span class="bk near bk3"></span>
    <span class="bk far bk4"></span>
    <span class="bk near bk5"></span>
    <span class="bk mid bk6"></span>
    <span class="bk near bk7"></span>
    <span class="bk far bk8"></span>
  </div>
  <div class="caustics"></div>
  <div class="grain"></div>
</div>

<style>
  .atmosphere > div {
    position: fixed;
    inset: 0;
    pointer-events: none;
  }

  .sky-layer {
    z-index: 0;
    background:
      radial-gradient(ellipse 100% 55% at 50% -8%, rgba(255, 255, 255, 0.95) 0%, transparent 62%),
      radial-gradient(ellipse 65% 45% at 82% 12%, rgba(159, 232, 221, 0.55) 0%, transparent 65%),
      radial-gradient(ellipse 70% 40% at 12% 30%, rgba(127, 212, 245, 0.5) 0%, transparent 62%),
      radial-gradient(ellipse 90% 50% at 50% 108%, rgba(30, 111, 217, 0.35) 0%, transparent 68%),
      linear-gradient(178deg, #f4fcff 0%, #d9f0fb 38%, #b9e4f7 72%, #9ed8f2 100%);
  }

  /* Was a blur(50px) over conic gradients — the same haze comes free from
     wide radial stops, with nothing to convolve each frame. */
  .aurora {
    z-index: 0;
    opacity: 0.62;
    background:
      radial-gradient(ellipse 62% 46% at 28% 24%,
        rgba(159, 232, 221, 0.5) 0%, rgba(159, 232, 221, 0.24) 34%, rgba(159, 232, 221, 0.06) 62%, transparent 78%),
      radial-gradient(ellipse 58% 42% at 76% 40%,
        rgba(127, 212, 245, 0.46) 0%, rgba(127, 212, 245, 0.2) 36%, rgba(127, 212, 245, 0.05) 64%, transparent 80%);
    animation: aurora-shift 34s ease-in-out infinite;
    will-change: transform;
  }
  @keyframes aurora-shift {
    0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
    33% { transform: translate3d(-3%, 2%, 0) scale(1.08); }
    66% { transform: translate3d(3%, -2%, 0) scale(0.96); }
  }

  .bloom-streak {
    inset: auto;
    top: -12%;
    left: 58%;
    width: 52vw;
    height: 52vw;
    z-index: 0;
    background: radial-gradient(circle,
      rgba(255, 255, 255, 0.8) 0%, rgba(232, 250, 255, 0.4) 22%, rgba(196, 242, 228, 0.16) 44%, transparent 66%);
    opacity: 0.8;
    animation: bob 26s ease-in-out infinite alternate;
    will-change: transform;
  }

  .bokeh {
    z-index: 0;
    overflow: hidden;
  }
  /* A bokeh disc is a soft-edged circle of light: the falloff belongs in the
     gradient, not in a blur pass over it. */
  .bk {
    position: absolute;
    border-radius: 50%;
    animation: bob 1s ease-in-out infinite alternate;
    will-change: transform;
  }
  .bk.far {
    opacity: 0.5;
    background: radial-gradient(circle at 34% 30%,
      rgba(255, 255, 255, 0.7) 0%, rgba(196, 242, 228, 0.4) 30%, rgba(127, 212, 245, 0.2) 58%, rgba(53, 169, 236, 0.05) 80%, transparent 100%);
  }
  .bk.mid {
    opacity: 0.68;
    background: radial-gradient(circle at 34% 30%,
      rgba(255, 255, 255, 0.88) 0%, rgba(196, 242, 228, 0.5) 34%, rgba(127, 212, 245, 0.26) 62%, rgba(53, 169, 236, 0.07) 86%, transparent 100%);
  }
  .bk.near {
    opacity: 0.85;
    background: radial-gradient(circle at 34% 30%,
      rgba(255, 255, 255, 0.96) 0%, rgba(196, 242, 228, 0.6) 38%, rgba(127, 212, 245, 0.32) 68%, rgba(53, 169, 236, 0.12) 92%, transparent 100%);
    box-shadow: inset 0 0 20px rgba(255, 255, 255, 0.55);
  }

  .bk1 { width: 340px; height: 340px; top: -4%; left: -7%; animation-duration: 17s; }
  .bk2 { width: 150px; height: 150px; top: 14%; right: 8%; animation-duration: 12s; animation-delay: -3s; }
  .bk3 { width: 88px; height: 88px; top: 38%; left: 6%; animation-duration: 9s; animation-delay: -5s; }
  .bk4 { width: 230px; height: 230px; top: 56%; right: -4%; animation-duration: 20s; animation-delay: -8s; }
  .bk5 { width: 56px; height: 56px; top: 26%; left: 32%; animation-duration: 8s; animation-delay: -2s; }
  .bk6 { width: 120px; height: 120px; top: 72%; left: 16%; animation-duration: 14s; animation-delay: -6s; }
  .bk7 { width: 44px; height: 44px; top: 64%; right: 28%; animation-duration: 7s; animation-delay: -1s; }
  .bk8 { width: 190px; height: 190px; top: 88%; left: 44%; animation-duration: 22s; animation-delay: -11s; }

  @keyframes bob {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(14px, -22px, 0); }
  }

  /* Oversized and translated, rather than scrolling `background-position`:
     moving a background repaints the whole layer every frame and cannot be
     composited. This drifts the same way for free. */
  .caustics {
    inset: -20%;
    z-index: 0;
    opacity: 0.1;
    background-image:
      repeating-radial-gradient(circle at 20% 30%, transparent 0 18px, rgba(255, 255, 255, 0.55) 19px 20px, transparent 21px 44px),
      repeating-radial-gradient(circle at 72% 62%, transparent 0 26px, rgba(255, 255, 255, 0.45) 27px 28px, transparent 29px 60px);
    animation: caustic-drift 30s ease-in-out infinite alternate;
    will-change: transform;
  }
  @keyframes caustic-drift {
    from { transform: translate3d(0, 0, 0); }
    to { transform: translate3d(3.5%, 2.5%, 0); }
  }

  /* Static, and no longer blended: an overlay blend forces the compositor to
     read back everything under it on every frame that anything moves. */
  .grain {
    z-index: 1;
    opacity: 0.035;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  /* Nothing here is visible behind a full-screen app, so nothing here should
     be costing frames. Paused layers keep their pixels and stop re-rendering. */
  .paused > div,
  .paused .bk {
    animation-play-state: paused;
    will-change: auto;
  }

  :global(html[data-effects='calm']) .aurora,
  :global(html[data-effects='calm']) .bloom-streak,
  :global(html[data-effects='calm']) .caustics,
  :global(html[data-effects='calm']) .bk {
    animation: none;
    will-change: auto;
  }
  :global(html[data-effects='calm']) .caustics {
    display: none;
  }
</style>

<!--
  The atmosphere stack — six fixed layers behind everything.
  Sky gradient, aurora ribbon, bokeh at three blur depths, caustic ripples,
  lens bloom streak, grain. Purely decorative: aria-hidden, no pointer events.
  A flat gradient is the failure mode; depth comes from these stacked layers.
-->
<div class="atmosphere" aria-hidden="true">
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

  .aurora {
    z-index: 0;
    opacity: 0.5;
    background:
      conic-gradient(from 210deg at 30% 25%, transparent 0deg, rgba(159, 232, 221, 0.5) 40deg, transparent 90deg),
      conic-gradient(from 20deg at 75% 40%, transparent 0deg, rgba(127, 212, 245, 0.45) 55deg, transparent 110deg);
    filter: blur(50px);
    animation: aurora-shift 34s ease-in-out infinite;
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
    background: radial-gradient(circle, rgba(255, 255, 255, 0.85) 0%, rgba(196, 242, 228, 0.3) 30%, transparent 62%);
    filter: blur(28px);
    opacity: 0.75;
    animation: bob 26s ease-in-out infinite alternate;
  }

  .bokeh {
    z-index: 0;
    overflow: hidden;
  }
  .bk {
    position: absolute;
    border-radius: 50%;
    background: radial-gradient(
      circle at 34% 30%,
      rgba(255, 255, 255, 0.95) 0%,
      rgba(196, 242, 228, 0.55) 38%,
      rgba(127, 212, 245, 0.3) 68%,
      rgba(53, 169, 236, 0.1) 100%
    );
    box-shadow: inset 0 0 24px rgba(255, 255, 255, 0.6);
    animation: bob 1s ease-in-out infinite alternate;
  }
  .bk.far { filter: blur(14px); opacity: 0.55; }
  .bk.mid { filter: blur(5px); opacity: 0.7; }
  .bk.near { filter: blur(1px); opacity: 0.85; }

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

  .caustics {
    z-index: 0;
    opacity: 0.16;
    background-image:
      repeating-radial-gradient(circle at 20% 30%, transparent 0 18px, rgba(255, 255, 255, 0.6) 19px 20px, transparent 21px 44px),
      repeating-radial-gradient(circle at 72% 62%, transparent 0 26px, rgba(255, 255, 255, 0.5) 27px 28px, transparent 29px 60px);
    mix-blend-mode: overlay;
    animation: caustic-drift 28s linear infinite;
  }
  /* the one permitted linear timing function: an endless background scroll has
     no start or end to ease between */
  @keyframes caustic-drift {
    from { background-position: 0 0, 0 0; }
    to { background-position: 120px 90px, -90px 120px; }
  }

  .grain {
    z-index: 1;
    opacity: 0.05;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }
</style>

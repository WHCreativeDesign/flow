<script lang="ts">
  import Glance from './pages/Glance.svelte';
  import Field from './pages/Field.svelte';
  import { pager, type PageDrag, type PageRelease } from '../gestures/pager';
  import { play } from '../sound/engine';
  import { deferredPause } from '../deferredPause.svelte';
  import type { BloomOrigin } from './state.svelte';

  interface Props {
    onopen: (appId: string, origin: BloomOrigin) => void;
    /** occluded behind an open app: hold still and stop ticking */
    paused?: boolean;
    page: number;
    onpage: (page: number) => void;
  }
  let { onopen, paused = false, page, onpage }: Props = $props();

  const PAGES = 2;

  /*
    Each page's own animations pause and resume a beat off from the instant
    `page` actually changes — that instant is also when the pager commits
    its own settle transition, and toggling a whole page's idle motion in
    the same tick used to show up as a visible flash right as a swipe
    landed (in either direction). See deferredPause.svelte.ts.
  */
  const glanceOccluded = $derived(paused || page !== 0);
  const glanceSettled = deferredPause(() => glanceOccluded);
  const fieldOccluded = $derived(paused || page !== 1);
  const fieldSettled = deferredPause(() => fieldOccluded);

  let track: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
  /*
    True from the moment a drag is released until its settle transition has
    actually finished. `page` itself only updates once the parent hands a
    new value back down through onpage() — a round trip that does not land
    in the same tick release() runs in. Without this flag, the instant
    `dragging` went false the template's own style:transform/style:transition
    bindings below reactivated using the still-stale `page`, fighting the
    imperative write two lines below it for control of the same properties —
    which is what showed up as the destination page flashing right as a
    swipe landed. Holding the declarative bindings off until settling is
    also done removes the race instead of trying to win it.
  */
  let settling = $state(false);
  let settleTimer: ReturnType<typeof setTimeout> | undefined;
  /* Live position during a drag, mirrored into state only for the dots and
     parallax — the track transform itself is written straight to the node. */
  let dragPosition = $state(0);
  /* While dragging the finger owns the position; otherwise it follows the
     settled page. Derived rather than assigned in an effect so it reacts to
     the prop instead of capturing its first value. */
  const position = $derived(dragging ? dragPosition : page);

  function paint(d: PageDrag) {
    if (!track) return;
    track.style.transform = `translate3d(calc(${-page * 100}% + ${d.dx}px), 0, 0)`;
    dragPosition = d.position;
  }

  function onstart() {
    clearTimeout(settleTimer);
    dragging = true;
    settling = false;
    if (track) track.style.transition = 'none';
  }

  /* Release speed sets the duration, same as the app dismissal: a flick lands
     quickly, a slow release drifts home. */
  function release(r: PageRelease) {
    dragging = false;
    if (!track) return;
    const remaining = Math.abs(r.page - position) * (track.clientWidth || window.innerWidth);
    const ms = Math.min(560, Math.max(220, remaining / Math.max(r.velocity, 0.4)));
    settling = true;
    track.style.transition = `transform ${ms}ms var(--ease-bloom)`;
    track.style.transform = `translate3d(${-r.page * 100}%, 0, 0)`;
    dragPosition = r.page;
    if (r.page !== page) {
      play('page');
      onpage(r.page);
    }
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => (settling = false), ms);
  }
  $effect(() => () => clearTimeout(settleTimer));

  function go(next: number) {
    if (next === page || next < 0 || next >= PAGES) return;
    play('page');
    onpage(next);
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') go(page + 1);
    if (e.key === 'ArrowLeft') go(page - 1);
  }

  // a glance card opens its app, blooming from the card itself
  function openFrom(appId: string, from: DOMRect) {
    onopen(appId, {
      x: ((from.left + from.width / 2) / window.innerWidth) * 100,
      y: ((from.top + from.height / 2) / window.innerHeight) * 100
    });
  }
</script>

<svelte:window onkeydown={key} />

<div
  class="home"
  class:paused
  class:dragging
  class:settling
  use:pager={{ page, pages: PAGES, bottomReserve: 52, onstart, onmove: paint, onrelease: release }}
>
  <div
    bind:this={track}
    class="track"
    style:transform={dragging || settling ? undefined : `translate3d(${-page * 100}%, 0, 0)`}
    style:transition={dragging || settling ? 'none' : `transform 520ms var(--ease-bloom)`}
  >
    <section class="page" aria-hidden={page !== 0}>
      <Glance paused={glanceSettled.current} away={Math.min(1, Math.abs(position - 0))} onopen={openFrom} />
    </section>
    <section class="page" aria-hidden={page !== 1}>
      <Field {onopen} paused={fieldSettled.current} away={Math.min(1, Math.abs(position - 1))} />
    </section>
  </div>

  <!--
    Pointer devices get arrows. The pager is a drag, and a drag is a poor
    gesture with a mouse — the same reasoning that gives an open app a home
    key instead of a gesture bar. Touch never sees these; it throws the page.
  -->
  <button
    class="arrow left"
    onclick={() => go(page - 1)}
    disabled={page === 0}
    aria-label="previous page"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
  </button>
  <button
    class="arrow right"
    onclick={() => go(page + 1)}
    disabled={page === PAGES - 1}
    aria-label="next page"
  >
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" /></svg>
  </button>

  <div class="dots" role="tablist" aria-label="home pages">
    {#each { length: PAGES } as _, i (i)}
      <button
        class="dot"
        class:on={Math.round(position) === i}
        role="tab"
        aria-selected={page === i}
        aria-label={i === 0 ? 'glance' : 'apps'}
        onclick={() => go(i)}
      ></button>
    {/each}
  </div>
</div>

<style>
  .arrow {
    position: absolute;
    top: 50%;
    z-index: 6;
    display: none;
    place-items: center;
    width: 44px;
    height: 44px;
    margin-top: -22px;
    border-radius: 50%;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.8);
    background:
      radial-gradient(ellipse 70% 50% at 30% 18%, rgba(255, 255, 255, 0.95) 0%, rgba(255, 255, 255, 0) 60%),
      linear-gradient(172deg, rgba(255, 255, 255, 0.72), rgba(232, 248, 253, 0.48));
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 1), 0 6px 16px rgba(13, 63, 143, 0.12);
    transition: transform 0.3s var(--ease-overshoot), opacity 0.26s ease;
  }
  .arrow.left {
    left: 18px;
  }
  .arrow.right {
    right: 18px;
  }
  .arrow svg {
    width: 18px;
    height: 18px;
    stroke: var(--deep);
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* At an end the arrow stays in place rather than disappearing: a control
     that vanishes moves the other one, and a moving target is worse than a
     dim one. */
  .arrow:disabled {
    opacity: 0.24;
    cursor: default;
  }
  .arrow:not(:disabled):hover {
    transform: scale(1.06);
  }
  .arrow:not(:disabled):active {
    transform: scale(0.92);
    transition-duration: var(--press-duration);
    transition-timing-function: var(--ease-press);
  }
  @media (pointer: fine) {
    .arrow {
      display: grid;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .arrow {
      transition: none;
    }
  }

  .home {
    position: fixed;
    inset: 0;
    overflow: hidden;
    animation: settle 0.72s var(--ease-rise);
    touch-action: pan-y;
  }

  @keyframes settle {
    from { opacity: 0; transform: translateY(18px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }

  /* the orbs float forever; behind an app that is invisible work */
  .home.paused :global(.orb) {
    animation-play-state: paused;
  }

  .track {
    display: flex;
    height: 100%;
    width: 100%;
  }
  .home.dragging .track,
  .home.settling .track {
    will-change: transform;
  }
  .page {
    flex: 0 0 100%;
    width: 100%;
    height: 100%;
  }

  .dots {
    position: absolute;
    left: 0;
    right: 0;
    bottom: calc(16px + env(safe-area-inset-bottom));
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 7px;
    z-index: 3;
  }
  .dot {
    width: 6px;
    height: 6px;
    padding: 0;
    border: none;
    border-radius: 99px;
    cursor: pointer;
    background: rgba(13, 63, 143, 0.22);
    transition: width 0.4s var(--ease-overshoot), background 0.4s ease;
  }
  .dot.on {
    width: 20px;
    background: rgba(13, 63, 143, 0.5);
  }
</style>

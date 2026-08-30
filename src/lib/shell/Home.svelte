<script lang="ts">
  import Glance from './pages/Glance.svelte';
  import Field from './pages/Field.svelte';
  import { pager, type PageDrag, type PageRelease } from '../gestures/pager';
  import { play } from '../sound/engine';
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

  let track: HTMLDivElement | undefined = $state();
  let dragging = $state(false);
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
    dragging = true;
    if (track) track.style.transition = 'none';
  }

  /* Release speed sets the duration, same as the app dismissal: a flick lands
     quickly, a slow release drifts home. */
  function release(r: PageRelease) {
    dragging = false;
    if (!track) return;
    const remaining = Math.abs(r.page - position) * (track.clientWidth || window.innerWidth);
    const ms = Math.min(560, Math.max(220, remaining / Math.max(r.velocity, 0.4)));
    track.style.transition = `transform ${ms}ms var(--ease-bloom)`;
    track.style.transform = `translate3d(${-r.page * 100}%, 0, 0)`;
    dragPosition = r.page;
    if (r.page !== page) {
      play('page');
      onpage(r.page);
    }
  }

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
  use:pager={{ page, pages: PAGES, bottomReserve: 52, onstart, onmove: paint, onrelease: release }}
>
  <div
    bind:this={track}
    class="track"
    style:transform={dragging ? undefined : `translate3d(${-page * 100}%, 0, 0)`}
    style:transition={dragging ? 'none' : `transform 520ms var(--ease-bloom)`}
  >
    <section class="page" aria-hidden={page !== 0}>
      <Glance paused={paused || page !== 0} away={Math.min(1, Math.abs(position - 0))} onopen={openFrom} />
    </section>
    <section class="page" aria-hidden={page !== 1}>
      <Field {onopen} paused={paused || page !== 1} away={Math.min(1, Math.abs(position - 1))} />
    </section>
  </div>

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
  .home.dragging .track {
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

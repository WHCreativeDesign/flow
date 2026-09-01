<script lang="ts">
  import Orb from '../../components/Orb.svelte';
  import { apps } from '../../apps/registry';
  import { settings } from '../../settings.svelte';
  import type { BloomOrigin } from '../state.svelte';

  interface Props {
    onopen: (appId: string, origin: BloomOrigin) => void;
    paused?: boolean;
    /** 0 when centred, 1 when fully off — drives parallax */
    away?: number;
  }
  let { onopen, paused = false, away = 0 }: Props = $props();

  let now = $state(new Date());
  $effect(() => {
    if (paused) return;
    const t = setInterval(() => (now = new Date()), 15_000);
    return () => clearInterval(t);
  });

  const time = $derived(
    now
      .toLocaleTimeString([], settings.current.use24hClock
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: 'numeric', minute: '2-digit' })
      .toLowerCase()
  );
  const greeting = $derived.by(() => {
    const h = now.getHours();
    if (h < 5) return 'still up';
    if (h < 12) return 'good morning';
    if (h < 18) return 'good afternoon';
    return 'good evening';
  });
</script>

<!-- home: a field of orbs. Not an icon grid — a surface of held apps. -->
<div class="field-page" style:--away={away}>
  <div class="status">
    <span class="pill">{settings.current.deviceLabel}</span>
    <span class="pill time">{time}</span>
  </div>

  <div class="body">
    <header class="greet">
      <div class="mark" aria-hidden="true">flow</div>
      <div class="hello">{greeting}</div>
    </header>

    <div class="field">
      {#each apps as app, i (app.id)}
        <Orb {app} index={i} {onopen} />
      {/each}
    </div>
  </div>
</div>

<style>
  .field-page {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: max(18px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    transform: translate3d(calc(var(--away) * -22px), 0, 0);
    opacity: calc(1 - var(--away) * 0.35);
  }

  .status {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: none;
  }

  /*
    Chromebooks (and any windowed, non-fullscreen browser) routinely give
    this page a short viewport — a few hundred px tall, nothing like a phone
    held upright. The old layout centered the greeting and the orb grid with
    `margin: auto`, which only works when there is slack to distribute: with
    a negative deficit instead, every auto margin resolves to 0 at once, so
    the greeting and the first row of orbs ended up touching with no gap at
    all, glow bleeding straight over the text above it.

    The status pills stay pinned to the top edge no matter what — they are
    not part of this group. `.body` takes the remaining space below them and
    centers the greeting + grid within *that*: `justify-content: safe center`
    still centers when there is room, but falls back to top-alignment
    instead of centering into overflow when there is not, and `min-height: 0`
    plus its own scroll lets it actually shrink inside the flex column
    instead of forcing the whole page taller than the viewport. `gap`
    replaces the old per-child auto margins so there is always a real,
    guaranteed minimum space between the greeting and the grid, not a
    theoretical one that can collapse to zero.
  */
  .body {
    flex: 1;
    min-height: 0;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: safe center;
    gap: clamp(10px, 2.5vh, 28px);
    overflow-y: auto;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: lowercase;
    color: var(--deep);
    border-radius: 999px;
    background: var(--glass-bg);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
  }
  .pill.time {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }

  .greet {
    flex: none;
    text-align: center;
    transform: scale(calc(1 - var(--away) * 0.05));
  }
  .mark {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 44px;
    letter-spacing: -0.05em;
    line-height: 1;
    background: linear-gradient(168deg, #9adcf7 0%, var(--azure) 42%, var(--royal) 78%, var(--deep) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .hello {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
  }

  /*
    Orb size used to be capped by width alone (up to 148px, however tall the
    viewport was), so three rows of them could ask for more height than a
    short window has regardless of what the greeting above did. Capping the
    column size with a `vh`-based `min()` too means the whole grid shrinks
    on a short viewport instead of just running out of room — a Chromebook
    browser window gets smaller orbs, not an overlapping or cut-off screen.
  */
  .field {
    display: grid;
    grid-template-columns: repeat(3, minmax(64px, min(148px, 16vh)));
    gap: clamp(10px, 3.5vh, 34px) clamp(14px, 4vw, 30px);
    width: min(600px, 100%);
    justify-content: center;
    flex: none;
  }
</style>

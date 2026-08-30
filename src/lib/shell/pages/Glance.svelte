<script lang="ts">
  import { settings } from '../../settings.svelte';
  import { collect, type Note } from '../../notifications.svelte';
  import { GLYPHS } from '../../data/weather';
  import { play } from '../../sound/engine';

  interface Props {
    paused?: boolean;
    /** 0 when this page is centred, 1 when fully off — drives parallax */
    away?: number;
    onopen: (appId: string, from: DOMRect) => void;
  }
  let { paused = false, away = 0, onopen }: Props = $props();

  let now = $state(new Date());
  $effect(() => {
    if (paused) return;
    const t = setInterval(() => (now = new Date()), 1000);
    return () => clearInterval(t);
  });

  let notes = $state<Note[]>([]);
  let loaded = $state(false);
  $effect(() => {
    let dead = false;
    void collect().then((n) => {
      if (!dead) {
        notes = n;
        loaded = true;
      }
    });
    return () => {
      dead = true;
    };
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

  const weather = $derived(notes.find((n) => n.kind === 'weather') ?? null);
  const feed = $derived(notes.filter((n) => n.kind !== 'weather'));

  const ICONS: Record<Note['kind'], string> = {
    weather: '',
    notes: '<path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M15 4v4h4M8.5 12h7M8.5 16h4.5"/>',
    messages: '<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9.5L5 20v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
    camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>',
    music: '<path d="M9 17V5.5l11-2V15"/><ellipse cx="6" cy="17.5" rx="3" ry="2.6"/><ellipse cx="17" cy="15.5" rx="3" ry="2.6"/>'
  };

  function press(e: MouseEvent, app: string) {
    play('press');
    onopen(app, (e.currentTarget as HTMLElement).getBoundingClientRect());
  }
</script>

<!--
  glance — the first page. A lock screen in spirit: the clock owns it, and
  everything below is a quiet read of the instance's real state.
-->
<div class="glance" style:--away={away}>
  <div class="clock">
    <div class="time">{time}</div>
    <div class="date">{date}</div>
  </div>

  {#if weather}
    <button class="wx sheet" onclick={(e) => press(e, 'weather')}>
      <svg class="wx-icon" viewBox="0 0 24 24" aria-hidden="true">
        <!-- eslint-disable-next-line svelte/no-at-html-tags — static glyph table -->
        {@html GLYPHS[weather.glyph ?? 'cloud']}
      </svg>
      <span class="wx-text">
        <span class="wx-title">{weather.title}</span>
        <span class="wx-body">{weather.body}</span>
      </span>
    </button>
  {/if}

  <!--
    The assistant is not wired up yet. This is deliberately inert and says so:
    a placeholder that looked live would be a lie about what the system does.
  -->
  <div class="ai sheet" aria-label="ai summary, not connected yet">
    <div class="ai-head">
      <span class="ai-dot" aria-hidden="true"></span>
      <span class="ai-label">daily summary</span>
      <span class="ai-tag">placeholder</span>
    </div>
    <div class="ai-lines" aria-hidden="true">
      <span style="width: 92%"></span>
      <span style="width: 78%"></span>
      <span style="width: 54%"></span>
    </div>
    <p class="ai-note">your assistant will summarise the day here once it is connected.</p>
  </div>

  <div class="feed">
    {#if loaded && feed.length === 0}
      <div class="quiet">nothing waiting on this instance</div>
    {/if}
    {#each feed as n, i (n.id)}
      <button class="note sheet" style:--i={i} onclick={(e) => press(e, n.app)}>
        <span class="note-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24">
            <!-- eslint-disable-next-line svelte/no-at-html-tags — static icon table -->
            {@html ICONS[n.kind]}
          </svg>
        </span>
        <span class="note-text">
          <span class="note-title">{n.title}</span>
          <span class="note-body">{n.body}</span>
        </span>
      </button>
    {/each}
  </div>

  <!-- inert: the assistant is not connected -->
  <div class="ask sheet" aria-hidden="true">
    <span class="ask-placeholder">ask flow…</span>
    <span class="ask-send"></span>
  </div>
</div>

<style>
  .glance {
    height: 100%;
    display: flex;
    flex-direction: column;
    gap: 12px;
    /* the page dots live at the bottom of the shell; leave them room */
    padding: max(26px, env(safe-area-inset-top)) 22px 40px;
    /* content trails the page as it leaves, which reads as depth rather than
       a flat slide */
    transform: translate3d(calc(var(--away) * 22px), 0, 0);
    opacity: calc(1 - var(--away) * 0.35);
  }

  .clock {
    flex: none;
    text-align: center;
    padding: 10px 0 6px;
    transform: scale(calc(1 - var(--away) * 0.06));
    transform-origin: 50% 40%;
  }
  .time {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: clamp(58px, 17vw, 104px);
    line-height: 0.94;
    letter-spacing: -0.05em;
    color: var(--deep);
    text-shadow: 0 2px 0 rgba(255, 255, 255, 0.75);
    font-variant-numeric: tabular-nums;
  }
  .date {
    margin-top: 6px;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
  }

  /* Glass without backdrop-filter: these are large surfaces over a moving
     atmosphere, and a live backdrop blur would re-sample it every frame. */
  .sheet {
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.85);
    background: linear-gradient(168deg, rgba(255, 255, 255, 0.82), rgba(226, 245, 253, 0.6));
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 1),
      inset 0 -10px 20px rgba(53, 169, 236, 0.08),
      0 10px 26px rgba(13, 63, 143, 0.12);
  }

  .wx,
  .note {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 18px;
    text-align: left;
    font: inherit;
    cursor: pointer;
    flex: none;
    transition: transform 0.34s var(--ease-overshoot);
  }
  .wx:active,
  .note:active {
    transform: scale(0.97);
    transition-duration: var(--press-duration);
    transition-timing-function: var(--ease-press);
  }

  .wx-icon {
    width: 34px;
    height: 34px;
    flex: none;
    stroke: var(--deep);
    stroke-width: 1.6;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .wx-text,
  .note-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }
  .wx-title,
  .note-title {
    font-size: 14.5px;
    font-weight: 700;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .wx-body,
  .note-body {
    font-size: 12.5px;
    color: var(--ink-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ai {
    flex: none;
    padding: 16px 18px 14px;
  }
  .ai-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ai-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: radial-gradient(circle at 30% 28%, #fff, var(--aqua) 45%, var(--azure) 100%);
    opacity: 0.5;
  }
  .ai-label {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--royal);
  }
  .ai-tag {
    margin-left: auto;
    font-size: 9.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    border: 1px solid rgba(138, 163, 194, 0.4);
    border-radius: 999px;
    padding: 3px 8px;
  }
  .ai-lines {
    display: flex;
    flex-direction: column;
    gap: 7px;
    margin: 12px 0 10px;
  }
  .ai-lines span {
    height: 8px;
    border-radius: 99px;
    background: linear-gradient(90deg, rgba(53, 169, 236, 0.16), rgba(159, 232, 221, 0.3), rgba(53, 169, 236, 0.16));
    background-size: 220% 100%;
    animation: drift-sheen 4.5s ease-in-out infinite;
  }
  .ai-lines span:nth-child(2) { animation-delay: -1.5s; }
  .ai-lines span:nth-child(3) { animation-delay: -3s; }
  @keyframes drift-sheen {
    0%, 100% { background-position: 0% 0; }
    50% { background-position: 100% 0; }
  }
  .ai-note {
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-faint);
  }

  .feed {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto;
    overscroll-behavior: contain;
    touch-action: pan-y;
    scrollbar-width: none;
  }
  .feed::-webkit-scrollbar {
    display: none;
  }
  .note {
    animation: note-in 0.6s var(--ease-rise) backwards;
    animation-delay: calc(var(--i) * 70ms + 120ms);
  }
  @keyframes note-in {
    from { opacity: 0; transform: translateY(14px) scale(0.97); }
    to { opacity: 1; transform: none; }
  }
  .note-icon {
    width: 34px;
    height: 34px;
    flex: none;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(ellipse 58% 42% at 32% 20%, rgba(255, 255, 255, 0.98) 0%, transparent 62%),
      radial-gradient(circle at 50% 58%, rgba(255, 255, 255, 0.3) 0%, rgba(127, 212, 245, 0.5) 52%, rgba(53, 169, 236, 0.6) 100%);
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.9), 0 4px 9px rgba(13, 63, 143, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.75);
  }
  .note-icon svg {
    width: 17px;
    height: 17px;
    stroke: var(--deep);
    stroke-width: 1.7;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .quiet {
    text-align: center;
    font-size: 12.5px;
    color: var(--ink-faint);
    padding: 18px 0;
  }

  .ask {
    flex: none;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 13px 16px;
    opacity: 0.55;
  }
  .ask-placeholder {
    flex: 1;
    font-size: 14px;
    color: var(--ink-faint);
  }
  .ask-send {
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: linear-gradient(168deg, rgba(127, 212, 245, 0.5), rgba(30, 111, 217, 0.4));
  }
</style>

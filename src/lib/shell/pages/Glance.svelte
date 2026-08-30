<script lang="ts">
  import { settings } from '../../settings.svelte';
  import { collect, clearNote, suggestions, type Note } from '../../notifications.svelte';
  import { GLYPHS } from '../../data/weather';
  import { play } from '../../sound/engine';
  import { swipeAway } from '../../gestures/swipeAway';

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

  const ai = $derived(settings.current.aiEnabled);
  const weather = $derived(notes.find((n) => n.kind === 'weather') ?? null);
  const feed = $derived(notes.filter((n) => n.kind !== 'weather'));

  /* A cleared card animates out on its own before it leaves the list, so the
     list closes up behind it instead of snapping shut underneath it. */
  let leaving = $state<Set<string>>(new Set());
  let exitTimers: ReturnType<typeof setTimeout>[] = [];

  function dismiss(n: Note) {
    if (leaving.has(n.id)) return;
    leaving = new Set(leaving).add(n.id);
    play('dismiss');
    void clearNote(n.signature);
    exitTimers.push(
      setTimeout(() => {
        notes = notes.filter((x) => x.id !== n.id);
        const next = new Set(leaving);
        next.delete(n.id);
        leaving = next;
      }, 300)
    );
  }

  $effect(() => () => exitTimers.forEach(clearTimeout));

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
  <div class="lead">
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
  </div>

  <div class="side">
    <!--
      The assistant is not wired up yet. This is deliberately inert and says so:
      a placeholder that looked live would be a lie about what the system does.
    -->
    {#if ai}
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

    <div class="suggests" aria-label="suggestions, not connected yet">
      {#each suggestions as sg, i (sg.id)}
        <span class="chip" style:--i={i}>{sg.text}</span>
      {/each}
    </div>
    {/if}

    {#if loaded && feed.length > 0}
      <div class="feed-label">waiting</div>
    {/if}
    <div class="feed">
      {#if loaded && feed.length === 0}
        <div class="quiet">nothing waiting on this instance</div>
      {/if}
      {#each feed as n, i (n.id)}
        <div
          class="note-row"
          class:leaving={leaving.has(n.id)}
          style:--i={i}
          use:swipeAway={{ onaway: () => dismiss(n) }}
        >
          <button class="note sheet" onclick={(e) => press(e, n.app)}>
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
          <!-- pointer devices get a target; touch throws the card instead -->
          <button class="note-x" onclick={() => dismiss(n)} aria-label={`clear ${n.title}`}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      {/each}
    </div>

    {#if ai}
      <!-- inert: the assistant is not connected -->
      <div class="ask sheet" aria-hidden="true">
        <span class="ask-placeholder">ask flow…</span>
        <span class="ask-send"></span>
      </div>
    {/if}
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
    /* phone: one column, so the wrappers are transparent to layout */
    --lead-align: center;
    /* never let the stack stretch past a comfortable measure — a tablet-width
       window would otherwise get the same over-long bars as a desktop did */
    width: min(560px, 100%);
    margin: 0 auto;
    /* content trails the page as it leaves, which reads as depth rather than
       a flat slide */
    transform: translate3d(calc(var(--away) * 22px), 0, 0);
    opacity: calc(1 - var(--away) * 0.35);
  }

  .lead,
  .side {
    display: contents;
  }

  .clock {
    flex: none;
    text-align: var(--lead-align);
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

  .feed-label {
    display: none;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-faint);
    padding-left: 4px;
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
    /*
      `overflow-y: auto` clips the other axis too, which was cutting each
      card's soft shadow off square at the container's edge — a hard-edged box
      around a rounded card, worst on hover when the card lifts into it. The
      padding gives the shadow room to fall; the negative margin puts the
      layout back where it was.
    */
    padding: 12px 16px;
    margin: -12px -16px;
  }
  .feed::-webkit-scrollbar {
    display: none;
  }

  .note-row {
    position: relative;
    flex: none;
    display: flex;
    align-items: center;
    overflow: visible;
    touch-action: pan-y;
    animation: note-in 0.62s var(--ease-rise) backwards;
    animation-delay: calc(var(--i) * 70ms + 120ms);
  }
  /* the row collapses after the card has been thrown, so the list closes up */
  .note-row.leaving {
    animation: note-out 0.3s var(--ease-bloom) forwards;
    pointer-events: none;
  }
  @keyframes note-in {
    from { opacity: 0; transform: translateY(16px) scale(0.96); }
    to { opacity: 1; transform: none; }
  }
  @keyframes note-out {
    from { opacity: 1; max-height: 96px; margin-bottom: 0; }
    to { opacity: 0; max-height: 0; margin-bottom: -10px; }
  }

  .note {
    flex: 1;
    min-width: 0;
  }

  /* clear target — pointer devices only; touch throws the card instead */
  .note-x {
    display: none;
    position: absolute;
    right: 9px;
    width: 24px;
    height: 24px;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--ink-faint);
    background: rgba(255, 255, 255, 0.9);
    box-shadow: 0 2px 6px rgba(13, 63, 143, 0.16);
    opacity: 0;
    transform: scale(0.82);
    transition: opacity 0.22s ease, transform 0.3s var(--ease-overshoot), color 0.2s ease;
  }
  .note-x svg {
    width: 11px;
    height: 11px;
    stroke: currentColor;
    stroke-width: 2.2;
    fill: none;
    stroke-linecap: round;
  }
  .note-x:hover {
    color: var(--royal);
  }
  .note-x:active {
    transform: scale(0.88);
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

  .suggests {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    padding: 0 2px;
  }
  .chip {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-soft);
    padding: 7px 13px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.8);
    background: linear-gradient(168deg, rgba(255, 255, 255, 0.66), rgba(226, 245, 253, 0.45));
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
    /* inert, like everything else the assistant owns until it is connected */
    opacity: 0.72;
    animation: note-in 0.55s var(--ease-rise) backwards;
    animation-delay: calc(var(--i) * 60ms + 200ms);
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

  /*
    Desktop. The phone stack full-bleed on a wide screen is just long bars and
    dead space, so the page becomes a composition instead: the clock holds a
    quiet left column, and everything that is a *list* sits in a narrow right
    rail at reading width. Cards get denser, not wider.
  */
  @media (min-width: 900px) {
    .glance {
      --lead-align: left;
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(340px, 400px);
      grid-template-rows: 1fr;
      align-content: center;
      column-gap: clamp(40px, 7vw, 96px);
      width: min(1180px, 100%);
      padding: 40px clamp(32px, 5vw, 72px) 56px;
    }

    .lead {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 22px;
      min-width: 0;
    }
    .side {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 12px;
      min-width: 0;
    }

    .clock {
      padding: 0;
    }
    .time {
      font-size: clamp(84px, 8.5vw, 132px);
    }
    .date {
      margin-top: 10px;
      font-size: 15px;
    }

    /* the weather card carries the left column, so it can be generous */
    .wx {
      align-self: flex-start;
      gap: 18px;
      padding: 20px 26px;
      border-radius: 26px;
      max-width: 420px;
    }
    .wx-icon {
      width: 44px;
      height: 44px;
    }
    .wx-title {
      font-size: 17px;
    }
    .wx-body {
      font-size: 13px;
    }

    /* the rail is a list: compact rows, not full-width slabs */
    .ai {
      padding: 15px 17px 13px;
      border-radius: 20px;
    }
    .ai-lines {
      margin: 10px 0 9px;
    }
    .ai-lines span {
      height: 7px;
    }

    .feed-label {
      display: block;
      margin-top: 6px;
    }
    .feed {
      flex: 0 1 auto;
      gap: 8px;
    }
    .note {
      padding: 11px 14px;
      border-radius: 18px;
      gap: 12px;
    }
    .note-icon {
      width: 30px;
      height: 30px;
    }
    .note-icon svg {
      width: 15px;
      height: 15px;
    }
    .note-title {
      font-size: 13.5px;
    }
    .note-body {
      font-size: 12px;
    }
    /* a pointer can reach these, so let them answer to it */
    .note:hover,
    .wx:hover {
      transform: translateY(-2px);
    }
    .note-x {
      display: flex;
    }
    .note-row:hover .note-x,
    .note-x:focus-visible {
      opacity: 1;
      transform: scale(1);
    }
    /* keep the text clear of the button while it is showing */
    .note-row:hover .note-text {
      padding-right: 20px;
    }

    .ask {
      margin-top: 6px;
      padding: 12px 15px;
      border-radius: 18px;
    }
  }

  /* short desktop windows: give the rail its own scroll rather than squashing */
  @media (min-width: 900px) and (max-height: 620px) {
    .time {
      font-size: clamp(64px, 6vw, 92px);
    }
    .side {
      justify-content: flex-start;
      overflow-y: auto;
      scrollbar-width: none;
    }
    .side::-webkit-scrollbar {
      display: none;
    }
  }
</style>

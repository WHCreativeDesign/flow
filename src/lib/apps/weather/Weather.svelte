<script lang="ts">
  import { instance } from '../../sync';
  import { play } from '../../sound/engine';

  import {
    GLYPHS,
    codeOf,
    fetchForecast,
    searchPlaces,
    toF,
    type Forecast,
    type Place
  } from '../../data/weather';

  let place = $state<Place | null>(null);
  let wx = $state<Forecast | null>(null);
  let phase = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let query = $state('');
  let results = $state<Place[]>([]);
  let searching = $state(false);
  let useF = $state(false);
  let disposed = false;
  let inflight: AbortController | null = null;

  const t = (c: number) => toF(c, useF);

  async function fetchWx(p: Place) {
    phase = 'loading';
    inflight?.abort();
    const ctl = (inflight = new AbortController());
    try {
      const next = await fetchForecast(p, ctl.signal);
      if (disposed) return;
      wx = next;
      phase = 'ready';
      place = p;
      void instance.setAppState('weather', { place: p, useF });
    } catch (e) {
      if (disposed || (e instanceof DOMException && e.name === 'AbortError')) return;
      phase = 'error';
      play('deny');
    }
  }

  function locate() {
    play('tap');
    phase = 'loading';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (disposed) return;
        void fetchWx({
          name: 'where you are',
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        });
      },
      () => {
        if (disposed) return;
        phase = place ? 'ready' : 'idle';
        play('deny');
      },
      { timeout: 12000 }
    );
  }

  let searchTimer: ReturnType<typeof setTimeout>;
  function onQuery(q: string) {
    query = q;
    clearTimeout(searchTimer);
    if (q.trim().length < 2) {
      results = [];
      return;
    }
    searching = true;
    searchTimer = setTimeout(async () => {
      try {
        if (disposed) return;
        results = await searchPlaces(q);
      } catch {
        results = [];
      } finally {
        if (!disposed) searching = false;
      }
    }, 350);
  }

  function pick(p: Place) {
    query = '';
    results = [];
    play('tap');
    void fetchWx(p);
  }

  function toggleUnit() {
    useF = !useF;
    play('toggle');
    if (place) void instance.setAppState('weather', { place: $state.snapshot(place), useF });
  }

  $effect(() => {
    disposed = false;
    void instance.getAppState('weather').then((s) => {
      if (disposed) return;
      if (s?.useF) useF = true;
      if (s?.place) void fetchWx(s.place as Place);
      else locate();
    });
    return () => {
      disposed = true;
      clearTimeout(searchTimer);
      inflight?.abort();
    };
  });

  const dayName = (iso: string, i: number) =>
    i === 0 ? 'today' : new Date(iso + 'T12:00').toLocaleDateString([], { weekday: 'short' }).toLowerCase();
  const hourName = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric' }).toLowerCase().replace(' ', '');
</script>

{#snippet glyph(code: number, size: number)}
  <svg viewBox="0 0 24 24" width={size} height={size} class="wx-glyph" aria-hidden="true">
    <!-- eslint-disable-next-line svelte/no-at-html-tags — static glyph table -->
    {@html GLYPHS[codeOf(code).glyph]}
  </svg>
{/snippet}

<div class="fl-app weather">
  <div class="topbar">
    <div class="search">
      <input
        class="fl-input"
        placeholder="search a place…"
        value={query}
        oninput={(e) => onQuery(e.currentTarget.value)}
      />
      {#if results.length || searching}
        <div class="results fl-glass">
          {#if searching}<div class="result muted">searching…</div>{/if}
          {#each results as r (r.name + r.lat)}
            <button class="result" onclick={() => pick(r)}>{r.name.toLowerCase()}</button>
          {/each}
        </div>
      {/if}
    </div>
    <button class="fl-btn fl-round quiet" onclick={locate} aria-label="use my location">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3" /></svg>
    </button>
    <button class="fl-btn fl-round quiet" onclick={toggleUnit} aria-label="toggle units">°{useF ? 'F' : 'C'}</button>
  </div>

  {#if phase === 'loading' && !wx}
    <div class="fl-empty"><div class="big">reading the sky…</div></div>
  {:else if phase === 'error' && !wx}
    <div class="fl-empty">
      <div class="big">the sky is unreachable</div>
      <div>check your connection, or search a place above</div>
    </div>
  {:else if phase === 'idle'}
    <div class="fl-empty">
      <div class="big">where are you?</div>
      <div>search a place, or tap the locator to use this device's location</div>
    </div>
  {:else if wx}
    <div class="wx fl-scroll">
      <div class="now">
        {@render glyph(wx.code, 84)}
        <div class="now-temp">{t(wx.tempC)}°</div>
        <div class="now-desc">{codeOf(wx.code).label}</div>
        <div class="now-place">{place?.name.toLowerCase()}</div>
        <div class="now-meta">
          feels {t(wx.feelsC)}° · wind {wx.wind} km/h · humidity {wx.humidity}%
        </div>
      </div>

      <div class="strip fl-glass">
        <div class="strip-scroll fl-scroll">
          {#each wx.hourly as h, i (h.time)}
            <div class="hour">
              <span class="h-name">{i === 0 ? 'now' : hourName(h.time)}</span>
              {@render glyph(h.code, 24)}
              <span class="h-temp">{t(h.tempC)}°</span>
            </div>
          {/each}
        </div>
      </div>

      <div class="days fl-glass">
        {#each wx.daily as d, i (d.date)}
          <div class="day">
            <span class="d-name">{dayName(d.date, i)}</span>
            {@render glyph(d.code, 22)}
            <span class="d-lo">{t(d.loC)}°</span>
            <span class="d-bar"><i style:--lo={t(d.loC)} style:--hi={t(d.hiC)}></i></span>
            <span class="d-hi">{t(d.hiC)}°</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .weather {
    gap: 12px;
  }
  .topbar {
    flex: none;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .search {
    flex: 1;
    position: relative;
  }
  .results {
    position: absolute;
    top: calc(100% + 8px);
    left: 0;
    right: 0;
    z-index: 5;
    padding: 6px;
    display: flex;
    flex-direction: column;
  }
  .result {
    border: none;
    background: none;
    font: inherit;
    text-align: left;
    padding: 11px 14px;
    border-radius: 12px;
    cursor: pointer;
    font-size: 14px;
    color: var(--ink);
  }
  .result:hover {
    background: rgba(53, 169, 236, 0.12);
  }
  .result.muted {
    color: var(--ink-faint);
    cursor: default;
  }

  .wx {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding-bottom: 10px;
  }

  :global(.wx-glyph) {
    stroke: var(--deep);
    stroke-width: 1.6;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 2px 0 rgba(255, 255, 255, 0.8));
  }

  .now {
    flex: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 18px 0 6px;
  }
  .now-temp {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 76px;
    letter-spacing: -0.05em;
    line-height: 1;
    color: var(--deep);
    text-shadow: 0 2px 0 rgba(255, 255, 255, 0.85);
    margin-top: 6px;
  }
  .now-desc {
    font-size: 16px;
    font-weight: 600;
    color: var(--ink-soft);
    margin-top: 6px;
  }
  .now-place {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--royal);
    margin-top: 10px;
  }
  .now-meta {
    font-size: 12.5px;
    color: var(--ink-faint);
    margin-top: 6px;
  }

  .strip {
    flex: none;
    padding: 14px 6px;
  }
  .strip-scroll {
    display: flex;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    touch-action: pan-x;
    padding: 0 8px;
  }
  .hour {
    flex: none;
    width: 56px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
    font-size: 12px;
  }
  .h-name {
    color: var(--ink-faint);
    font-weight: 600;
  }
  .h-temp {
    font-weight: 700;
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }

  .days {
    flex: none;
    padding: 8px 18px;
    display: flex;
    flex-direction: column;
  }
  .day {
    display: grid;
    grid-template-columns: 52px 30px 34px 1fr 34px;
    align-items: center;
    gap: 10px;
    padding: 9px 0;
    font-size: 13.5px;
  }
  .day + .day {
    border-top: 1px solid rgba(30, 111, 217, 0.1);
  }
  .d-name {
    font-weight: 600;
    color: var(--ink-soft);
  }
  .d-lo,
  .d-hi {
    font-variant-numeric: tabular-nums;
    color: var(--ink-faint);
  }
  .d-hi {
    color: var(--ink);
    font-weight: 700;
    text-align: right;
  }
  .d-bar {
    height: 5px;
    border-radius: 99px;
    background: rgba(30, 111, 217, 0.12);
    position: relative;
    overflow: hidden;
  }
  .d-bar i {
    position: absolute;
    inset: 0;
    border-radius: 99px;
    background: linear-gradient(90deg, var(--sky), var(--azure), var(--royal));
  }
</style>

<script lang="ts">
  import { instance } from '../../sync';
  import { play } from '../../sound/engine';

  interface Place {
    name: string;
    lat: number;
    lon: number;
  }
  interface Wx {
    tempC: number;
    feelsC: number;
    code: number;
    wind: number;
    humidity: number;
    hourly: { time: string; tempC: number; code: number }[];
    daily: { date: string; code: number; hiC: number; loC: number }[];
  }

  let place = $state<Place | null>(null);
  let wx = $state<Wx | null>(null);
  let phase = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let query = $state('');
  let results = $state<Place[]>([]);
  let searching = $state(false);
  let useF = $state(false);
  let disposed = false;
  let inflight: AbortController | null = null;

  const CODES: Record<number, { label: string; glyph: string }> = {
    0: { label: 'clear', glyph: 'sun' },
    1: { label: 'mostly clear', glyph: 'sun' },
    2: { label: 'partly cloudy', glyph: 'suncloud' },
    3: { label: 'overcast', glyph: 'cloud' },
    45: { label: 'fog', glyph: 'fog' },
    48: { label: 'rime fog', glyph: 'fog' },
    51: { label: 'light drizzle', glyph: 'rain' },
    53: { label: 'drizzle', glyph: 'rain' },
    55: { label: 'heavy drizzle', glyph: 'rain' },
    61: { label: 'light rain', glyph: 'rain' },
    63: { label: 'rain', glyph: 'rain' },
    65: { label: 'heavy rain', glyph: 'rain' },
    66: { label: 'freezing rain', glyph: 'rain' },
    67: { label: 'freezing rain', glyph: 'rain' },
    71: { label: 'light snow', glyph: 'snow' },
    73: { label: 'snow', glyph: 'snow' },
    75: { label: 'heavy snow', glyph: 'snow' },
    77: { label: 'snow grains', glyph: 'snow' },
    80: { label: 'showers', glyph: 'rain' },
    81: { label: 'showers', glyph: 'rain' },
    82: { label: 'violent showers', glyph: 'rain' },
    85: { label: 'snow showers', glyph: 'snow' },
    86: { label: 'snow showers', glyph: 'snow' },
    95: { label: 'thunderstorm', glyph: 'storm' },
    96: { label: 'thunderstorm', glyph: 'storm' },
    99: { label: 'thunderstorm', glyph: 'storm' }
  };
  const codeOf = (c: number) => CODES[c] ?? { label: '—', glyph: 'cloud' };

  const GLYPHS: Record<string, string> = {
    sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.4M12 19.1v2.4M21.5 12h-2.4M4.9 12H2.5M18.7 5.3l-1.7 1.7M7 17l-1.7 1.7M18.7 18.7L17 17M7 7 5.3 5.3"/>',
    suncloud: '<circle cx="8" cy="8" r="3"/><path d="M8 2.8v1.6M2.8 8h1.6M4.3 4.3l1.1 1.1M13 8.5a4.5 4.5 0 0 0-.6.05A5 5 0 0 0 3 11.5 3.3 3.3 0 0 0 5.5 18h8a4 4 0 1 0-.5-7.97" transform="translate(2.5 1.5)"/>',
    cloud: '<path d="M15 18.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 18.5h9.5z"/>',
    fog: '<path d="M15 13a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11 2.2A3.6 3.6 0 0 0 5 13h10zM4 16.5h13M6.5 19.5h11"/>',
    rain: '<path d="M15 14.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 14.5h9.5z"/><path d="M8 17.5l-1 2.5M12.5 17.5l-1 2.5M17 17.5l-1 2.5"/>',
    snow: '<path d="M15 14.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 14.5h9.5z"/><path d="M8 18.2v.01M12 20v.01M16 18.2v.01"/>',
    storm: '<path d="M15 13.5a4.5 4.5 0 0 0 0-9 6 6 0 0 0-11.3 1.7A4 4 0 0 0 5.5 13.5h9.5z"/><path d="M12.5 13.5 10 17.5h3.5L11 21.5"/>'
  };

  const t = (c: number) => Math.round(useF ? (c * 9) / 5 + 32 : c);

  async function fetchWx(p: Place) {
    phase = 'loading';
    inflight?.abort();
    const ctl = (inflight = new AbortController());
    try {
      const u = new URL('https://api.open-meteo.com/v1/forecast');
      u.searchParams.set('latitude', String(p.lat));
      u.searchParams.set('longitude', String(p.lon));
      u.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,wind_speed_10m,relative_humidity_2m');
      u.searchParams.set('hourly', 'temperature_2m,weather_code');
      u.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
      u.searchParams.set('forecast_days', '7');
      u.searchParams.set('timezone', 'auto');
      const r = await fetch(u, { signal: ctl.signal });
      if (!r.ok) throw new Error(String(r.status));
      const d = await r.json();
      if (disposed) return;

      const nowIdx = Math.max(0, d.hourly.time.findIndex((x: string) => new Date(x) >= new Date()) - 1);
      wx = {
        tempC: d.current.temperature_2m,
        feelsC: d.current.apparent_temperature,
        code: d.current.weather_code,
        wind: Math.round(d.current.wind_speed_10m),
        humidity: d.current.relative_humidity_2m,
        hourly: d.hourly.time.slice(nowIdx, nowIdx + 24).map((time: string, i: number) => ({
          time,
          tempC: d.hourly.temperature_2m[nowIdx + i],
          code: d.hourly.weather_code[nowIdx + i]
        })),
        daily: d.daily.time.map((date: string, i: number) => ({
          date,
          code: d.daily.weather_code[i],
          hiC: d.daily.temperature_2m_max[i],
          loC: d.daily.temperature_2m_min[i]
        }))
      };
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
        const u = new URL('https://geocoding-api.open-meteo.com/v1/search');
        u.searchParams.set('name', q.trim());
        u.searchParams.set('count', '5');
        const r = await fetch(u);
        const d = await r.json();
        results = (d.results ?? []).map((x: { name: string; admin1?: string; country_code?: string; latitude: number; longitude: number }) => ({
          name: [x.name, x.admin1, x.country_code].filter(Boolean).join(', '),
          lat: x.latitude,
          lon: x.longitude
        }));
      } catch {
        results = [];
      } finally {
        searching = false;
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
    /* keep clear of the system home button */
    padding-right: 54px;
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

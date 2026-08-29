<script lang="ts">
  import { idb } from '../../storage/idb';
  import { play as cue } from '../../sound/engine';

  interface Track {
    key: string;
    name: string;
    url: string;
  }

  let tracks = $state<Track[]>([]);
  let currentKey = $state<string | null>(null);
  let playing = $state(false);
  let progress = $state(0);
  let duration = $state(0);
  let audio: HTMLAudioElement | undefined = $state();
  let fileInput: HTMLInputElement | undefined = $state();
  let bars = $state<number[]>(Array(24).fill(0));

  const current = $derived(tracks.find((t) => t.key === currentKey) ?? null);
  const index = $derived(tracks.findIndex((t) => t.key === currentKey));

  let ac: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let raf = 0;

  $effect(() => {
    void (async () => {
      const keys = (await idb.keys('tracks')) as string[];
      const loaded: Track[] = [];
      for (const key of keys.sort()) {
        const rec = (await idb.get('tracks', key)) as { name: string; blob: Blob } | undefined;
        if (rec) loaded.push({ key, name: rec.name, url: URL.createObjectURL(rec.blob) });
      }
      tracks = loaded;
    })();
    return () => {
      cancelAnimationFrame(raf);
      tracks.forEach((t) => URL.revokeObjectURL(t.url));
      // an AudioContext holds a render thread; browsers cap them per page,
      // so the analyser graph has to go when the app closes
      analyser?.disconnect();
      analyser = null;
      void ac?.close();
      ac = null;
    };
  });

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    cue('tap');
    const added: Track[] = [];
    for (const file of list) {
      const key = `${Date.now()}-${file.name}`;
      await idb.set('tracks', key, { name: file.name, blob: file });
      added.push({ key, name: file.name, url: URL.createObjectURL(file) });
    }
    tracks = [...tracks, ...added];
    if (!currentKey && added.length) select(added[0].key, false);
  }

  function attachAnalyser() {
    if (ac || !audio) return;
    ac = new AudioContext();
    const src = ac.createMediaElementSource(audio);
    analyser = ac.createAnalyser();
    analyser.fftSize = 64;
    src.connect(analyser).connect(ac.destination);
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser!.getByteFrequencyData(data);
      bars = Array.from({ length: 24 }, (_, i) => data[Math.floor((i * data.length) / 26)] / 255);
      raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function select(key: string, sound = true) {
    if (sound) cue('tap');
    currentKey = key;
    queueMicrotask(() => {
      if (!audio) return;
      attachAnalyser();
      void ac?.resume();
      void audio.play();
    });
  }

  function toggle() {
    if (!audio || !current) return;
    attachAnalyser();
    void ac?.resume();
    if (audio.paused) {
      void audio.play();
    } else {
      audio.pause();
    }
    cue('toggle');
  }

  function step(dir: 1 | -1) {
    if (!tracks.length) return;
    const next = (index + dir + tracks.length) % tracks.length;
    select(tracks[next].key);
  }

  async function removeTrack(t: Track) {
    await idb.del('tracks', t.key);
    URL.revokeObjectURL(t.url);
    if (currentKey === t.key) {
      audio?.pause();
      currentKey = null;
    }
    tracks = tracks.filter((x) => x.key !== t.key);
    cue('toggle');
  }

  function seek(e: Event) {
    if (audio) audio.currentTime = Number((e.currentTarget as HTMLInputElement).value);
  }

  const fmt = (s: number) => {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };
  const prettyName = (n: string) => n.replace(/\.[a-z0-9]+$/i, '').replaceAll('_', ' ');
</script>

<div class="fl-app music">
  <div class="fl-app-head">
    <div>
      <div class="fl-app-title">music</div>
      {#if tracks.length}<div class="fl-app-sub">{tracks.length} {tracks.length === 1 ? 'track' : 'tracks'} in your library</div>{/if}
    </div>
    <button class="fl-btn primary" onclick={() => fileInput?.click()}>
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      add
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="audio/*"
      multiple
      hidden
      onchange={(e) => addFiles(e.currentTarget.files)}
    />
  </div>

  {#if tracks.length === 0}
    <div class="fl-empty">
      <div class="big">your library is empty</div>
      <div>add audio files — they stay on this instance, even after you close the tab</div>
    </div>
  {:else}
    <div class="list fl-scroll">
      {#each tracks as t (t.key)}
        <div class="row fl-glass" class:active={t.key === currentKey}>
          <button class="row-main" onclick={() => select(t.key)}>
            <span class="row-dot" class:on={t.key === currentKey && playing}></span>
            <span class="row-name">{prettyName(t.name)}</span>
          </button>
          <button class="row-x" onclick={() => removeTrack(t)} aria-label="remove track">
            <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>
      {/each}
    </div>

    <div class="player fl-glass">
      <div class="viz" aria-hidden="true">
        {#each bars as b, i (i)}
          <i style:height={`${8 + b * 92}%`} style:opacity={playing ? 0.9 : 0.25}></i>
        {/each}
      </div>
      <div class="np">{current ? prettyName(current.name) : 'nothing playing'}</div>
      <div class="seek">
        <span>{fmt(progress)}</span>
        <input type="range" min="0" max={duration || 1} step="0.1" value={progress} oninput={seek} aria-label="seek" />
        <span>{fmt(duration)}</span>
      </div>
      <div class="ctl">
        <button class="fl-btn fl-round quiet" onclick={() => step(-1)} aria-label="previous">
          <svg viewBox="0 0 24 24"><path d="M17 5v14L8 12l9-7zM6 5v14" /></svg>
        </button>
        <button class="fl-btn fl-round big-btn primary" onclick={toggle} aria-label={playing ? 'pause' : 'play'}>
          {#if playing}
            <svg viewBox="0 0 24 24"><path d="M9 5v14M15 5v14" /></svg>
          {:else}
            <svg viewBox="0 0 24 24"><path d="M8 5.5v13l10-6.5-10-6.5z" /></svg>
          {/if}
        </button>
        <button class="fl-btn fl-round quiet" onclick={() => step(1)} aria-label="next">
          <svg viewBox="0 0 24 24"><path d="M7 5v14l9-7-9-7zM18 5v14" /></svg>
        </button>
      </div>
    </div>
  {/if}

  {#if current}
    <audio
      bind:this={audio}
      src={current.url}
      onplay={() => (playing = true)}
      onpause={() => (playing = false)}
      onended={() => step(1)}
      ontimeupdate={() => (progress = audio?.currentTime ?? 0)}
      ondurationchange={() => (duration = audio?.duration ?? 0)}
    ></audio>
  {/if}
</div>

<style>
  .music {
    gap: 12px;
  }
  .list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 2px 4px;
  }
  .row {
    flex: none;
    display: flex;
    align-items: center;
    border-radius: 16px;
  }
  .row.active {
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 1),
      inset 0 -6px 12px rgba(53, 169, 236, 0.18),
      0 10px 26px rgba(13, 63, 143, 0.18),
      0 0 0 2px rgba(53, 169, 236, 0.35);
  }
  .row-main {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 6px 13px 16px;
    border: none;
    background: none;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }
  .row-dot {
    flex: none;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: rgba(30, 111, 217, 0.2);
  }
  .row-dot.on {
    background: radial-gradient(circle at 30% 28%, #fff, var(--aqua) 45%, var(--azure) 100%);
    box-shadow: 0 0 8px rgba(53, 169, 236, 0.8);
  }
  .row-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-x {
    flex: none;
    border: none;
    background: none;
    cursor: pointer;
    padding: 12px 14px;
    color: var(--ink-faint);
  }
  .row-x svg {
    width: 13px;
    height: 13px;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
  }

  .player {
    flex: none;
    padding: 16px 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .viz {
    height: 34px;
    display: flex;
    align-items: flex-end;
    justify-content: center;
    gap: 3px;
  }
  .viz i {
    width: 5px;
    border-radius: 99px;
    background: linear-gradient(180deg, var(--aqua), var(--azure));
    transition: height 0.1s ease, opacity 0.4s ease;
  }
  .np {
    text-align: center;
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 15.5px;
    letter-spacing: -0.01em;
    color: var(--deep);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .seek {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 11px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }
  .seek input {
    flex: 1;
    appearance: none;
    height: 5px;
    border-radius: 99px;
    background: rgba(30, 111, 217, 0.15);
    outline: none;
    cursor: pointer;
  }
  .seek input::-webkit-slider-thumb {
    appearance: none;
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 25%, #fff, var(--sky) 55%, var(--azure));
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 3px 8px rgba(13, 63, 143, 0.3);
  }
  .seek input::-moz-range-thumb {
    width: 17px;
    height: 17px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 25%, #fff, var(--sky) 55%, var(--azure));
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 3px 8px rgba(13, 63, 143, 0.3);
  }
  .ctl {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .big-btn {
    width: 60px;
    height: 60px;
  }
</style>

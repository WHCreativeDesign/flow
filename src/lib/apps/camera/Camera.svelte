<script lang="ts">
  import { idb } from '../../storage/idb';
  import { play } from '../../sound/engine';
  import Pane from '../../components/Pane.svelte';

  type Perm = 'asking' | 'live' | 'denied' | 'nocam';

  let perm = $state<Perm>('asking');
  let video: HTMLVideoElement | undefined = $state();
  let stream: MediaStream | null = null;
  let facing = $state<'user' | 'environment'>('environment');
  let flash = $state(false);

  interface Shot {
    key: string;
    url: string;
  }
  let shots = $state<Shot[]>([]);
  let viewing = $state<Shot | null>(null);
  /* getUserMedia can resolve long after the app is closed — on a first grant
     the user may not answer the prompt for seconds. Without this the stream
     lands after teardown and nothing ever stops it: the lens stays lit. */
  let disposed = false;
  let flashTimer: ReturnType<typeof setTimeout> | undefined;

  async function start(want: 'user' | 'environment' = facing) {
    stop();
    perm = 'asking';
    try {
      const opened = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: want, width: { ideal: 1920 } },
        audio: false
      });
      if (disposed) {
        opened.getTracks().forEach((t) => t.stop());
        return;
      }
      stream = opened;
      perm = 'live';
      // wait a tick for the <video> to exist, then attach
      queueMicrotask(() => {
        if (video && stream) {
          video.srcObject = stream;
          void video.play();
        }
      });
    } catch (e) {
      if (disposed) return;
      perm = e instanceof DOMException && e.name === 'NotFoundError' ? 'nocam' : 'denied';
      play('deny');
    }
  }

  function stop() {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  }

  async function loadShots() {
    const keys = (await idb.keys('photos')) as string[];
    const loaded: Shot[] = [];
    for (const key of keys.sort().reverse()) {
      const blob = (await idb.get('photos', key)) as Blob | undefined;
      if (blob) loaded.push({ key, url: URL.createObjectURL(blob) });
    }
    shots = loaded;
  }

  // Mount once. `start` takes the facing mode as an argument so that reading
  // it can never make this effect a dependency — a re-run would open a second
  // stream and re-mint object URLs for every stored capture.
  $effect(() => {
    disposed = false;
    void start(facing);
    void loadShots();
    return () => {
      disposed = true;
      clearTimeout(flashTimer);
      stop();
      shots.forEach((s) => URL.revokeObjectURL(s.url));
    };
  });

  async function capture() {
    if (!video || perm !== 'live') return;
    play('shutter');
    flash = true;
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => (flash = false), 260);

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const cx = canvas.getContext('2d')!;
    if (facing === 'user') {
      cx.translate(canvas.width, 0);
      cx.scale(-1, 1);
    }
    cx.drawImage(video, 0, 0);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
    if (!blob || disposed) return;
    const key = String(Date.now());
    await idb.set('photos', key, blob);
    shots = [{ key, url: URL.createObjectURL(blob) }, ...shots];
  }

  function flip() {
    facing = facing === 'user' ? 'environment' : 'user';
    play('toggle');
    void start(facing);
  }

  async function removeShot(shot: Shot) {
    await idb.del('photos', shot.key);
    URL.revokeObjectURL(shot.url);
    shots = shots.filter((s) => s.key !== shot.key);
    viewing = null;
    play('toggle');
  }

  function saveShot(shot: Shot) {
    const a = document.createElement('a');
    a.href = shot.url;
    a.download = `flow-${shot.key}.jpg`;
    a.click();
    play('tap');
  }
</script>

<div class="fl-app camera">
<Pane key={viewing?.key ?? '#live'} direction={viewing ? 1 : -1}>
  {#if viewing}
    <div class="viewer">
      <img src={viewing.url} alt="capture from {new Date(Number(viewing.key)).toLocaleString()}" />
      <div class="viewer-bar">
        <button class="fl-btn quiet" onclick={() => { viewing = null; play('tap'); }}>
          <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
          back
        </button>
        <button class="fl-btn quiet" onclick={() => saveShot(viewing!)}>
          <svg viewBox="0 0 24 24"><path d="M12 4v11M7 10l5 5 5-5M4 19h16" /></svg>
          save
        </button>
        <button class="fl-btn quiet" onclick={() => removeShot(viewing!)} aria-label="delete capture">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      </div>
    </div>
  {:else}
    <div class="stage fl-glass">
      {#if perm === 'live'}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} playsinline muted class:mirror={facing === 'user'}></video>
      {:else if perm === 'asking'}
        <div class="stage-note">waking the lens…</div>
      {:else if perm === 'denied'}
        <div class="stage-note">
          <div class="big">the lens needs permission</div>
          <div>allow camera access in your browser, then try again</div>
          <button class="fl-btn" onclick={() => start(facing)}>try again</button>
        </div>
      {:else}
        <div class="stage-note">
          <div class="big">no camera here</div>
          <div>this terminal doesn't have a lens — captures from other devices will still land in your gallery</div>
        </div>
      {/if}
      {#if flash}<div class="flash"></div>{/if}
    </div>

    <div class="controls">
      <div class="tray fl-scroll">
        {#each shots as shot (shot.key)}
          <button class="thumb" onclick={() => { viewing = shot; play('tap'); }} aria-label="view capture">
            <img src={shot.url} alt="" />
          </button>
        {/each}
      </div>
      <button class="shutter" onclick={capture} disabled={perm !== 'live'} aria-label="capture">
        <span></span>
      </button>
      <button class="fl-btn fl-round quiet flipper" onclick={flip} disabled={perm !== 'live'} aria-label="flip camera">
        <svg viewBox="0 0 24 24"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2M18 3v3h-3M6 21v-3h3" /></svg>
      </button>
    </div>
  {/if}
</Pane>
</div>

<style>
  .camera {
    gap: 14px;
  }

  .stage {
    flex: 1;
    position: relative;
    overflow: hidden;
    border-radius: 26px;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(178deg, rgba(15, 40, 71, 0.06), rgba(15, 40, 71, 0.12));
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  video.mirror {
    transform: scaleX(-1);
  }
  .flash {
    position: absolute;
    inset: 0;
    background: #fff;
    animation: flashout 0.26s ease-out forwards;
  }
  @keyframes flashout {
    from { opacity: 0.9; }
    to { opacity: 0; }
  }
  .stage-note {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    text-align: center;
    color: var(--ink-soft);
    font-size: 13.5px;
    padding: 28px;
  }
  .stage-note .big {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 18px;
    color: var(--deep);
  }

  .controls {
    flex: none;
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    gap: 14px;
  }
  .tray {
    display: flex;
    gap: 8px;
    overflow-x: auto;
    overflow-y: hidden;
    padding: 4px 2px;
    touch-action: pan-x;
  }
  .thumb {
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: 14px;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 6px 14px rgba(13, 63, 143, 0.2);
    cursor: pointer;
    padding: 0;
    background: none;
    transition: transform 0.3s var(--ease-overshoot);
  }
  .thumb:active {
    transform: scale(0.9);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  /* the shutter is the most liquid thing on the screen */
  .shutter {
    width: 74px;
    height: 74px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.85);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    background:
      radial-gradient(ellipse 58% 42% at 32% 20%, rgba(255, 255, 255, 0.99) 0%, transparent 62%),
      radial-gradient(circle at 50% 55%, rgba(255, 255, 255, 0.3) 0%, rgba(127, 212, 245, 0.5) 52%, rgba(53, 169, 236, 0.65) 100%);
    box-shadow:
      inset 0 3px 10px rgba(255, 255, 255, 0.95),
      inset 0 -12px 20px rgba(30, 111, 217, 0.3),
      0 14px 28px rgba(13, 63, 143, 0.26);
    transition: transform 0.3s var(--ease-overshoot);
  }
  .shutter:active {
    transform: scale(0.85);
    transition-duration: var(--press-duration);
    transition-timing-function: var(--ease-press);
  }
  .shutter:disabled {
    opacity: 0.4;
  }
  .shutter span {
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 2.5px solid rgba(255, 255, 255, 0.95);
  }
  .flipper {
    justify-self: start;
  }

  .viewer {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-height: 0;
  }
  .viewer img {
    flex: 1;
    min-height: 0;
    object-fit: contain;
    border-radius: 26px;
    box-shadow: 0 20px 44px rgba(13, 63, 143, 0.25);
  }
  .viewer-bar {
    flex: none;
    display: flex;
    justify-content: center;
    gap: 10px;
  }
</style>

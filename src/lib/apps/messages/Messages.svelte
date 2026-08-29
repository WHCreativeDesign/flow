<script lang="ts">
  import { instance } from '../../sync';
  import { play } from '../../sound/engine';

  /*
    Honest scope: until multi-device sync lands, threads live on this
    instance — streams of messages to yourself, per topic. The composer,
    bubbles, and storage are the real thing; the second device is what
    arrives later.
  */
  interface Msg {
    id: string;
    text: string;
    at: number;
  }
  interface Thread {
    id: string;
    name: string;
    msgs: Msg[];
  }

  let threads = $state<Thread[]>([]);
  let openId = $state<string | null>(null);
  let draft = $state('');
  let newName = $state('');
  let naming = $state(false);
  let loaded = $state(false);
  let scroller: HTMLDivElement | undefined = $state();

  const openThread = $derived(threads.find((t) => t.id === openId) ?? null);

  $effect(() => {
    void instance.getAppState('messages').then((s) => {
      if (s?.threads) threads = s.threads as Thread[];
      loaded = true;
    });
  });

  function persist() {
    void instance.setAppState('messages', { threads: $state.snapshot(threads) });
  }

  function createThread() {
    const name = newName.trim();
    if (!name) return;
    const t: Thread = { id: crypto.randomUUID(), name, msgs: [] };
    threads = [t, ...threads];
    naming = false;
    newName = '';
    openId = t.id;
    play('tap');
    persist();
  }

  function send() {
    const text = draft.trim();
    if (!text || !openThread) return;
    openThread.msgs.push({ id: crypto.randomUUID(), text, at: Date.now() });
    draft = '';
    play('send');
    persist();
    queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
  }

  function removeThread(id: string) {
    threads = threads.filter((t) => t.id !== id);
    if (openId === id) openId = null;
    play('toggle');
    persist();
  }

  const when = (ts: number) =>
    new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const lastLine = (t: Thread) => t.msgs.at(-1)?.text ?? 'no messages yet';
</script>

<div class="fl-app messages">
  {#if openThread}
    <div class="fl-app-head">
      <button class="fl-btn quiet" onclick={() => { openId = null; play('tap'); }}>
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        threads
      </button>
      <div class="thread-name">{openThread.name}</div>
      <button class="fl-btn quiet" onclick={() => removeThread(openThread.id)} aria-label="delete thread">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
      </button>
    </div>

    <div class="stream fl-scroll" bind:this={scroller}>
      {#if openThread.msgs.length === 0}
        <div class="fl-empty"><div>say something — it stays in this stream</div></div>
      {/if}
      {#each openThread.msgs as m (m.id)}
        <div class="bubble-row">
          <div class="bubble">
            {m.text}
            <span class="stamp">{when(m.at)}</span>
          </div>
        </div>
      {/each}
    </div>

    <form class="composer" onsubmit={(e) => { e.preventDefault(); send(); }}>
      <input class="fl-input" placeholder="write a message…" bind:value={draft} />
      <button class="fl-btn fl-round primary" type="submit" disabled={!draft.trim()} aria-label="send">
        <svg viewBox="0 0 24 24"><path d="M4 12l16-7-5 7 5 7-16-7zM20 5l-9 7" /></svg>
      </button>
    </form>
  {:else}
    <div class="fl-app-head">
      <div>
        <div class="fl-app-title">messages</div>
        <div class="fl-app-sub">streams on this instance · device-to-device arrives with sync</div>
      </div>
      <button class="fl-btn primary" onclick={() => { naming = true; play('tap'); }}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        new
      </button>
    </div>

    {#if naming}
      <form class="namer" onsubmit={(e) => { e.preventDefault(); createThread(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="fl-input" placeholder="name the thread…" bind:value={newName} autofocus />
        <button class="fl-btn primary" type="submit" disabled={!newName.trim()}>create</button>
        <button class="fl-btn quiet" type="button" onclick={() => (naming = false)}>cancel</button>
      </form>
    {/if}

    {#if loaded && threads.length === 0 && !naming}
      <div class="fl-empty">
        <div class="big">no streams yet</div>
        <div>a thread is a stream of messages that lives on your instance</div>
      </div>
    {:else}
      <div class="list fl-scroll">
        {#each threads as t (t.id)}
          <button class="row fl-glass" onclick={() => { openId = t.id; play('tap'); }}>
            <span class="row-orb" aria-hidden="true">{t.name.slice(0, 1)}</span>
            <span class="row-text">
              <span class="row-name">{t.name}</span>
              <span class="row-last">{lastLine(t)}</span>
            </span>
            {#if t.msgs.length}<span class="row-count">{t.msgs.length}</span>{/if}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .messages {
    gap: 10px;
  }
  .thread-name {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 17px;
    color: var(--deep);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .namer {
    flex: none;
    display: flex;
    gap: 8px;
    padding: 0 4px;
  }
  .namer .fl-input {
    flex: 1;
  }

  .list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px 4px 12px;
  }
  .row {
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 13px 16px;
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: transform 0.3s var(--ease-overshoot), filter 0.25s ease;
  }
  .row:active {
    transform: scale(0.98);
  }
  .row-orb {
    flex: none;
    width: 42px;
    height: 42px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 17px;
    color: var(--deep);
    background:
      radial-gradient(ellipse 58% 42% at 32% 20%, rgba(255, 255, 255, 0.98) 0%, transparent 62%),
      radial-gradient(circle at 50% 58%, rgba(255, 255, 255, 0.3) 0%, rgba(127, 212, 245, 0.5) 52%, rgba(53, 169, 236, 0.6) 100%);
    box-shadow: inset 0 2px 5px rgba(255, 255, 255, 0.9), inset 0 -7px 12px rgba(30, 111, 217, 0.25), 0 5px 10px rgba(13, 63, 143, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.75);
    text-transform: lowercase;
  }
  .row-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .row-name {
    font-weight: 700;
    font-size: 14.5px;
    color: var(--ink);
  }
  .row-last {
    font-size: 12.5px;
    color: var(--ink-faint);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-count {
    flex: none;
    font-size: 11px;
    font-weight: 700;
    color: var(--royal);
    background: rgba(53, 169, 236, 0.14);
    border-radius: 99px;
    padding: 3px 9px;
  }

  .stream {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 6px 4px;
  }
  .bubble-row {
    display: flex;
    justify-content: flex-end;
    flex: none;
  }
  .bubble {
    max-width: 78%;
    padding: 11px 15px;
    border-radius: 20px 20px 5px 20px;
    font-size: 14.5px;
    line-height: 1.5;
    color: #fff;
    text-shadow: 0 1px 2px rgba(13, 63, 143, 0.25);
    background:
      radial-gradient(ellipse 70% 45% at 28% 15%, rgba(255, 255, 255, 0.45) 0%, transparent 60%),
      linear-gradient(168deg, var(--azure), var(--royal));
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 0.6),
      0 8px 18px rgba(13, 63, 143, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.45);
    overflow-wrap: anywhere;
    animation: bubble-in 0.42s var(--ease-overshoot);
  }
  @keyframes bubble-in {
    from { opacity: 0; transform: translateY(10px) scale(0.92); }
    to { opacity: 1; transform: none; }
  }
  .stamp {
    display: block;
    font-size: 10px;
    opacity: 0.75;
    margin-top: 4px;
    text-align: right;
  }

  .composer {
    flex: none;
    display: flex;
    gap: 8px;
    align-items: center;
    padding: 0 4px;
  }
  .composer .fl-input {
    flex: 1;
  }
</style>

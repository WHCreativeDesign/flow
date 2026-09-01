<script lang="ts">
  import { FUNCTIONS_URL, ANON_KEY, readToken } from '../../sync/supabase';
  import { encodeImage } from '../../ai/context';
  import { memoryStore } from '../../ai/memory.svelte';
  import { play } from '../../sound/engine';

  /*
    Quick info — the fast lane into memory. No chat, no history: a line of
    text and/or a photo go straight to the assistant, which turns them into
    one markdown memory node and hands back a short confirmation, not a
    conversation. Voice capture is deliberately not here yet — nothing in
    the repo does audio input, and this ships text + image first.
  */

  interface Pending {
    id: string;
    url: string;
    data: string;
    mime: string;
  }

  let draft = $state('');
  let pending: Pending[] = $state([]);
  let fileInput: HTMLInputElement | undefined = $state();
  let sending = $state(false);
  let error = $state<string | null>(null);
  let confirmations = $state<Array<{ id: string; text: string }>>([]);

  async function attachFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    for (const file of Array.from(input.files ?? []).slice(0, 3 - pending.length)) {
      if (!file.type.startsWith('image/')) continue;
      const { data, mime } = await encodeImage(file);
      pending = [...pending, { id: crypto.randomUUID(), url: URL.createObjectURL(file), data, mime }];
    }
    input.value = '';
  }

  function removePending(id: string) {
    const gone = pending.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.url);
    pending = pending.filter((p) => p.id !== id);
  }

  async function send() {
    const text = draft.trim();
    if ((!text && !pending.length) || sending) return;

    sending = true;
    error = null;
    play('send');

    const images = pending.map((p) => ({ data: p.data, mime: p.mime }));
    for (const p of pending) URL.revokeObjectURL(p.url);
    draft = '';
    pending = [];

    try {
      const res = await fetch(`${FUNCTIONS_URL}/ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON_KEY,
          'x-flow-token': readToken() ?? ''
        },
        body: JSON.stringify({
          mode: 'quickinfo',
          messages: [{ role: 'user', content: text || 'see the attached image' }],
          images,
          stream: false
        })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        error = data.detail?.join(' · ') ?? data.error ?? `HTTP ${res.status}`;
        play('deny');
        return;
      }

      confirmations = [{ id: crypto.randomUUID(), text: data.reply ?? 'saved' }, ...confirmations].slice(0, 5);
      play('noted');
      // the node landed server-side already — just bring the graph up to date
      // for whoever opens the memory app next
      void memoryStore.load();
    } catch (e) {
      error = (e as Error).message;
      play('deny');
    } finally {
      sending = false;
    }
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }
</script>

<div class="fl-app quickinfo">
  <div class="fl-app-head">
    <div>
      <div class="fl-app-title">quick info</div>
      <div class="fl-app-sub">a line or a photo — flow turns it into memory</div>
    </div>
  </div>

  <div class="fl-scroll feed">
    {#if !confirmations.length && !error}
      <div class="fl-empty">
        <div class="big">tell flow something quickly</div>
        <div>it becomes a memory node — check the memory app to see it</div>
      </div>
    {/if}
    {#each confirmations as c (c.id)}
      <div class="confirm fl-glass">{c.text}</div>
    {/each}
    {#if error}
      <div class="err fl-glass">{error}</div>
    {/if}
  </div>

  <div class="composer-wrap">
    {#if pending.length}
      <div class="thumbs measure">
        {#each pending as p (p.id)}
          <div class="thumb">
            <img src={p.url} alt="attached" />
            <button class="thumb-x" onclick={() => removePending(p.id)} aria-label="remove attachment">×</button>
          </div>
        {/each}
      </div>
    {/if}

    <input bind:this={fileInput} type="file" accept="image/*" multiple onchange={attachFiles} hidden />

    <div class="composer measure">
      <button class="clip" onclick={() => fileInput?.click()} aria-label="attach a photo">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12.5l5.5-5.5a3 3 0 014.2 4.2l-7.4 7.4a5 5 0 01-7-7l7.4-7.4" /></svg>
      </button>
      <textarea
        bind:value={draft}
        onkeydown={key}
        rows="1"
        placeholder="what should flow remember?"
        aria-label="quick info"
      ></textarea>
      <button class="send" onclick={send} disabled={sending || (!draft.trim() && !pending.length)} aria-label="save">
        {#if sending}
          <span class="dot"></span>
        {:else}
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        {/if}
      </button>
    </div>
  </div>
</div>

<style>
  .quickinfo {
    height: 100%;
  }
  .measure {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
  }

  .feed {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .confirm,
  .err {
    width: 100%;
    max-width: 560px;
    margin: 0 auto;
    padding: 13px 16px;
    border-radius: 16px;
    font-family: var(--font-body);
    font-size: 13.5px;
    color: var(--deep);
    animation: note-in 0.4s var(--ease-rise) both;
  }
  .err {
    color: #8d1f48;
  }
  @keyframes note-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .confirm, .err { animation: none; }
  }

  .composer-wrap {
    padding-top: 8px;
  }
  .thumbs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding-bottom: 8px;
  }
  .thumb {
    position: relative;
    width: 62px;
    height: 62px;
    border-radius: 12px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, 0.9);
  }
  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .thumb-x {
    position: absolute;
    top: 2px;
    right: 2px;
    width: 19px;
    height: 19px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 14px;
    line-height: 1;
    color: #fff;
    background: rgba(13, 63, 143, 0.62);
  }

  .clip {
    flex: none;
    width: 30px;
    height: 30px;
    margin-bottom: 3px;
    border: none;
    border-radius: 50%;
    background: none;
    cursor: pointer;
    display: grid;
    place-items: center;
    opacity: 0.5;
  }
  .clip:hover {
    opacity: 1;
  }
  .clip svg {
    width: 17px;
    height: 17px;
    stroke: var(--deep);
    stroke-width: 1.8;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding: 7px 7px 7px 16px;
    border-radius: 24px;
    background: var(--glass-bg);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
  }
  .composer textarea {
    flex: 1;
    min-height: 26px;
    max-height: 168px;
    resize: none;
    border: none;
    background: none;
    outline: none;
    padding: 6px 0;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.5;
    color: var(--deep);
  }
  .composer textarea::placeholder {
    color: var(--deep);
    opacity: 0.42;
  }
  .send {
    flex: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    cursor: pointer;
    display: grid;
    place-items: center;
    background: linear-gradient(168deg, hsl(205 88% 66%), hsl(212 78% 54%));
    transition: transform 0.28s var(--ease-overshoot), opacity 0.2s ease;
  }
  .send:disabled {
    opacity: 0.34;
    cursor: default;
  }
  .send:not(:disabled):active {
    transform: scale(0.92);
    transition-duration: var(--press-duration);
    transition-timing-function: var(--ease-press);
  }
  .send svg {
    width: 17px;
    height: 17px;
    stroke: #fff;
    stroke-width: 2;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #fff;
    animation: pulse 1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; transform: scale(0.8); }
    50% { opacity: 1; transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .send, .dot { animation: none; transition: none; }
  }
</style>

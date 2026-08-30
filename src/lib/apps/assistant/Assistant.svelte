<script lang="ts">
  import { assistant } from '../../ai/assistant.svelte';
  import { play } from '../../sound/engine';

  /*
    The assistant. Real now — it was a labelled placeholder before, because a
    placeholder that looked live would misrepresent what the system does.

    History is per-user and lives in Supabase, so the same conversation is
    there on every terminal that user signs in on, and invisible to everyone
    else on this one.
  */
  let draft = $state('');
  let scroller: HTMLDivElement | undefined = $state();

  $effect(() => {
    void assistant.loadChats();
  });

  // follow the conversation as it grows
  $effect(() => {
    void assistant.messages.length;
    void assistant.thinking;
    queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
  });

  async function send() {
    const text = draft.trim();
    if (!text || assistant.thinking) return;
    draft = '';
    play('send');
    await assistant.ask(text);
  }

  function key(e: KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function when(iso: string) {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<div class="fl-app">
  {#if assistant.openId === null}
    <!-- history -->
    <div class="fl-app-head">
      <div>
        <h2 class="fl-app-title">assistant</h2>
        <p class="fl-app-sub">{assistant.chats.length} conversation{assistant.chats.length === 1 ? '' : 's'}</p>
      </div>
      <button class="fl-btn primary" onclick={() => { play('tap'); void assistant.newChat(); }}>
        new chat
      </button>
    </div>

    <div class="fl-scroll list" bind:this={scroller}>
      {#if assistant.chats.length === 0}
        <div class="fl-empty">
          <span class="big">nothing asked yet</span>
          <span>start a chat and it will be here on every screen you sign in on</span>
        </div>
      {:else}
        {#each assistant.chats as c (c.id)}
          <div class="row fl-glass">
            <button class="open" onclick={() => { play('tap'); void assistant.openChat(c.id); }}>
              <span class="t">{c.title}</span>
              <span class="w">{when(c.updatedAt)}</span>
            </button>
            <button
              class="fl-round del"
              aria-label="delete chat"
              onclick={() => { play('toggle'); void assistant.deleteChat(c.id); }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 7h12M10 7V5h4v2M8 7l1 12h6l1-12" /></svg>
            </button>
          </div>
        {/each}
      {/if}
    </div>
  {:else}
    <!-- one conversation -->
    <div class="fl-app-head">
      <button class="fl-btn quiet" onclick={() => { play('tap'); assistant.closeChat(); }}>all chats</button>
      <button class="fl-btn quiet" onclick={() => { play('tap'); void assistant.newChat(); }}>new</button>
    </div>

    <div class="fl-scroll thread" bind:this={scroller}>
      {#each assistant.messages as m (m.id)}
        <div class="bubble" class:mine={m.role === 'user'}>
          <span class="text">{m.content}</span>
          {#if m.model && m.role === 'assistant'}
            <span class="model">{m.model}</span>
          {/if}
        </div>
      {/each}

      {#if assistant.thinking}
        <div class="bubble thinking"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
      {/if}

      {#if assistant.error}
        <!-- the real provider error, not a shrug. A generic "unavailable"
             tells you nothing about which of key, model or quota is wrong. -->
        <div class="err fl-glass">
          <strong>the assistant could not answer</strong>
          <span>{assistant.error}</span>
        </div>
      {/if}
    </div>

    <div class="composer">
      <textarea
        bind:value={draft}
        onkeydown={key}
        class="fl-textarea"
        rows="1"
        placeholder="ask something"
        aria-label="message"
      ></textarea>
      <button class="fl-round send" onclick={send} disabled={!draft.trim() || assistant.thinking} aria-label="send">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12l16-8-6 8 6 8-16-8z" /></svg>
      </button>
    </div>
  {/if}
</div>

<style>
  .list {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px 4px 4px;
    border-radius: 16px;
  }
  .open {
    flex: 1;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 10px;
    background: none;
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: var(--font-body);
    color: var(--deep);
  }
  .t {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .w {
    font-size: 11px;
    opacity: 0.55;
    flex-shrink: 0;
  }
  .del svg {
    width: 15px;
    height: 15px;
    stroke: var(--deep);
    stroke-width: 1.7;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .thread {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-bottom: 8px;
  }
  .bubble {
    max-width: 82%;
    align-self: flex-start;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 11px 14px;
    border-radius: 18px 18px 18px 6px;
    background: var(--glass-bg);
    border: var(--glass-border);
    font-family: var(--font-body);
    font-size: 14px;
    line-height: 1.45;
    color: var(--deep);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .bubble.mine {
    align-self: flex-end;
    border-radius: 18px 18px 6px 18px;
    background: linear-gradient(168deg, hsl(205 88% 66%), hsl(212 78% 54%));
    border: none;
    color: #fff;
  }
  .model {
    font-size: 10px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    opacity: 0.45;
  }

  .thinking {
    flex-direction: row;
    gap: 5px;
    padding: 14px 16px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--deep);
    opacity: 0.4;
    animation: pulse 1.25s ease-in-out infinite;
  }
  .dot:nth-child(2) { animation-delay: 0.16s; }
  .dot:nth-child(3) { animation-delay: 0.32s; }
  @keyframes pulse {
    0%, 100% { transform: translateY(0); opacity: 0.32; }
    45% { transform: translateY(-4px); opacity: 0.75; }
  }
  @media (prefers-reduced-motion: reduce) {
    .dot { animation: none; }
  }

  .err {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 14px;
    font-family: var(--font-body);
    font-size: 12px;
    color: #8d1f48;
    overflow-wrap: anywhere;
  }
  .err strong {
    font-size: 13px;
  }

  .composer {
    display: flex;
    align-items: flex-end;
    gap: 8px;
    padding-top: 10px;
  }
  .composer .fl-textarea {
    flex: 1;
    min-height: 44px;
    max-height: 140px;
    resize: none;
  }
  .send svg {
    width: 17px;
    height: 17px;
    stroke: var(--deep);
    stroke-width: 1.8;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
</style>

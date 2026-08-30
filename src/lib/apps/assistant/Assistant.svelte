<script lang="ts">
  import { assistant } from '../../ai/assistant.svelte';
  import Reveal from '../../ai/Reveal.svelte';
  import Orb from '../../ai/Orb.svelte';
  import { play } from '../../sound/engine';

  /*
    The assistant.

    Laid out the way ChatGPT and Claude lay a conversation out, because that
    shape has a reason behind it: a reply is a document, not a chat bubble.
    Bubbles were built for short turns between equals; they cap the line
    length, centre the eye on the wrong axis, and make three paragraphs of
    prose look like shouting. So the question sits in a small container on
    the right and the answer runs full width as plain text on the surface,
    with one orb marking who is speaking and a measure capped for reading.

    History is per-user and lives in Supabase, so the same conversation is
    there on every terminal that user signs in on.
  */
  let draft = $state('');
  let scroller: HTMLDivElement | undefined = $state();
  let composer: HTMLTextAreaElement | undefined = $state();
  let showMemories = $state(false);
  let pinned = true;

  $effect(() => {
    void assistant.loadChats();
    void assistant.loadMemories();
  });

  /* Follow the conversation only while the reader is already at the bottom.
     Yanking someone back down while they are reading earlier text is the
     single rudest thing a chat view can do. */
  function atBottom() {
    if (!scroller) return true;
    return scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 90;
  }
  function follow(smooth = true) {
    if (!pinned || !scroller) return;
    scroller.scrollTo({ top: scroller.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  }

  $effect(() => {
    void assistant.messages.length;
    void assistant.thinking;
    pinned = true;
    queueMicrotask(() => follow());
  });

  function grow() {
    if (!composer) return;
    composer.style.height = 'auto';
    composer.style.height = `${Math.min(composer.scrollHeight, 168)}px`;
  }

  async function send() {
    const text = draft.trim();
    if (!text || assistant.thinking) return;
    draft = '';
    queueMicrotask(grow);
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

<div class="fl-app chat">
  {#if assistant.openId === null}
    <!-- history -->
    <div class="fl-app-head">
      <div>
        <h2 class="fl-app-title">assistant</h2>
        <p class="fl-app-sub">
          {assistant.chats.length} conversation{assistant.chats.length === 1 ? '' : 's'}
          {#if assistant.memories.length}· {assistant.memories.length} remembered{/if}
        </p>
      </div>
      <div class="head-actions">
        {#if assistant.memories.length}
          <button class="fl-btn quiet" onclick={() => { showMemories = !showMemories; play('tap'); }}>
            memory
          </button>
        {/if}
        <button class="fl-btn primary" onclick={() => { play('tap'); void assistant.newChat(); }}>
          new chat
        </button>
      </div>
    </div>

    {#if showMemories}
      <div class="memories fl-glass">
        <div class="mem-head">
          <span>what the assistant remembers about you</span>
          <button class="fl-btn quiet sm" onclick={() => { play('deny'); void assistant.forgetAll(); }}>
            forget all
          </button>
        </div>
        {#each assistant.memories as m (m.id)}
          <div class="mem">
            <span>{m.content}</span>
            <button class="x" aria-label="forget this" onclick={() => { play('toggle'); void assistant.forget(m.id); }}>×</button>
          </div>
        {/each}
      </div>
    {/if}

    <div class="fl-scroll list">
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
    <div class="fl-app-head slim">
      <button class="fl-btn quiet" onclick={() => { play('tap'); assistant.closeChat(); }}>all chats</button>
      <button class="fl-btn quiet" onclick={() => { play('tap'); void assistant.newChat(); }}>new</button>
    </div>

    <div class="fl-scroll thread" bind:this={scroller} onscroll={() => (pinned = atBottom())}>
      <div class="measure">
        {#each assistant.messages as m (m.id)}
          {#if m.role === 'user'}
            <div class="turn user">
              <div class="said">{m.content}</div>
            </div>
          {:else}
            <div class="turn bot">
              <div class="mark"><Orb size={26} active={false} /></div>
              <div class="answer">
                <Reveal
                  text={m.content}
                  instant={!m.fresh}
                  onprogress={() => follow(false)}
                />
              </div>
            </div>
          {/if}
        {/each}

        {#if assistant.thinking}
          <div class="turn bot">
            <div class="mark"><Orb size={26} /></div>
            <div class="answer waiting">thinking</div>
          </div>
        {/if}

        {#if assistant.justRemembered.length}
          <!-- being remembered without being told is the part of assistant
               memory people object to, so it is said out loud -->
          <div class="turn bot">
            <div class="mark"></div>
            <div class="noted">
              {#each assistant.justRemembered as fact}
                <span class="fact">remembered · {fact}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if assistant.error}
          <div class="turn bot">
            <div class="mark"></div>
            <div class="err">
              <strong>the assistant could not answer</strong>
              <span>{assistant.error}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="composer-wrap">
      <div class="composer measure">
        <textarea
          bind:this={composer}
          bind:value={draft}
          oninput={grow}
          onkeydown={key}
          rows="1"
          placeholder="ask something"
          aria-label="message"
        ></textarea>
        <button class="send" onclick={send} disabled={!draft.trim() || assistant.thinking} aria-label="send">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
        </button>
      </div>
    </div>
  {/if}
</div>

<style>
  .chat {
    height: 100%;
  }
  .fl-app-head.slim {
    padding-bottom: 6px;
  }
  .head-actions {
    display: flex;
    gap: 8px;
  }

  /* one reading measure for the whole conversation, question and answer alike */
  .measure {
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
  }

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

  .memories {
    border-radius: 16px;
    padding: 14px 16px;
    margin-bottom: 10px;
    font-family: var(--font-body);
    color: var(--deep);
  }
  .mem-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.6;
    margin-bottom: 8px;
  }
  .mem {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 5px 0;
    font-size: 13px;
    line-height: 1.4;
  }
  .mem span {
    flex: 1;
  }
  .x {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 17px;
    line-height: 1;
    color: var(--deep);
    opacity: 0.45;
  }
  .x:hover {
    opacity: 1;
  }
  .sm {
    padding: 4px 10px;
    font-size: 10px;
  }

  /* ---- the conversation ---- */
  .thread {
    flex: 1;
    padding: 4px 0 10px;
  }
  .turn {
    display: flex;
    gap: 12px;
    padding: 12px 2px;
  }
  /* the question: small, contained, right — it is an aside, not the document */
  .turn.user {
    justify-content: flex-end;
  }
  .said {
    max-width: 78%;
    padding: 10px 15px;
    border-radius: 18px 18px 6px 18px;
    background: linear-gradient(168deg, hsl(205 88% 66%), hsl(212 78% 54%));
    color: #fff;
    font-family: var(--font-body);
    font-size: 14.5px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    box-shadow: 0 6px 16px hsl(212 70% 45% / 0.22);
  }

  /* the answer: no container at all. It is the page. */
  .turn.bot {
    align-items: flex-start;
  }
  .mark {
    width: 26px;
    flex: none;
    padding-top: 1px;
  }
  .answer {
    flex: 1;
    font-family: var(--font-body);
    font-size: 15px;
    line-height: 1.62;
    color: var(--deep);
    padding-top: 1px;
  }
  .answer.waiting {
    opacity: 0.5;
    font-style: italic;
  }

  .noted {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .fact {
    font-family: var(--font-body);
    font-size: 11.5px;
    letter-spacing: 0.02em;
    color: var(--royal, var(--deep));
    opacity: 0.62;
  }

  .err {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 12px 14px;
    border-radius: 14px;
    background: var(--glass-bg);
    border: var(--glass-border);
    font-family: var(--font-body);
    font-size: 12px;
    color: #8d1f48;
    overflow-wrap: anywhere;
  }
  .err strong {
    font-size: 13px;
  }

  /* ---- composer ---- */
  .composer-wrap {
    padding-top: 8px;
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
  .send:not(:disabled):hover {
    transform: translateY(-2px);
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

  @media (prefers-reduced-motion: reduce) {
    .send {
      transition: none;
    }
  }
</style>

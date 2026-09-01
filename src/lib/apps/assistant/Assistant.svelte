<script lang="ts">
  import { assistant } from '../../ai/assistant.svelte';
  import Reveal from '../../ai/Reveal.svelte';
  import Orb from '../../ai/Orb.svelte';
  import { play } from '../../sound/engine';
  import Pane from '../../components/Pane.svelte';
  import { encodeImage } from '../../ai/context';

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
  let pinned = true;
  let picking = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();

  /* The object URL is for the preview and the base64 is what the provider
     gets, built from the same bytes so the thumbnail cannot misrepresent
     what was actually sent. */
  async function attachBlob(id: string, blob: Blob, name: string) {
    const { data, mime } = await encodeImage(blob);
    assistant.attach({ id, url: URL.createObjectURL(blob), data, mime, name });
    play('toggle');
  }

  async function attachFromComputer(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    for (const file of Array.from(input.files ?? []).slice(0, 3)) {
      if (!file.type.startsWith('image/')) continue;
      await attachBlob(`file:${file.name}:${file.lastModified}`, file, file.name);
    }
    // reset so picking the same file twice still fires a change event
    input.value = '';
    picking = false;
  }

  $effect(() => {
    void assistant.loadChats();
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
    // no cue here: ask() plays 'thinking' as the request leaves, and two cues
    // on one action reads as a stutter
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
<Pane key={assistant.openId ?? '#list'} direction={assistant.openId ? 1 : -1}>
  {#if assistant.openId === null}
    <!-- history -->
    <div class="fl-app-head">
      <div>
        <h2 class="fl-app-title">flow</h2>
        <p class="fl-app-sub">
          {assistant.chats.length} conversation{assistant.chats.length === 1 ? '' : 's'}
        </p>
      </div>
      <div class="head-actions">
        <button class="fl-btn primary" onclick={() => { play('tap'); void assistant.newChat(); }}>
          new chat
        </button>
      </div>
    </div>

    <div class="fl-scroll list">
      {#if assistant.chats.length === 0}
        <div class="fl-empty">
          <span class="big">ask flow anything</span>
          <span>chats are yours alone and follow you to every screen you sign in on</span>
        </div>
      {:else}
        {#each assistant.chats as c (c.id)}
          <div class="row fl-glass">
            <button class="open" onclick={() => { play('tap'); void assistant.openChat(c.id); }}>
              <span class="t">{c.title}</span>
              <span class="w">{when(c.updatedAt)}</span>
            </button>
            <button
              class="fl-btn quiet fl-round del"
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
                  complete={m.complete !== false}
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

        {#if assistant.justDid.length}
          <!-- same reasoning as memory: a setting changed or a note deleted
               without being told is worse than the extra line -->
          <div class="turn bot">
            <div class="mark"></div>
            <div class="noted">
              {#each assistant.justDid as did}
                <span class="fact">done · {did}</span>
              {/each}
            </div>
          </div>
        {/if}

        {#if assistant.error}
          <div class="turn bot">
            <div class="mark"></div>
            <div class="err">
              <strong>flow could not answer</strong>
              <span>{assistant.error}</span>
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="composer-wrap">
      {#if picking}
        <div class="picker measure">
          <button class="pk from-file" onclick={() => { fileInput?.click(); play('tap'); }}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 001 1h14a1 1 0 001-1v-2" /></svg>
            <span>add from computer</span>
          </button>
        </div>
      {/if}

      <input
        bind:this={fileInput}
        type="file"
        accept="image/*"
        multiple
        onchange={attachFromComputer}
        hidden
      />

      {#if assistant.attached.length}
        <!-- the preview is built from the same bytes that get sent, so it
             cannot show one thing and upload another -->
        <div class="thumbs measure">
          {#each assistant.attached as a (a.id)}
            <div class="thumb">
              <img src={a.url} alt={a.name} />
              <button class="thumb-x" onclick={() => { assistant.detach(a.id); play('toggle'); }} aria-label={`remove ${a.name}`}>×</button>
            </div>
          {/each}
        </div>
      {/if}

      <div class="composer measure">
        <button
          class="clip"
          class:on={picking}
          onclick={() => { picking = !picking; play('tap'); }}
          aria-label="attach a photo"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 12.5l5.5-5.5a3 3 0 014.2 4.2l-7.4 7.4a5 5 0 01-7-7l7.4-7.4" /></svg>
        </button>
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
</Pane>
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
  /* the same reading measure the thread uses — a row stretched across a wall
     display puts the delete control a foot from the title it belongs to */
  .list > * {
    width: 100%;
    max-width: 680px;
    margin: 0 auto;
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
  /* fl-round is 46px, which is a primary-action size. A destructive action
     tucked at the end of a list row should be smaller than the row's own
     content, not larger. */
  .del {
    width: 34px;
    height: 34px;
    flex: none;
  }
  .del svg {
    width: 15px;
    height: 15px;
  }
  .del:hover {
    color: #b4225a;
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
    /* a plain blur fade-in rather than a directional slide: the message
       just resolves into focus where it already sits, no travel implied */
    animation: turn-in 0.42s var(--ease-rise) both;
  }
  @keyframes turn-in {
    from { opacity: 0; filter: blur(6px); }
    to { opacity: 1; filter: blur(0); }
  }
  @media (prefers-reduced-motion: reduce) {
    .turn { animation: none; }
  }
  /* Tier 1: animating `filter` forces a repaint pass every frame, unlike
     opacity — and a chat history opens with every past turn mounting at
     once, so this is the one place in the app where several of these can
     fire at the same instant on a weak GPU. Same fade, no filter. */
  :global(html[data-gfx='1']) .turn {
    animation: turn-in-cheap 0.3s ease both;
  }
  @keyframes turn-in-cheap {
    from { opacity: 0; }
    to { opacity: 1; }
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
  .picker {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    padding-bottom: 8px;
  }
  .pk {
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 600;
    padding: 6px 11px;
    border-radius: 999px;
    cursor: pointer;
    color: var(--deep);
    border: 1px solid rgba(255, 255, 255, 0.8);
    background: linear-gradient(168deg, rgba(255, 255, 255, 0.66), rgba(226, 245, 253, 0.45));
  }
  .pk.from-file {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .pk.from-file svg {
    width: 13px;
    height: 13px;
    stroke: var(--deep);
    stroke-width: 1.9;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
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
    animation: thumb-in 0.34s var(--ease-overshoot) both;
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
  @keyframes thumb-in {
    from { opacity: 0; transform: scale(0.82); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .thumb { animation: none; }
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
  .clip.on,
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

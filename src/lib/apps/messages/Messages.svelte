<script lang="ts">
  import { supabase } from '../../sync/supabase';
  import { auth } from '../../auth.svelte';
  import { play } from '../../sound/engine';
  import Pane from '../../components/Pane.svelte';

  /*
    Real messaging between the people on this instance — the thing the old
    version was honest about not being yet ("streams of messages to
    yourself... until multi-device sync lands"). Per-user sync landed since
    that was written, but it only followed one person across their own
    devices; it never let User 1 reach User 2.

    That needed a different shape underneath, not just a bigger private
    blob: threads and messages are real rows in a table anyone signed in on
    this instance can read, not a JSONB document keyed to one user_id. It is
    the one place in this app where the trust model is a shared board rather
    than a locked notebook — see the flow_shared_messaging migration.
  */
  interface ThreadRow {
    id: string;
    name: string;
    created_by: string;
    created_at: string;
  }
  interface MsgRow {
    id: string;
    thread_id: string;
    sender_id: string;
    sender_name: string;
    text: string;
    at: string;
  }

  let threads = $state<ThreadRow[]>([]);
  /* last line + a bounded recent count per thread, for the list preview only
     — built from a capped recent fetch, never claims to be the true total */
  let previews = $state<Record<string, { text: string; at: string }>>({});
  let openId = $state<string | null>(null);
  let openMsgs = $state<MsgRow[]>([]);
  let draft = $state('');
  let newName = $state('');
  let naming = $state(false);
  let loaded = $state(false);
  let scroller: HTMLDivElement | undefined = $state();

  const openThread = $derived(threads.find((t) => t.id === openId) ?? null);
  const myId = $derived(auth.user?.id ?? null);

  async function loadThreads() {
    const { data: t } = await supabase()
      .from('message_threads')
      .select('id, name, created_by, created_at')
      .order('created_at', { ascending: false });
    threads = t ?? [];

    // a bounded recent slice across the whole board, reduced to one preview
    // line per thread — this is deliberately not a true per-thread count
    const { data: recent } = await supabase()
      .from('thread_messages')
      .select('thread_id, text, at')
      .order('at', { ascending: false })
      .limit(300);
    const next: Record<string, { text: string; at: string }> = {};
    for (const m of recent ?? []) if (!next[m.thread_id]) next[m.thread_id] = { text: m.text, at: m.at };
    previews = next;
    loaded = true;
  }

  async function loadMessages(threadId: string) {
    const { data } = await supabase()
      .from('thread_messages')
      .select('id, thread_id, sender_id, sender_name, text, at')
      .eq('thread_id', threadId)
      .order('at', { ascending: true });
    openMsgs = data ?? [];
    queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight }));
  }

  $effect(() => {
    void loadThreads();
  });

  $effect(() => {
    if (openId) void loadMessages(openId);
    else openMsgs = [];
  });

  /*
    Live updates: another user's message — from another session on this
    instance, not another tab of this same one — should appear without
    reopening the thread. One channel for the whole shared board, since
    unlike every other realtime subscription in this app there is no single
    user_id to filter on here.
  */
  $effect(() => {
    const channel = supabase()
      .channel('messages-board')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'message_threads' }, () => {
        void loadThreads();
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'thread_messages' }, (payload) => {
        const row = payload.new as MsgRow;
        if (row.thread_id === openId) {
          openMsgs = [...openMsgs, row];
          queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
        }
        previews = { ...previews, [row.thread_id]: { text: row.text, at: row.at } };
      })
      .subscribe();
    return () => void supabase().removeChannel(channel);
  });

  async function createThread() {
    const name = newName.trim();
    if (!name || !auth.user) return;
    const { data, error } = await supabase()
      .from('message_threads')
      .insert({ name, created_by: auth.user.id })
      .select('id, name, created_by, created_at')
      .single();
    naming = false;
    newName = '';
    if (error || !data) return;
    threads = [data, ...threads];
    openId = data.id;
    play('tap');
  }

  async function send() {
    const text = draft.trim();
    if (!text || !openThread || !auth.user) return;
    draft = '';
    play('send');
    const { data } = await supabase()
      .from('thread_messages')
      .insert({ thread_id: openThread.id, sender_id: auth.user.id, sender_name: auth.user.displayName, text })
      .select('id, thread_id, sender_id, sender_name, text, at')
      .single();
    if (data) {
      openMsgs = [...openMsgs, data];
      previews = { ...previews, [openThread.id]: { text: data.text, at: data.at } };
    }
    queueMicrotask(() => scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' }));
  }

  /* You can only actually remove your own thread — RLS enforces this too,
     so a stray attempt on someone else's is a silent no-op, not an error. */
  async function removeThread(t: ThreadRow) {
    play('toggle');
    await supabase().from('message_threads').delete().eq('id', t.id);
    threads = threads.filter((x) => x.id !== t.id);
    if (openId === t.id) openId = null;
  }

  const when = (iso: string) =>
    new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  const lastLine = (id: string) => previews[id]?.text ?? 'no messages yet';
</script>

<div class="fl-app messages">
<Pane key={openId ?? '#list'} direction={openId ? 1 : -1}>
  {#if openThread}
    <div class="fl-app-head">
      <button class="fl-btn quiet" onclick={() => { openId = null; play('tap'); }}>
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        threads
      </button>
      <div class="thread-name">{openThread.name}</div>
      {#if openThread.created_by === myId}
        <button class="fl-btn quiet" onclick={() => removeThread(openThread)} aria-label="delete thread">
          <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
        </button>
      {/if}
    </div>

    <div class="stream fl-scroll" bind:this={scroller}>
      {#if openMsgs.length === 0}
        <div class="fl-empty"><div>say something — everyone on this instance sees it</div></div>
      {/if}
      {#each openMsgs as m (m.id)}
        <div class="bubble-row" class:mine={m.sender_id === myId}>
          <div class="bubble">
            {#if m.sender_id !== myId}<span class="sender">{m.sender_name}</span>{/if}
            {m.text}
            <span class="stamp">{when(m.at)}</span>
          </div>
        </div>
      {/each}
    </div>

    <form class="composer" onsubmit={(e) => { e.preventDefault(); void send(); }}>
      <input class="fl-input" placeholder="write a message…" bind:value={draft} />
      <button class="fl-btn fl-round primary" type="submit" disabled={!draft.trim()} aria-label="send">
        <svg viewBox="0 0 24 24"><path d="M4 12l16-7-5 7 5 7-16-7zM20 5l-9 7" /></svg>
      </button>
    </form>
  {:else}
    <div class="fl-app-head">
      <div>
        <div class="fl-app-title">messages</div>
        <div class="fl-app-sub">shared with everyone on this instance</div>
      </div>
      <button class="fl-btn primary" onclick={() => { naming = true; play('tap'); }}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        new
      </button>
    </div>

    {#if naming}
      <form class="namer" onsubmit={(e) => { e.preventDefault(); void createThread(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="fl-input" placeholder="name the thread…" bind:value={newName} autofocus />
        <button class="fl-btn primary" type="submit" disabled={!newName.trim()}>create</button>
        <button class="fl-btn quiet" type="button" onclick={() => (naming = false)}>cancel</button>
      </form>
    {/if}

    {#if loaded && threads.length === 0 && !naming}
      <div class="fl-empty">
        <div class="big">no threads yet</div>
        <div>a thread is shared — anyone signed in on this instance can read and reply</div>
      </div>
    {:else}
      <div class="list fl-scroll">
        {#each threads as t (t.id)}
          <button class="row fl-glass" onclick={() => { openId = t.id; play('tap'); }}>
            <span class="row-orb" aria-hidden="true">{t.name.slice(0, 1)}</span>
            <span class="row-text">
              <span class="row-name">{t.name}</span>
              <span class="row-last">{lastLine(t.id)}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</Pane>
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
    justify-content: flex-start;
    flex: none;
  }
  .bubble-row.mine {
    justify-content: flex-end;
  }
  .bubble {
    max-width: 78%;
    padding: 11px 15px;
    border-radius: 20px 20px 20px 5px;
    font-size: 14.5px;
    line-height: 1.5;
    color: var(--deep);
    background: var(--glass-bg);
    border: var(--glass-border);
    overflow-wrap: anywhere;
    animation: bubble-in 0.42s var(--ease-overshoot);
  }
  .mine .bubble {
    border-radius: 20px 20px 5px 20px;
    color: #fff;
    text-shadow: 0 1px 2px rgba(13, 63, 143, 0.25);
    background:
      radial-gradient(ellipse 70% 45% at 28% 15%, rgba(255, 255, 255, 0.45) 0%, transparent 60%),
      linear-gradient(168deg, var(--azure), var(--royal));
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 0.6),
      0 8px 18px rgba(13, 63, 143, 0.22);
    border: 1px solid rgba(255, 255, 255, 0.45);
  }
  /* a message from someone else names them; your own never does — you know
     which ones are yours */
  .sender {
    display: block;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    opacity: 0.55;
    margin-bottom: 3px;
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

  @media (prefers-reduced-motion: reduce) {
    .bubble {
      animation: none;
    }
  }
</style>

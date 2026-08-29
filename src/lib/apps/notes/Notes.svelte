<script lang="ts">
  import { instance } from '../../sync';
  import { play } from '../../sound/engine';

  interface Note {
    id: string;
    text: string;
    updated: number;
  }

  let notes = $state<Note[]>([]);
  let openId = $state<string | null>(null);
  let loaded = $state(false);

  const openNote = $derived(notes.find((n) => n.id === openId) ?? null);

  $effect(() => {
    void instance.getAppState('notes').then((s) => {
      if (s?.notes) notes = s.notes as Note[];
      loaded = true;
    });
  });

  let saveTimer: ReturnType<typeof setTimeout>;
  function persist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void instance.setAppState('notes', { notes: $state.snapshot(notes) }), 250);
  }

  function create() {
    const note: Note = { id: crypto.randomUUID(), text: '', updated: Date.now() };
    notes = [note, ...notes];
    openId = note.id;
    play('tap');
    persist();
  }

  function edit(text: string) {
    if (!openNote) return;
    openNote.text = text;
    openNote.updated = Date.now();
    persist();
  }

  function remove(id: string) {
    notes = notes.filter((n) => n.id !== id);
    if (openId === id) openId = null;
    play('toggle');
    persist();
  }

  function titleOf(n: Note) {
    const first = n.text.trim().split('\n')[0];
    return first || 'untitled';
  }

  function when(ts: number) {
    const d = new Date(ts);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }).toLowerCase()
      : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
</script>

<div class="fl-app">
  {#if openNote}
    <div class="fl-app-head">
      <button class="fl-btn quiet" onclick={() => { openId = null; play('tap'); }} aria-label="back to all notes">
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        all notes
      </button>
      <button class="fl-btn quiet" onclick={() => remove(openNote.id)} aria-label="delete note">
        <svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
      </button>
    </div>
    <div class="editor fl-glass">
      <!-- svelte-ignore a11y_autofocus -->
      <textarea
        class="fl-textarea"
        placeholder="start writing…"
        value={openNote.text}
        oninput={(e) => edit(e.currentTarget.value)}
        autofocus
      ></textarea>
    </div>
  {:else}
    <div class="fl-app-head">
      <div>
        <div class="fl-app-title">notes</div>
        {#if notes.length}<div class="fl-app-sub">{notes.length} {notes.length === 1 ? 'note' : 'notes'}</div>{/if}
      </div>
      <button class="fl-btn primary" onclick={create}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        new
      </button>
    </div>

    {#if !loaded}
      <div class="fl-empty">…</div>
    {:else if notes.length === 0}
      <div class="fl-empty">
        <div class="big">nothing here yet</div>
        <div>everything you write stays on your instance</div>
      </div>
    {:else}
      <div class="list fl-scroll">
        {#each notes as note (note.id)}
          <button class="row fl-glass" onclick={() => { openId = note.id; play('tap'); }}>
            <span class="row-title">{titleOf(note)}</span>
            <span class="row-when">{when(note.updated)}</span>
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<style>
  .editor {
    flex: 1;
    display: flex;
    padding: 8px;
    min-height: 0;
  }
  .editor .fl-textarea {
    flex: 1;
    border: none;
    box-shadow: none;
    background: transparent;
    font-size: 16px;
  }
  .editor .fl-textarea:focus {
    box-shadow: none;
  }

  .list {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 2px 4px 12px;
  }
  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
    padding: 16px 20px;
    cursor: pointer;
    font: inherit;
    text-align: left;
    transition: transform 0.3s var(--ease-overshoot), filter 0.25s ease;
    flex: none;
  }
  .row:hover {
    filter: brightness(1.03);
  }
  .row:active {
    transform: scale(0.98);
  }
  .row-title {
    font-weight: 600;
    font-size: 15px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .row-when {
    flex: none;
    font-size: 11.5px;
    color: var(--ink-faint);
    font-variant-numeric: tabular-nums;
  }
</style>

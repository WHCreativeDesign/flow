<script lang="ts">
  import { assignmentStore, type Assignment, type AssignmentPatch } from '../../ai/assignments.svelte';
  import { play } from '../../sound/engine';
  import { haptic } from '../../haptics';

  /*
    School assignment tracker. A flat checklist rather than a graph: open
    items sorted by due date (undated ones last), done items grayed out and
    pushed below them, and a done item drops off the list entirely a day
    after it was checked off — `visible` re-filters against `tick` rather
    than a server-side job, so it just re-evaluates on its own each minute
    the app is open, and again from scratch on the next load.

    The assistant reads and writes the same table (see ai/actions.ts and the
    `ai` edge function's ACTION_RULES) — asking it to add, finish, or check
    on an assignment changes exactly what tapping the checklist here would.
  */

  $effect(() => {
    void assignmentStore.load();
  });

  let tick = $state(Date.now());
  $effect(() => {
    const t = setInterval(() => (tick = Date.now()), 60_000);
    return () => clearInterval(t);
  });

  const DAY_MS = 24 * 60 * 60 * 1000;

  const visible = $derived(
    assignmentStore.items.filter((a) => {
      if (a.status !== 'done') return true;
      if (!a.completedAt) return true;
      return tick - new Date(a.completedAt).getTime() < DAY_MS;
    })
  );

  const openItems = $derived(
    [...visible.filter((a) => a.status === 'open')].sort((a, b) => {
      if (!a.dueAt && !b.dueAt) return a.title.localeCompare(b.title);
      if (!a.dueAt) return 1;
      if (!b.dueAt) return -1;
      return new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
    })
  );
  const doneItems = $derived(
    [...visible.filter((a) => a.status === 'done')].sort(
      (a, b) => new Date(b.completedAt ?? 0).getTime() - new Date(a.completedAt ?? 0).getTime()
    )
  );

  function startOfDay(d: Date): number {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  function dueLabel(dueAt: string | null): string {
    if (!dueAt) return 'no due date';
    const diffDays = Math.round((startOfDay(new Date(dueAt)) - startOfDay(new Date())) / DAY_MS);
    if (diffDays < 0) return `overdue by ${Math.abs(diffDays)}d`;
    if (diffDays === 0) return 'due today';
    if (diffDays === 1) return 'due tomorrow';
    if (diffDays <= 7) return `due in ${diffDays}d`;
    return `due ${new Date(dueAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  }

  function isOverdue(a: Assignment): boolean {
    return a.status === 'open' && !!a.dueAt && startOfDay(new Date(a.dueAt)) < startOfDay(new Date());
  }

  async function toggleDone(a: Assignment, e: Event) {
    e.stopPropagation();
    await assignmentStore.setDone(a.id, a.status !== 'done');
    play(a.status === 'done' ? 'toggle' : 'noted');
    haptic('light');
  }

  let selected = $state<string | null>(null);
  const selectedItem = $derived(assignmentStore.items.find((a) => a.id === selected) ?? null);

  let titleDraft = $state('');
  let subjectDraft = $state('');
  let descDraft = $state('');
  let dueDraft = $state('');
  let gradeDraft = $state('');
  let impactDraft = $state('');

  $effect(() => {
    titleDraft = selectedItem?.title ?? '';
    subjectDraft = selectedItem?.subject ?? '';
    descDraft = selectedItem?.description ?? '';
    dueDraft = selectedItem?.dueAt ? selectedItem.dueAt.slice(0, 10) : '';
    gradeDraft = selectedItem?.grade ?? '';
    impactDraft = selectedItem?.gradeImpact ?? '';
  });

  function openItem(id: string) {
    selected = id;
    play('tap');
  }

  let saveTimer: ReturnType<typeof setTimeout>;
  function persist() {
    clearTimeout(saveTimer);
    const id = selected;
    if (!id) return;
    saveTimer = setTimeout(() => {
      const patch: AssignmentPatch = {
        title: titleDraft,
        subject: subjectDraft,
        description: descDraft,
        dueAt: dueDraft ? new Date(`${dueDraft}T00:00:00`).toISOString() : null,
        grade: gradeDraft,
        gradeImpact: impactDraft
      };
      void assignmentStore.update(id, patch);
    }, 300);
  }

  function closePanel() {
    clearTimeout(saveTimer);
    if (selected) {
      void assignmentStore.update(selected, {
        title: titleDraft,
        subject: subjectDraft,
        description: descDraft,
        dueAt: dueDraft ? new Date(`${dueDraft}T00:00:00`).toISOString() : null,
        grade: gradeDraft,
        gradeImpact: impactDraft
      });
    }
    selected = null;
  }

  async function removeSelected() {
    if (!selected) return;
    await assignmentStore.remove(selected);
    selected = null;
    play('toggle');
  }

  async function addAssignment() {
    const a = await assignmentStore.create({ title: 'untitled assignment' });
    if (a) openItem(a.id);
    play('tap');
  }
</script>

<div class="fl-app assignments">
  <div class="fl-app-head">
    <div>
      <div class="fl-app-title">assignments</div>
      {#if openItems.length}
        <div class="fl-app-sub">{openItems.length} open</div>
      {/if}
    </div>
    <button class="fl-btn primary" onclick={addAssignment}>
      <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
      new
    </button>
  </div>

  {#if assignmentStore.loaded && visible.length === 0}
    <div class="fl-empty">
      <div class="big">nothing due</div>
      <div>flow can add assignments here when you tell it about one, or add one yourself</div>
    </div>
  {/if}

  <div class="fl-scroll list">
    {#each openItems as a (a.id)}
      <div
        class="row fl-glass"
        class:overdue={isOverdue(a)}
        role="button"
        tabindex="0"
        onclick={() => openItem(a.id)}
        onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openItem(a.id); }}
      >
        <button class="check" onclick={(e) => toggleDone(a, e)} aria-label="mark done" aria-pressed="false"></button>
        <span class="item-body">
          <span class="title">{a.title}</span>
          <span class="meta">
            {#if a.subject}<span class="subject">{a.subject}</span>{/if}
            <span class="due" class:overdue={isOverdue(a)}>{dueLabel(a.dueAt)}</span>
          </span>
          {#if a.grade || a.gradeImpact}
            <span class="grade-line">
              {#if a.grade}<span class="grade">{a.grade}</span>{/if}
              {#if a.gradeImpact}<span class="impact">{a.gradeImpact}</span>{/if}
            </span>
          {/if}
        </span>
      </div>
    {/each}

    {#if doneItems.length}
      <div class="section-label">done</div>
      {#each doneItems as a (a.id)}
        <div
          class="row fl-glass done"
          role="button"
          tabindex="0"
          onclick={() => openItem(a.id)}
          onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') openItem(a.id); }}
        >
          <button class="check on" onclick={(e) => toggleDone(a, e)} aria-label="mark not done" aria-pressed="true">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </button>
          <span class="item-body">
            <span class="title">{a.title}</span>
            <span class="meta">
              {#if a.subject}<span class="subject">{a.subject}</span>{/if}
              {#if a.grade}<span class="grade">{a.grade}</span>{/if}
            </span>
          </span>
        </div>
      {/each}
    {/if}
  </div>

  {#if selectedItem}
    <div class="panel fl-glass">
      <div class="panel-head">
        <input
          class="fl-input title"
          bind:value={titleDraft}
          oninput={persist}
          placeholder="assignment title"
          aria-label="assignment title"
        />
        <button class="fl-btn quiet fl-round" aria-label="close" onclick={closePanel}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div class="fields-row">
        <input
          class="fl-input"
          bind:value={subjectDraft}
          oninput={persist}
          placeholder="class / subject"
          aria-label="subject"
        />
        <input class="fl-input" type="date" bind:value={dueDraft} oninput={persist} aria-label="due date" />
      </div>

      <textarea
        class="fl-textarea body"
        bind:value={descDraft}
        oninput={persist}
        placeholder="what's the assignment…"
        aria-label="description"
      ></textarea>

      <div class="fields-row">
        <input class="fl-input" bind:value={gradeDraft} oninput={persist} placeholder="grade (e.g. 92%)" aria-label="grade" />
        <input
          class="fl-input"
          bind:value={impactDraft}
          oninput={persist}
          placeholder="impact on final grade"
          aria-label="grade impact"
        />
      </div>

      <button class="fl-btn quiet danger" onclick={removeSelected}>delete assignment</button>
    </div>
  {/if}
</div>

<style>
  .assignments {
    height: 100%;
  }

  .list {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-bottom: 12px;
  }

  .section-label {
    margin: 6px 2px 0;
    font-family: var(--font-body);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.45;
  }

  .row {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
    padding: 12px 14px;
    border: 0;
    border-radius: 16px;
    text-align: left;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .row.overdue {
    box-shadow: inset 0 0 0 1.5px hsl(350 70% 55% / 0.35);
  }
  .row.done {
    opacity: 0.55;
  }

  .check {
    flex: none;
    width: 22px;
    height: 22px;
    margin-top: 1px;
    padding: 0;
    border-radius: 999px;
    border: 2px solid hsl(212 30% 55% / 0.45);
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .check.on {
    border-color: transparent;
    background: linear-gradient(172deg, hsl(150 55% 48%), hsl(150 55% 38%));
    color: #fff;
  }
  .check.on svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.6;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .item-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
    flex: 1;
  }
  .title {
    font-family: var(--font-body);
    font-size: 14.5px;
    font-weight: 700;
    color: var(--deep);
  }
  .done .title {
    text-decoration: line-through;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 600;
    opacity: 0.65;
  }
  .due.overdue {
    color: hsl(350 70% 45%);
    opacity: 1;
  }
  .grade-line {
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: var(--font-body);
    font-size: 11.5px;
  }
  .grade {
    font-weight: 700;
    color: hsl(212 70% 40%);
  }
  .impact {
    opacity: 0.6;
  }

  .panel {
    position: absolute;
    left: 18px;
    right: 18px;
    bottom: calc(18px + env(safe-area-inset-bottom));
    max-width: 480px;
    margin: 0 auto;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panel-head {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .panel-head .title {
    flex: 1;
    font-weight: 700;
  }
  .fields-row {
    display: flex;
    gap: 8px;
  }
  .fields-row .fl-input {
    flex: 1;
    min-width: 0;
  }
  .fl-textarea.body {
    min-height: 80px;
    max-height: 200px;
    overflow-y: auto;
  }
  .danger {
    color: #b4225a;
  }
</style>

<script lang="ts">
  import { memoryStore, type MemoryNode } from '../../ai/memory.svelte';
  import { play } from '../../sound/engine';

  /*
    The memory graph. Every memory the assistant keeps is a node here —
    a title and a markdown body, positioned on a small hand-rolled
    force-directed layout (no charting library: flow's one external
    dependency is Supabase). Repulsion keeps nodes apart, links pull their
    two ends together, a weak centering force keeps the whole graph from
    drifting off-canvas, and everything settles and stops redrawing once it
    stops moving rather than looping forever.
  */

  let canvasEl: HTMLCanvasElement | undefined = $state();
  let wrapEl: HTMLDivElement | undefined = $state();
  let width = $state(0);
  let height = $state(0);

  interface Pos {
    x: number;
    y: number;
    vx: number;
    vy: number;
  }
  const pos = new Map<string, Pos>();

  function seed(id: string, x?: number | null, y?: number | null) {
    if (pos.has(id)) return;
    pos.set(id, {
      x: x ?? width / 2 + (Math.random() - 0.5) * 80,
      y: y ?? height / 2 + (Math.random() - 0.5) * 80,
      vx: 0,
      vy: 0
    });
  }

  $effect(() => {
    void memoryStore.load();
  });

  // keep the runtime position map in sync with the store's node list —
  // seed new nodes, drop removed ones, and wake the sim either way
  $effect(() => {
    const ids = new Set(memoryStore.nodes.map((n) => n.id));
    for (const n of memoryStore.nodes) seed(n.id, n.x, n.y);
    for (const id of [...pos.keys()]) if (!ids.has(id)) pos.delete(id);
    wake();
  });

  $effect(() => {
    if (!wrapEl) return;
    const ro = new ResizeObserver(() => {
      const r = wrapEl!.getBoundingClientRect();
      width = r.width;
      height = r.height;
      if (canvasEl) {
        const dpr = window.devicePixelRatio || 1;
        canvasEl.width = width * dpr;
        canvasEl.height = height * dpr;
        canvasEl.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      wake();
    });
    ro.observe(wrapEl);
    return () => ro.disconnect();
  });

  const RADIUS = 30;
  const LINK_LEN = 120;

  let raf = 0;
  let idleFrames = 0;

  function step() {
    let motion = 0;

    // repulsion — every pair pushes apart, falling off with distance²
    const ids = [...pos.keys()];
    for (let i = 0; i < ids.length; i++) {
      const a = pos.get(ids[i])!;
      for (let j = i + 1; j < ids.length; j++) {
        const b = pos.get(ids[j])!;
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          dx = Math.random() - 0.5;
          dy = Math.random() - 0.5;
          d2 = 1;
        }
        const f = 5200 / d2;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        a.vx += fx;
        a.vy += fy;
        b.vx -= fx;
        b.vy -= fy;
      }
    }

    // springs — a link pulls (or pushes) its two ends toward a rest length
    for (const l of memoryStore.links) {
      const a = pos.get(l.aId);
      const b = pos.get(l.bId);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      const f = (d - LINK_LEN) * 0.02;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      a.vx += fx;
      a.vy += fy;
      b.vx -= fx;
      b.vy -= fy;
    }

    // weak centering, so the graph doesn't drift off the visible canvas
    const cx = width / 2;
    const cy = height / 2;
    for (const p of pos.values()) {
      if (p === dragging) continue;
      p.vx += (cx - p.x) * 0.001;
      p.vy += (cy - p.y) * 0.001;
      p.vx *= 0.9;
      p.vy *= 0.9;
      p.x += p.vx;
      p.y += p.vy;
      motion += Math.abs(p.vx) + Math.abs(p.vy);
    }

    draw();

    // once the layout has settled, stop redrawing rather than looping
    // forever — a still graph costs nothing until something moves again
    if (motion < 0.6) {
      idleFrames++;
      if (idleFrames > 30) {
        raf = 0;
        return;
      }
    } else {
      idleFrames = 0;
    }
    raf = requestAnimationFrame(step);
  }

  function wake() {
    idleFrames = 0;
    if (!raf) raf = requestAnimationFrame(step);
  }

  function color(name: string): string {
    if (!canvasEl) return '#0d3f8f';
    return getComputedStyle(canvasEl).getPropertyValue(name).trim() || '#0d3f8f';
  }

  function draw() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    const deep = color('--deep');
    const ink = color('--ink');

    // links first, under the nodes
    ctx.strokeStyle = 'rgba(53, 169, 236, 0.4)';
    ctx.lineWidth = 1.6;
    for (const l of memoryStore.links) {
      const a = pos.get(l.aId);
      const b = pos.get(l.bId);
      if (!a || !b) continue;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    // link-mode preview: a line from the pinned node to the pointer
    if (linkFrom && pointerPos) {
      const a = pos.get(linkFrom);
      if (a) {
        ctx.setLineDash([4, 5]);
        ctx.strokeStyle = 'rgba(53, 169, 236, 0.7)';
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(pointerPos.x, pointerPos.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    for (const n of memoryStore.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const isSelected = selected === n.id;
      const isLinkEnd = linkFrom === n.id;

      const grad = ctx.createRadialGradient(p.x - 9, p.y - 11, 2, p.x, p.y, RADIUS);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.45, 'rgba(127,212,245,0.85)');
      grad.addColorStop(1, 'rgba(30,111,217,0.85)');
      ctx.beginPath();
      ctx.arc(p.x, p.y, RADIUS, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = isSelected || isLinkEnd ? 3 : 1.4;
      ctx.strokeStyle = isSelected || isLinkEnd ? deep : 'rgba(255,255,255,0.85)';
      ctx.stroke();

      ctx.fillStyle = ink;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = n.title.length > 16 ? `${n.title.slice(0, 16)}…` : n.title;
      ctx.fillText(label, p.x, p.y + RADIUS + 4);
    }
  }

  $effect(() => () => {
    if (raf) cancelAnimationFrame(raf);
  });

  /* ---- interaction ---- */

  let dragging: Pos | null = null;
  let draggingId: string | null = null;
  let dragMoved = false;
  let linkFrom: string | null = $state(null);
  let pointerPos = $state<{ x: number; y: number } | null>(null);
  let selected = $state<string | null>(null);

  const selectedNode = $derived(memoryStore.nodes.find((n) => n.id === selected) ?? null);
  const selectedLinks = $derived(
    selected
      ? memoryStore.links
          .filter((l) => l.aId === selected || l.bId === selected)
          .map((l) => ({ link: l, other: memoryStore.nodes.find((n) => n.id === (l.aId === selected ? l.bId : l.aId)) }))
          .filter((x): x is { link: (typeof memoryStore.links)[number]; other: MemoryNode } => !!x.other)
      : []
  );

  function toLocal(e: PointerEvent): { x: number; y: number } {
    const r = canvasEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitTest(x: number, y: number): string | null {
    for (const n of memoryStore.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      if ((p.x - x) ** 2 + (p.y - y) ** 2 <= RADIUS * RADIUS) return n.id;
    }
    return null;
  }

  function onpointerdown(e: PointerEvent) {
    if (linking) return; // link mode handles clicks on the `click` event instead
    const { x, y } = toLocal(e);
    const id = hitTest(x, y);
    if (!id) return;
    draggingId = id;
    dragging = pos.get(id) ?? null;
    dragMoved = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onpointermove(e: PointerEvent) {
    const { x, y } = toLocal(e);
    pointerPos = { x, y };
    if (!dragging) {
      if (linkFrom) draw();
      return;
    }
    dragging.x = x;
    dragging.y = y;
    dragging.vx = 0;
    dragging.vy = 0;
    dragMoved = true;
    wake();
  }

  function onpointerup() {
    if (dragging && draggingId) {
      const p = pos.get(draggingId);
      if (p && dragMoved) void memoryStore.updateNode(draggingId, { x: p.x, y: p.y });
      else if (!dragMoved) openNode(draggingId);
    }
    dragging = null;
    draggingId = null;
  }

  function onclickCanvas(e: MouseEvent) {
    if (!linking) return;
    const r = canvasEl!.getBoundingClientRect();
    const id = hitTest(e.clientX - r.left, e.clientY - r.top);
    if (!id) return;
    if (!linkFrom) {
      linkFrom = id;
      play('tap');
      return;
    }
    if (id === linkFrom) {
      linkFrom = null;
      return;
    }
    const existing = memoryStore.links.find(
      (l) => (l.aId === linkFrom && l.bId === id) || (l.bId === linkFrom && l.aId === id)
    );
    if (existing) void memoryStore.unlink(existing.id);
    else void memoryStore.link(linkFrom, id);
    linkFrom = null;
    play('toggle');
  }

  function openNode(id: string) {
    selected = id;
    play('tap');
  }

  function toggleLinkMode() {
    linkFrom = null;
    linking = !linking;
    play('tap');
  }
  let linking = $state(false);
  $effect(() => {
    if (!linking) linkFrom = null;
  });

  let titleDraft = $state('');
  let bodyDraft = $state('');
  $effect(() => {
    titleDraft = selectedNode?.title ?? '';
    bodyDraft = selectedNode?.body ?? '';
  });

  let saveTimer: ReturnType<typeof setTimeout>;
  function persist() {
    clearTimeout(saveTimer);
    const id = selected;
    if (!id) return;
    saveTimer = setTimeout(() => {
      void memoryStore.updateNode(id, { title: titleDraft.trim() || 'untitled', body: bodyDraft });
    }, 300);
  }

  function closePanel() {
    clearTimeout(saveTimer);
    if (selected) void memoryStore.updateNode(selected, { title: titleDraft.trim() || 'untitled', body: bodyDraft });
    selected = null;
  }

  async function removeSelected() {
    if (!selected) return;
    await memoryStore.deleteNode(selected);
    selected = null;
    play('toggle');
  }

  async function addNode() {
    const node = await memoryStore.createNode('untitled', '');
    if (node) {
      seed(node.id);
      wake();
      openNode(node.id);
    }
    play('tap');
  }
</script>

<div class="fl-app memory">
  <div class="fl-app-head">
    <div>
      <div class="fl-app-title">memory</div>
      {#if memoryStore.nodes.length}
        <div class="fl-app-sub">{memoryStore.nodes.length} node{memoryStore.nodes.length === 1 ? '' : 's'}</div>
      {/if}
    </div>
    <div class="head-actions">
      <button class="fl-btn quiet" class:on={linking} onclick={toggleLinkMode}>
        {linking ? 'linking…' : 'link'}
      </button>
      <button class="fl-btn primary" onclick={addNode}>
        <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        new
      </button>
    </div>
  </div>

  {#if memoryStore.loaded && memoryStore.nodes.length === 0}
    <div class="fl-empty">
      <div class="big">nothing remembered yet</div>
      <div>flow saves what it learns here as you chat, or from quick info</div>
    </div>
  {/if}

  <div class="canvas-wrap" bind:this={wrapEl}>
    <canvas
      bind:this={canvasEl}
      onpointerdown={onpointerdown}
      onpointermove={onpointermove}
      onpointerup={onpointerup}
      onclick={onclickCanvas}
      aria-label="memory graph"
    ></canvas>
  </div>

  {#if selectedNode}
    <div class="panel fl-glass">
      <div class="panel-head">
        <input
          class="fl-input title"
          bind:value={titleDraft}
          oninput={persist}
          placeholder="title"
          aria-label="node title"
        />
        <button class="fl-btn quiet fl-round" aria-label="close" onclick={closePanel}>
          <svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <textarea
        class="fl-textarea body"
        bind:value={bodyDraft}
        oninput={persist}
        placeholder="markdown notes…"
        aria-label="node body"
      ></textarea>
      {#if selectedLinks.length}
        <div class="links">
          {#each selectedLinks as { link, other } (link.id)}
            <button class="chip" onclick={() => memoryStore.unlink(link.id)}>
              {other.title} ×
            </button>
          {/each}
        </div>
      {/if}
      <button class="fl-btn quiet danger" onclick={removeSelected}>delete node</button>
    </div>
  {/if}
</div>

<style>
  .memory {
    height: 100%;
  }
  .head-actions {
    display: flex;
    gap: 8px;
  }
  .fl-btn.on {
    background: linear-gradient(172deg, var(--azure), var(--royal));
    color: #fff;
  }

  .canvas-wrap {
    flex: 1;
    min-height: 0;
    position: relative;
    border-radius: 20px;
    overflow: hidden;
  }
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
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
  .body {
    min-height: 96px;
    max-height: 220px;
    overflow-y: auto;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .chip {
    font-family: var(--font-body);
    font-size: 11.5px;
    font-weight: 600;
    padding: 6px 11px;
    border-radius: 999px;
    cursor: pointer;
    color: var(--deep);
    border: 1px solid rgba(255, 255, 255, 0.8);
    background: linear-gradient(168deg, rgba(255, 255, 255, 0.7), rgba(226, 245, 253, 0.5));
  }
  .danger {
    color: #b4225a;
  }
</style>

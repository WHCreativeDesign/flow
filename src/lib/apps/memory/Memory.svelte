<script lang="ts">
  import { memoryStore, type MemoryNode } from '../../ai/memory.svelte';
  import { play } from '../../sound/engine';
  import { haptic } from '../../haptics';

  /*
    The memory graph. Every memory the assistant keeps is a node here —
    a title and a markdown body, positioned on a small hand-rolled
    force-directed layout (no charting library: flow's one external
    dependency is Supabase). Repulsion keeps nodes apart, links pull their
    two ends together, a weak centering force keeps the whole graph from
    drifting off-canvas, and everything settles and stops redrawing once it
    stops moving rather than looping forever.

    The camera is a separate concern from the physics: `view` is a plain
    pan (x, y in screen px) + zoom (scale) applied once around all drawing
    and hit-testing, never touched by the simulation. One finger drags a
    node or pans empty canvas; two fingers pinch-zoom, anchored so whatever
    world point sat under the midpoint stays there as it moves — the same
    contract mouse wheel + ctrl/trackpad-pinch gets on desktop.

    Tap vs. drag is decided by a real movement threshold (`TAP_SLOP`), not
    by whether any `pointermove` fired at all: a finger resting on glass
    reports a few px of jitter even when "still," and treating that jitter
    as a drag was why tapping a node to open it used to only work about
    half the time on a phone.
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

  /*
    A node's x/y persists across sessions, but nothing about it is aware of
    how big the canvas was when it was last placed. A graph positioned on a
    phone-width canvas lands, unmoved, in a small corner of a much wider
    desktop one — the view itself never re-centers for the viewport it's
    actually being shown on. Left alone, every real node ends up outside
    where a person would ever think to click, and dragging empty canvas
    (which correctly pans) reads as "nodes are broken, only the canvas
    moves." One automatic fit, the first time there is both a loaded graph
    and a real canvas size to frame it against, fixes that without ever
    fighting a manual pan/zoom the person does afterward.
  */
  let hasFitOnce = false;
  $effect(() => {
    if (hasFitOnce || !memoryStore.loaded || !width || !height || !memoryStore.nodes.length) return;
    hasFitOnce = true;
    fitView(true);
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
  const MIN_SCALE = 0.35;
  const MAX_SCALE = 2.75;

  /* Pan (screen px) + zoom, independent of the physics — the simulation
     only ever knows world coordinates. */
  const view = { x: 0, y: 0, scale: 1 };

  function toWorld(sx: number, sy: number): { x: number; y: number } {
    return { x: (sx - view.x) / view.scale, y: (sy - view.y) / view.scale };
  }

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

    // weak centering, so the graph doesn't drift arbitrarily far — a fixed
    // world point, deliberately not tied to wherever the camera is panned
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

  /* A faint dot grid, fixed to world space so it visibly pans and zooms with
     the graph — the one cue that this is a camera over a surface, not a
     static picture. Dots stay a constant screen size regardless of zoom
     (only their spacing is in world units), and the grid is skipped
     entirely once zoomed out far enough that dots would mush together. */
  function drawGrid(ctx: CanvasRenderingContext2D) {
    const spacing = 44;
    const screenSpacing = spacing * view.scale;
    if (screenSpacing < 16) return;
    const topLeft = toWorld(0, 0);
    const bottomRight = toWorld(width, height);
    const startX = Math.floor(topLeft.x / spacing) * spacing;
    const startY = Math.floor(topLeft.y / spacing) * spacing;
    ctx.fillStyle = 'rgba(53, 169, 236, 0.16)';
    for (let wx = startX; wx <= bottomRight.x; wx += spacing) {
      const sx = wx * view.scale + view.x;
      for (let wy = startY; wy <= bottomRight.y; wy += spacing) {
        const sy = wy * view.scale + view.y;
        ctx.beginPath();
        ctx.arc(sx, sy, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  /* A quadratic curve with a slight bow rather than a straight line — links
     read as organic connections instead of a wiring diagram. Drawn twice
     when glowing: a soft wide pass underneath, a crisp pass on top. */
  function drawLink(
    ctx: CanvasRenderingContext2D,
    a: { x: number; y: number },
    b: { x: number; y: number },
    opts: { dashed?: boolean; glow?: boolean; color?: string; width?: number } = {}
  ) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const bow = Math.min(18, dist * 0.08);
    const nx = -dy / dist;
    const ny = dx / dist;
    const mx = (a.x + b.x) / 2 + nx * bow;
    const my = (a.y + b.y) / 2 + ny * bow;

    ctx.setLineDash(opts.dashed ? [5, 6] : []);

    if (opts.glow) {
      ctx.strokeStyle = 'rgba(53, 169, 236, 0.18)';
      ctx.lineWidth = (opts.width ?? 1.8) + 3.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.stroke();
    }
    ctx.strokeStyle = opts.color ?? 'rgba(53, 169, 236, 0.55)';
    ctx.lineWidth = opts.width ?? 1.8;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(mx, my, b.x, b.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function draw() {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, width, height);

    drawGrid(ctx);

    ctx.save();
    ctx.translate(view.x, view.y);
    ctx.scale(view.scale, view.scale);

    const deep = color('--deep');
    const ink = color('--ink');

    for (const l of memoryStore.links) {
      const a = pos.get(l.aId);
      const b = pos.get(l.bId);
      if (!a || !b) continue;
      drawLink(ctx, a, b, { glow: true });
    }

    // link-mode preview: a dashed curve from the pinned node to the pointer
    if (linkFrom && pointerScreen) {
      const a = pos.get(linkFrom);
      if (a) {
        const w = toWorld(pointerScreen.x, pointerScreen.y);
        drawLink(ctx, a, w, { dashed: true, color: 'rgba(53, 169, 236, 0.8)', width: 2.2 });
      }
    }

    for (const n of memoryStore.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      const isSelected = selected === n.id;
      const isLinkEnd = linkFrom === n.id;
      const isPressed = pressedId === n.id;
      const r = RADIUS * (isPressed ? 0.92 : 1);

      // ground shadow, offset down — lifts the node off the canvas instead
      // of reading as a flat painted circle
      ctx.save();
      ctx.shadowColor = 'rgba(13, 63, 143, 0.35)';
      ctx.shadowBlur = isSelected || isLinkEnd ? 22 : 14;
      ctx.shadowOffsetY = 5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      const body = ctx.createRadialGradient(p.x - r * 0.3, p.y - r * 0.36, r * 0.08, p.x, p.y, r);
      body.addColorStop(0, 'rgba(255,255,255,0.98)');
      body.addColorStop(0.42, 'rgba(159,232,221,0.55)');
      body.addColorStop(0.55, 'rgba(127,212,245,0.88)');
      body.addColorStop(1, 'rgba(30,111,217,0.92)');
      ctx.fillStyle = body;
      ctx.fill();
      ctx.restore();

      // rim
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.lineWidth = isSelected || isLinkEnd ? 3 : 1.4;
      ctx.strokeStyle = isSelected || isLinkEnd ? deep : 'rgba(255,255,255,0.85)';
      ctx.stroke();

      // specular hotspot, upper-left — the same construction Orb.svelte
      // uses in CSS, approximated here since canvas can't share that markup
      const spec = ctx.createRadialGradient(
        p.x - r * 0.32,
        p.y - r * 0.38,
        0,
        p.x - r * 0.32,
        p.y - r * 0.38,
        r * 0.55
      );
      spec.addColorStop(0, 'rgba(255,255,255,0.95)');
      spec.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spec;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = ink;
      ctx.font = '600 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const label = n.title.length > 16 ? `${n.title.slice(0, 16)}…` : n.title;
      ctx.fillText(label, p.x, p.y + RADIUS + 4);
    }

    ctx.restore();
  }

  $effect(() => () => {
    if (raf) cancelAnimationFrame(raf);
  });

  /* ---- interaction ----

     Everything funnels through pointer events rather than the browser's own
     click/gesture handling: with pan, zoom, node-drag and link-mode all
     sharing one surface, only explicit control over "what does this pointer
     sequence mean" can tell a tap from a drag from a pinch. Two or more
     active pointers is always a pinch; one pointer starts 'undecided' and
     only commits to a node-drag or a canvas-pan once it has moved past a
     real threshold — never on the first pixel of touch jitter. */

  interface TrackedPointer {
    x: number;
    y: number;
  }
  const activePointers = new Map<number, TrackedPointer>();

  type Mode = 'idle' | 'undecided' | 'node' | 'pan' | 'pinch';
  let mode: Mode = 'idle';
  let dragging: Pos | null = null;
  let draggingId: string | null = null;
  let dragNodeOffset = { x: 0, y: 0 };
  let downScreen = { x: 0, y: 0 };
  let downWorld = { x: 0, y: 0 };
  /** whatever node was actually under the finger at pointerdown — fixed for
      the whole gesture, so a node that drifts under a physics update mid-tap
      can't dodge the hit-test the way re-testing at release would let it */
  let hitNodeId: string | null = null;
  let candidateNodeId: string | null = null;
  let pressedId: string | null = null;
  let panStartView = { x: 0, y: 0 };
  const pinch = {
    startDist: 1,
    startScale: 1,
    startMid: { x: 0, y: 0 },
    startViewXY: { x: 0, y: 0 }
  };
  const TAP_SLOP = 10;

  let linkFrom: string | null = $state(null);
  let pointerScreen: { x: number; y: number } | null = null;
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

  function screenPoint(e: PointerEvent): { x: number; y: number } {
    const r = canvasEl!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function hitTest(wx: number, wy: number): string | null {
    for (const n of memoryStore.nodes) {
      const p = pos.get(n.id);
      if (!p) continue;
      if ((p.x - wx) ** 2 + (p.y - wy) ** 2 <= RADIUS * RADIUS) return n.id;
    }
    return null;
  }

  function beginPinch() {
    mode = 'pinch';
    dragging = null;
    draggingId = null;
    pressedId = null;
    candidateNodeId = null;
    hitNodeId = null;
    const pts = [...activePointers.values()];
    const [p1, p2] = pts;
    pinch.startDist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    pinch.startScale = view.scale;
    pinch.startMid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    pinch.startViewXY = { x: view.x, y: view.y };
  }

  function updatePinch() {
    const pts = [...activePointers.values()];
    if (pts.length < 2) return;
    const [p1, p2] = pts;
    const dist = Math.hypot(p2.x - p1.x, p2.y - p1.y) || 1;
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinch.startScale * (dist / pinch.startDist)));

    // whatever world point sat under the midpoint at pinch-start stays under
    // the midpoint at every point during the gesture, however it moves
    const anchor = {
      x: (pinch.startMid.x - pinch.startViewXY.x) / pinch.startScale,
      y: (pinch.startMid.y - pinch.startViewXY.y) / pinch.startScale
    };
    view.scale = scale;
    view.x = mid.x - anchor.x * scale;
    view.y = mid.y - anchor.y * scale;
    draw();
  }

  function onpointerdown(e: PointerEvent) {
    /*
      A real device doesn't always deliver a pointerup/pointercancel for
      every pointerdown it sends — an interrupted gesture (an OS edge
      swipe, the app losing focus mid-touch, a WebKit quirk) can leave a
      phantom entry in `activePointers` (and `mode` stuck mid-gesture,
      never returning to 'idle') forever. From then on, every ordinary
      single-finger tap or drag looks like a *second* finger joining an
      already-down one, and gets treated as the start of a pinch instead —
      which explains taps and drags going consistently unreliable rather
      than failing outright.

      The browser's own `isPrimary` flag is the fix, and deliberately
      isn't conditioned on our own `mode`: it is true exactly once per
      fresh multi-touch sequence, for the first finger down among its
      kind — a second finger genuinely joining an active gesture is
      always reported as non-primary. So seeing `isPrimary` true is, on
      its own, the browser telling us no other pointer of this device
      can genuinely still be down; whatever state we're holding from
      before is stale by definition, however mid-gesture it looks.
    */
    if (e.isPrimary) {
      activePointers.clear();
    }

    // capture keeps this pointer's move/up events targeted at the canvas
    // even once a finger wanders outside it mid-gesture — best-effort, since
    // a capture failure (a browser quirk, never expected in practice) must
    // never be allowed to abort the rest of a real touch down
    try {
      canvasEl!.setPointerCapture(e.pointerId);
    } catch {
      /* ignored — see above */
    }
    const p = screenPoint(e);
    activePointers.set(e.pointerId, p);

    if (activePointers.size >= 2) {
      beginPinch();
      return;
    }

    downScreen = p;
    downWorld = toWorld(p.x, p.y);
    hitNodeId = hitTest(downWorld.x, downWorld.y);
    candidateNodeId = linking ? null : hitNodeId;
    mode = 'undecided';
    if (hitNodeId) {
      pressedId = hitNodeId;
      if (candidateNodeId) {
        const n = pos.get(candidateNodeId)!;
        dragNodeOffset = { x: downWorld.x - n.x, y: downWorld.y - n.y };
      }
      draw();
    }
  }

  function onpointermove(e: PointerEvent) {
    if (!activePointers.has(e.pointerId)) return;
    const p = screenPoint(e);
    activePointers.set(e.pointerId, p);
    pointerScreen = p;

    if (mode === 'pinch') {
      updatePinch();
      return;
    }

    if (mode === 'idle') {
      if (e.pointerType === 'mouse' && canvasEl) {
        const w = toWorld(p.x, p.y);
        canvasEl.style.cursor = hitTest(w.x, w.y) ? 'pointer' : 'grab';
      }
      if (linkFrom) draw();
      return;
    }

    const dx = p.x - downScreen.x;
    const dy = p.y - downScreen.y;

    if (mode === 'undecided') {
      if (Math.hypot(dx, dy) < TAP_SLOP) return;
      // linking mode never drags: a node pressed while linking stays pinned
      // to that node regardless of how far the finger wanders — physics can
      // visibly shift a not-yet-settled node under a held finger, and that
      // drift must never read as "let go of this node and pan instead"
      if (linking && hitNodeId) return;
      if (candidateNodeId) {
        mode = 'node';
        draggingId = candidateNodeId;
        dragging = pos.get(candidateNodeId) ?? null;
      } else {
        mode = 'pan';
        panStartView = { x: view.x, y: view.y };
      }
    }

    if (mode === 'node' && dragging) {
      const w = toWorld(p.x, p.y);
      dragging.x = w.x - dragNodeOffset.x;
      dragging.y = w.y - dragNodeOffset.y;
      dragging.vx = 0;
      dragging.vy = 0;
      wake();
    } else if (mode === 'pan') {
      view.x = panStartView.x + dx;
      view.y = panStartView.y + dy;
      if (!raf) draw();
    }
  }

  function endPointer(e: PointerEvent) {
    activePointers.delete(e.pointerId);

    if (mode === 'pinch') {
      if (activePointers.size < 2) {
        mode = 'idle';
        if (activePointers.size === 1) {
          const [remaining] = activePointers.values();
          downScreen = { ...remaining };
          downWorld = toWorld(remaining.x, remaining.y);
        }
      }
      return;
    }

    if (mode === 'undecided') {
      resolveTap();
    } else if (mode === 'node' && draggingId) {
      const p = pos.get(draggingId);
      if (p) void memoryStore.updateNode(draggingId, { x: p.x, y: p.y });
      haptic('light');
    }

    mode = 'idle';
    pressedId = null;
    candidateNodeId = null;
    hitNodeId = null;
    dragging = null;
    draggingId = null;
    if (canvasEl) canvasEl.style.cursor = 'grab';
    draw();
  }

  function resolveTap() {
    if (linking) {
      handleLinkTap(hitNodeId);
      return;
    }
    if (candidateNodeId) openNode(candidateNodeId);
    else if (selected) closePanel();
  }

  function handleLinkTap(id: string | null) {
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

  /* Trackpad pinch synthesizes wheel events with ctrlKey set — the same
     anchor-the-touch-point math as the touch pinch, just one point instead
     of two. Plain wheel/two-finger-scroll pans. */
  function onwheel(e: WheelEvent) {
    e.preventDefault();
    const r = canvasEl!.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (e.ctrlKey || e.metaKey) {
      const factor = Math.exp(-e.deltaY * 0.01);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, view.scale * factor));
      const w = toWorld(sx, sy);
      view.scale = scale;
      view.x = sx - w.x * scale;
      view.y = sy - w.y * scale;
    } else {
      view.x -= e.deltaX;
      view.y -= e.deltaY;
    }
    draw();
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

  function fitView(silent = false) {
    const nodes = [...pos.values()];
    if (!nodes.length) {
      view.x = 0;
      view.y = 0;
      view.scale = 1;
    } else {
      const xs = nodes.map((p) => p.x);
      const ys = nodes.map((p) => p.y);
      const minX = Math.min(...xs) - RADIUS;
      const maxX = Math.max(...xs) + RADIUS;
      const minY = Math.min(...ys) - RADIUS;
      const maxY = Math.max(...ys) + RADIUS;
      const bw = Math.max(1, maxX - minX);
      const bh = Math.max(1, maxY - minY);
      const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.min(width / bw, height / bh) * 0.88));
      const cx = (minX + maxX) / 2;
      const cy = (minY + maxY) / 2;
      view.scale = scale;
      view.x = width / 2 - cx * scale;
      view.y = height / 2 - cy * scale;
    }
    if (!silent) play('tap');
    wake();
  }

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
      <button class="fl-btn quiet fl-round" aria-label="fit view" onclick={() => fitView()}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 9V5a1 1 0 0 1 1-1h4M20 9V5a1 1 0 0 0-1-1h-4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4" />
        </svg>
      </button>
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
      onpointerup={endPointer}
      onpointercancel={endPointer}
      onwheel={onwheel}
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
    align-items: center;
    gap: 8px;
  }
  .head-actions .fl-round {
    width: 38px;
    height: 38px;
  }
  .head-actions .fl-round svg {
    width: 16px;
    height: 16px;
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

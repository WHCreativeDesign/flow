<script lang="ts">
  import { onMount } from 'svelte';

  /*
    A page inside an app.

    Apps have their own navigation — notes list to one note, chats to one
    conversation, gallery to one photo — and until now those swapped with a
    hard cut. The shell's whole premise is that surfaces grow and shrink
    rather than jump, and a cut inside an app broke that promise the moment
    you were past the orb.

    Both panes are mounted at once during the change, stacked, so the outgoing
    one can actually leave rather than vanishing the instant the incoming one
    appears. Depth is the direction: going deeper, the new pane rises from
    slightly behind and the old one recedes; coming back, exactly reversed.
    That is what makes back feel like back and not like another forward.

    Transform and opacity only, so the whole thing runs on the compositor —
    and so it stays identical at every graphics tier. A cheap device should
    still feel like the same system answering you.
  */
  interface Props {
    /** which pane is showing — a change animates */
    key: string | number;
    /** +1 going deeper, -1 coming back */
    direction?: 1 | -1;
    children: import('svelte').Snippet;
  }
  let { key, direction = 1, children }: Props = $props();

  interface Layer {
    id: number;
    key: string | number;
    snippet: import('svelte').Snippet;
    dir: 1 | -1;
    leaving: boolean;
  }

  let seq = 0;
  let layers = $state<Layer[]>([]);
  let mounted = false;
  let lastKey: string | number | undefined;
  let timers: ReturnType<typeof setTimeout>[] = [];

  const DURATION = 380;

  onMount(() => {
    mounted = true;
    return () => timers.forEach(clearTimeout);
  });

  $effect(() => {
    const k = key;
    const snippet = children;
    if (k === lastKey) {
      // same pane, re-rendered content: swap the snippet without animating
      if (layers.length) layers[layers.length - 1].snippet = snippet;
      return;
    }
    const first = lastKey === undefined;
    lastKey = k;

    const incoming: Layer = { id: seq++, key: k, snippet, dir: direction, leaving: false };

    if (first || !mounted) {
      layers = [incoming];
      return;
    }

    // mark everything already here as on its way out, then drop it once the
    // curve has actually finished rather than when it starts
    const outgoing = layers.map((l) => ({ ...l, leaving: true, dir: direction }));
    layers = [...outgoing, incoming];

    const dying = outgoing.map((l) => l.id);
    const t = setTimeout(() => {
      layers = layers.filter((l) => !dying.includes(l.id));
    }, DURATION);
    timers.push(t);
  });
</script>

<div class="stack" style:--dur={`${DURATION}ms`}>
  {#each layers as layer (layer.id)}
    <div
      class="pane"
      class:leaving={layer.leaving}
      class:back={layer.dir === -1}
      aria-hidden={layer.leaving ? 'true' : undefined}
      inert={layer.leaving ? true : undefined}
    >
      {@render layer.snippet()}
    </div>
  {/each}
</div>

<style>
  .stack {
    position: relative;
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  .pane {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    /* entering, going deeper */
    animation: in-forward var(--dur) var(--ease-bloom) both;
  }
  .pane.back {
    animation-name: in-back;
  }

  /*
    The outgoing pane is taken out of flow so the two do not stack vertically
    mid-change. It keeps its box because the stack is the positioning parent.
  */
  .pane.leaving {
    position: absolute;
    inset: 0;
    animation-name: out-forward;
    pointer-events: none;
  }
  .pane.leaving.back {
    animation-name: out-back;
  }

  /* Going deeper: the new pane comes up from behind, the old recedes. */
  @keyframes in-forward {
    from { opacity: 0; transform: translate3d(0, 16px, 0) scale(0.985); }
    to { opacity: 1; transform: none; }
  }
  @keyframes out-forward {
    from { opacity: 1; transform: none; }
    to { opacity: 0; transform: translate3d(0, -10px, 0) scale(1.012); }
  }

  /* Coming back: exactly reversed, which is what makes back read as back. */
  @keyframes in-back {
    from { opacity: 0; transform: translate3d(0, -14px, 0) scale(1.015); }
    to { opacity: 1; transform: none; }
  }
  @keyframes out-back {
    from { opacity: 1; transform: none; }
    to { opacity: 0; transform: translate3d(0, 14px, 0) scale(0.985); }
  }

  @media (prefers-reduced-motion: reduce) {
    .pane,
    .pane.leaving {
      animation: none;
    }
    .pane.leaving {
      display: none;
    }
  }
</style>

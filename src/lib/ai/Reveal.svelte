<script lang="ts">
  /*
    Word-by-word reveal for an assistant reply.

    Two sources feed this. A finished message hands over its whole text at
    once; a streaming one grows under it as tokens land. Both are the same
    problem — reveal words at a readable pace, never faster than they exist —
    so there is one loop, and `text` growing is simply more to reveal.

    That is why progress lives outside the reactive graph. If the cursor reset
    every time `text` changed, a streaming reply would restart its animation
    on every token and never get anywhere.

    The pacing is driven by the text itself rather than a fixed tick: a word
    costs a beat, a comma buys a short rest, a sentence ending a longer one.
    Prose has rhythm, and revealing it evenly throws the rhythm away. One
    requestAnimationFrame loop against real elapsed time drives it, because a
    timer that drifts under load stutters and smoothness is the whole point.

    When the model outruns the reader the loop speeds up rather than falling
    behind: a long backlog shortens the per-word beat. Waiting on an animation
    to catch up with text that arrived ten seconds ago is worse than a slightly
    quicker read.
  */
  interface Props {
    text: string;
    /** history: show it all, do not re-type it */
    instant?: boolean;
    /** false while tokens are still arriving */
    complete?: boolean;
    oncomplete?: () => void;
    onprogress?: () => void;
  }
  let { text, instant = false, complete = true, oncomplete, onprogress }: Props = $props();

  const BASE_MS = 26; // one plain word
  const COMMA_MS = 70; // a breath
  const SENTENCE_MS = 190; // a full stop

  /* Split so every token keeps its trailing whitespace: rejoining the shown
     tokens reproduces the original text exactly, newlines included. */
  const tokens = $derived(text.match(/\S+\s*/g) ?? []);

  let shown = $state(0);
  let settled = $state(false);

  /* The cursor is deliberately not $state: it must survive `text` growing. */
  let cursor = 0;
  let running = false;

  function costOf(token: string, backlog: number): number {
    const t = token.trimEnd();
    let ms = BASE_MS;
    if (/[.!?]["')\]]?$/.test(t)) ms += SENTENCE_MS;
    else if (/[,;:]$/.test(t)) ms += COMMA_MS;
    else if (/\n\s*\n/.test(token)) ms += SENTENCE_MS * 1.4;

    // catch up when the model is well ahead, rather than queueing forever
    if (backlog > 60) return ms * 0.35;
    if (backlog > 25) return ms * 0.6;
    return ms;
  }

  $effect(() => {
    // read both so this re-runs when either changes
    const list = tokens;
    const finished = complete;

    if (instant) {
      cursor = list.length;
      shown = list.length;
      settled = true;
      return;
    }

    if (cursor >= list.length) {
      // nothing new to show; if nothing more is coming, we are done
      if (finished && !settled) {
        settled = true;
        oncomplete?.();
      }
      return;
    }

    if (running) return; // a loop is already draining the queue
    running = true;

    let raf = 0;
    let last = performance.now();
    let budget = 0;
    let cancelled = false;

    const step = (now: number) => {
      if (cancelled) return;
      budget += now - last;
      last = now;

      const all = tokens;
      let advanced = false;
      while (cursor < all.length) {
        const cost = costOf(all[cursor], all.length - cursor);
        if (budget < cost) break;
        budget -= cost;
        cursor += 1;
        advanced = true;
      }

      if (advanced) {
        shown = cursor;
        onprogress?.();
      }

      if (cursor >= all.length && complete) {
        running = false;
        if (!settled) {
          settled = true;
          oncomplete?.();
        }
        return;
      }
      // still streaming, or still words left: keep the loop alive
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      running = false;
      cancelAnimationFrame(raf);
    };
  });

  const visible = $derived(tokens.slice(0, shown));
  const allOut = $derived(settled && shown >= tokens.length);
</script>

{#if allOut}
  <!-- finished: one text node, not hundreds of spans -->
  <span class="body">{text}</span>
{:else}
  <span class="body">
    {#each visible as token, i (i)}<span class="w">{token}</span>{/each}
  </span>
{/if}

<style>
  .body {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .w {
    display: inline;
    animation: rise 0.34s var(--ease-rise) both;
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(0.24em);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  /* Someone who asked for less motion should get the text, not the show. */
  @media (prefers-reduced-motion: reduce) {
    .w {
      animation: none;
    }
  }
</style>

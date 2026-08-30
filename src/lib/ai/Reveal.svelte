<script lang="ts">
  /*
    Word-by-word reveal for an assistant reply.

    The pacing is driven by the text itself rather than by a fixed tick: a
    word costs a base beat, a comma buys a short rest, and a sentence ending
    buys a longer one. That is what makes it read as writing rather than as a
    progress bar — prose has rhythm, and revealing it evenly throws the rhythm
    away.

    Driven by one requestAnimationFrame loop against real elapsed time, not by
    setInterval: a timer that drifts under load would stutter, and the whole
    point here is smoothness. Each word fades and rises as it mounts, which is
    a transform and an opacity — the two things the compositor can do for free.

    Once the whole message is out, the spans are thrown away and the text is
    rendered as one plain node. A finished message has no reason to stay as
    hundreds of elements.
  */
  interface Props {
    text: string;
    /** skip the animation entirely — history should not re-type itself */
    instant?: boolean;
    oncomplete?: () => void;
    /** fires as words land, so the thread can keep itself scrolled */
    onprogress?: () => void;
  }
  let { text, instant = false, oncomplete, onprogress }: Props = $props();

  const BASE_MS = 26; // one plain word
  const COMMA_MS = 70; // a breath
  const SENTENCE_MS = 190; // a full stop

  /* Split so every token keeps its trailing whitespace: rejoining the shown
     tokens then reproduces the original text exactly, newlines included. */
  const tokens = $derived(text.match(/\S+\s*/g) ?? []);

  let shown = $state(0);
  let done = $state(false);

  function costOf(token: string): number {
    const t = token.trimEnd();
    if (/[.!?]["')\]]?$/.test(t)) return BASE_MS + SENTENCE_MS;
    if (/[,;:]$/.test(t)) return BASE_MS + COMMA_MS;
    // a paragraph break is a bigger beat than a sentence
    if (/\n\s*\n/.test(token)) return BASE_MS + SENTENCE_MS * 1.4;
    return BASE_MS;
  }

  $effect(() => {
    const list = tokens;
    if (instant) {
      shown = list.length;
      done = true;
      return;
    }
    if (!list.length) {
      done = true;
      oncomplete?.();
      return;
    }

    let raf = 0;
    let last = performance.now();
    let budget = 0;
    let i = 0;
    let cancelled = false;

    const step = (now: number) => {
      if (cancelled) return;
      budget += now - last;
      last = now;

      let advanced = false;
      // spend the elapsed time on as many words as it buys
      while (i < list.length && budget >= costOf(list[i])) {
        budget -= costOf(list[i]);
        i += 1;
        advanced = true;
      }

      if (advanced) {
        shown = i;
        onprogress?.();
      }

      if (i >= list.length) {
        done = true;
        oncomplete?.();
        return;
      }
      raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  });

  const visible = $derived(tokens.slice(0, shown));
</script>

{#if done}
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
  /* Someone who has asked for less motion should get the text, not the show. */
  @media (prefers-reduced-motion: reduce) {
    .w {
      animation: none;
    }
  }
</style>

<script lang="ts">
  /*
    The send transition: the question leaves the composer as an object rather
    than appearing above it.

    A clone of the composer's box is flown from where the input was to where
    the bubble lands, morphing its radius and colour on the way. Two details
    do the actual work:

    Liquid, without a filter. A real metaball needs an SVG blur + contrast
    pass, which this project forbids on sight — it forces a full-screen
    re-rasterise every frame, forever, and the cost grows with whatever is
    drawn above it. So the "liquid" here is geometry: the flying box squashes
    against its direction of travel and stretches along it, hardest at peak
    speed and relaxing as it settles, which is exactly what a viscous blob
    does. A tether behind it narrows as it pulls away and pinches out at
    about a third of the trip.

    Break free means visually, not physically. The tether never influences the
    bubble's path — the bubble is on its own eased curve from the first frame
    and would land in the same place at the same time with the tether removed.
    Tension you can see but not feel is the whole trick; a tether that dragged
    would make the motion feel elastic and slow, which is not what was asked
    for.
  */
  interface Props {
    /** where it starts — the composer's box */
    from: DOMRect;
    /** where it lands — the bubble's box */
    to: DOMRect;
    text: string;
    ondone: () => void;
  }
  let { from, to, text, ondone }: Props = $props();

  const DURATION = 560; // medium: readable as motion, not as a wipe

  let el: HTMLDivElement | undefined = $state();
  let done = $state(false);

  const dx = $derived(to.left + to.width / 2 - (from.left + from.width / 2));
  const dy = $derived(to.top + to.height / 2 - (from.top + from.height / 2));
  const distance = $derived(Math.hypot(dx, dy) || 1);

  /* The tether spans from the composer's centre to the flying box, so it is
     laid out along that axis and only ever scaled and rotated. */
  const angle = $derived((Math.atan2(dy, dx) * 180) / Math.PI);

  $effect(() => {
    const t = setTimeout(() => {
      done = true;
      ondone();
    }, DURATION);
    return () => clearTimeout(t);
  });
</script>

{#if !done}
  <div
    class="morph-layer"
    aria-hidden="true"
    style:--x0={`${from.left}px`}
    style:--y0={`${from.top}px`}
    style:--w0={`${from.width}px`}
    style:--h0={`${from.height}px`}
    style:--w1={`${to.width}px`}
    style:--h1={`${to.height}px`}
    style:--dx={`${dx}px`}
    style:--dy={`${dy}px`}
    style:--dur={`${DURATION}ms`}
    style:--angle={`${angle}deg`}
    style:--len={`${distance}px`}
  >
    <!-- the neck: visual connection only, gone before the bubble lands -->
    <span class="tether"></span>

    <div bind:this={el} class="flyer">
      <span class="label">{text}</span>
    </div>
  </div>
{/if}

<style>
  .morph-layer {
    position: fixed;
    inset: 0;
    z-index: 60;
    pointer-events: none;
  }

  .flyer {
    position: absolute;
    left: var(--x0);
    top: var(--y0);
    width: var(--w0);
    height: var(--h0);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding: 10px 15px;
    box-sizing: border-box;
    border-radius: 24px;
    background: linear-gradient(168deg, hsl(205 88% 66%), hsl(212 78% 54%));
    color: #fff;
    font-family: var(--font-body);
    font-size: 14.5px;
    line-height: 1.5;
    overflow: hidden;
    white-space: nowrap;
    transform-origin: 50% 50%;
    animation:
      fly var(--dur) var(--ease-bloom) both,
      goo var(--dur) ease-in-out both;
  }

  .label {
    opacity: 0;
    animation: label-in var(--dur) ease both;
  }

  /*
    Travel and shape. Kept in one keyframe track so the radius finishes with
    the motion: a box that reaches its destination still pill-shaped and then
    corrects reads as two animations, not one object.
  */
  @keyframes fly {
    from {
      transform: translate3d(0, 0, 0);
      width: var(--w0);
      height: var(--h0);
      border-radius: 24px;
    }
    to {
      transform: translate3d(var(--dx), var(--dy), 0);
      width: var(--w1);
      height: var(--h1);
      border-radius: 18px 18px 6px 18px;
    }
  }

  /*
    Squash and stretch, peaking mid-flight. This is the whole liquid read: a
    blob under acceleration thins along its path and swells across it, then
    relaxes as it comes to rest.
  */
  @keyframes goo {
    0% { scale: 1 1; }
    22% { scale: 1.08 0.9; }
    50% { scale: 0.94 1.09; }
    78% { scale: 1.03 0.97; }
    100% { scale: 1 1; }
  }

  /* the text only resolves once the shape is nearly its destination */
  @keyframes label-in {
    0%, 45% { opacity: 0; }
    100% { opacity: 1; }
  }

  /*
    The tether. Anchored at the composer, rotated to point at the target, and
    scaled out along that axis as the flyer leaves. It narrows the whole time
    and pinches to nothing at 34% — the break.
  */
  .tether {
    position: absolute;
    left: calc(var(--x0) + var(--w0) / 2);
    top: calc(var(--y0) + var(--h0) / 2);
    width: var(--len);
    height: calc(var(--h0) * 0.62);
    margin-top: calc(var(--h0) * -0.31);
    transform-origin: 0 50%;
    border-radius: 999px;
    background: linear-gradient(90deg, hsl(205 88% 66%), hsl(212 78% 54%));
    animation: tether var(--dur) ease-in both;
  }

  @keyframes tether {
    0% {
      transform: rotate(var(--angle)) scaleX(0.02) scaleY(1);
      opacity: 0.9;
    }
    18% {
      transform: rotate(var(--angle)) scaleX(0.55) scaleY(0.5);
      opacity: 0.75;
    }
    /* the pinch: thin to nothing while the flyer keeps going */
    34% {
      transform: rotate(var(--angle)) scaleX(0.92) scaleY(0.08);
      opacity: 0.3;
    }
    40%, 100% {
      transform: rotate(var(--angle)) scaleX(1) scaleY(0);
      opacity: 0;
    }
  }

  /*
    Reduced motion, and graphics tier 1, both drop the flourish. The message
    still arrives — it just arrives instead of travelling. Note this is a
    transition, not an idle loop, so tier 1 keeps it: only the tether, which
    is pure decoration, goes.
  */
  @media (prefers-reduced-motion: reduce) {
    .flyer,
    .tether,
    .label {
      animation: none;
    }
    .morph-layer {
      display: none;
    }
  }
  :global(html[data-gfx='1']) .tether {
    display: none;
  }
</style>

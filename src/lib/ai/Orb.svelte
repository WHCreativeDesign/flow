<script lang="ts">
  /*
    The thinking orb — what replaced the three bouncing dots.

    Three stacked layers, all of them rasterised once and thereafter only
    transformed: a soft body, a slowly rotating sheen, and a breathing
    highlight. That is the house performance rule (no `filter`, no
    `mix-blend-mode`, nothing animated but `transform` and `opacity`), and it
    is why this can sit on screen indefinitely without costing a frame budget.

    A dot row says "wait". An orb that breathes says "thinking" — and it is
    the same object the assistant's replies are marked with, so the waiting
    state and the answered state are visibly the same voice.
  */
  interface Props {
    /** 28px in the thread, larger on the glance */
    size?: number;
    /** breathing, versus the still mark beside a finished reply */
    active?: boolean;
  }
  let { size = 28, active = true }: Props = $props();
</script>

<span class="orb" class:active style:--size={`${size}px`} aria-hidden="true">
  <span class="sheen"></span>
  <span class="glint"></span>
</span>

<style>
  .orb {
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--size);
    height: var(--size);
    border-radius: 50%;
    overflow: hidden;
    background:
      radial-gradient(circle at 34% 28%, rgba(255, 255, 255, 0.95) 0%, transparent 52%),
      linear-gradient(158deg, hsl(196 92% 74%) 0%, hsl(212 84% 58%) 46%, hsl(238 68% 52%) 100%);
    box-shadow: 0 4px 14px hsl(212 70% 45% / 0.34);
  }
  .orb.active {
    animation: breathe 2.6s ease-in-out infinite;
  }

  /* the slow colour drift across the body */
  .sheen {
    position: absolute;
    inset: -30%;
    border-radius: 50%;
    background: conic-gradient(
      from 0deg,
      transparent 0deg,
      hsl(188 95% 76% / 0.85) 70deg,
      transparent 150deg,
      hsl(266 88% 72% / 0.75) 250deg,
      transparent 330deg
    );
  }
  .active .sheen {
    animation: spin 3.6s linear infinite;
  }

  /* a small bright core that swells slightly out of phase with the body */
  .glint {
    position: absolute;
    inset: 22%;
    border-radius: 50%;
    background: radial-gradient(circle at 42% 38%, rgba(255, 255, 255, 0.92), transparent 68%);
  }
  .active .glint {
    animation: swell 2.6s ease-in-out infinite;
  }

  @keyframes breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.09); }
  }
  @keyframes spin {
    to { transform: rotate(1turn); }
  }
  @keyframes swell {
    0%, 100% { transform: scale(0.9); opacity: 0.75; }
    50% { transform: scale(1.14); opacity: 1; }
  }

  @media (prefers-reduced-motion: reduce) {
    .orb.active,
    .active .sheen,
    .active .glint {
      animation: none;
    }
  }
</style>

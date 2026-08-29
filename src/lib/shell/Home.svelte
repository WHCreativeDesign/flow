<script lang="ts">
  import Orb from '../components/Orb.svelte';
  import { apps } from '../apps/registry';
  import { settings } from '../settings.svelte';
  import type { BloomOrigin } from './state.svelte';

  interface Props {
    onopen: (appId: string, origin: BloomOrigin) => void;
  }
  let { onopen }: Props = $props();

  let now = $state(new Date());
  $effect(() => {
    const t = setInterval(() => (now = new Date()), 15_000);
    return () => clearInterval(t);
  });

  const time = $derived(
    now
      .toLocaleTimeString([], settings.current.use24hClock
        ? { hour: '2-digit', minute: '2-digit', hour12: false }
        : { hour: 'numeric', minute: '2-digit' })
      .toLowerCase()
  );
  const greeting = $derived.by(() => {
    const h = now.getHours();
    if (h < 5) return 'still up';
    if (h < 12) return 'good morning';
    if (h < 18) return 'good afternoon';
    return 'good evening';
  });
</script>

<!-- home: a field of orbs. Not an icon grid — a surface of held apps. -->
<div class="home">
  <div class="status">
    <span class="pill">{settings.current.deviceLabel}</span>
    <span class="pill time">{time}</span>
  </div>

  <header class="greet">
    <div class="mark" aria-hidden="true">flow</div>
    <div class="hello">{greeting}</div>
  </header>

  <div class="field">
    {#each apps as app, i (app.id)}
      <Orb {app} index={i} {onopen} />
    {/each}
  </div>
</div>

<style>
  .home {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: max(18px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    animation: settle 0.72s var(--ease-rise);
  }

  @keyframes settle {
    from { opacity: 0; transform: translateY(18px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }

  .status {
    width: 100%;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex: none;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    padding: 8px 16px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: lowercase;
    color: var(--deep);
    border-radius: 999px;
    background: var(--glass-bg);
    border: var(--glass-border);
    box-shadow: var(--glass-shadow);
    backdrop-filter: var(--glass-blur);
    -webkit-backdrop-filter: var(--glass-blur);
  }
  .pill.time {
    font-variant-numeric: tabular-nums;
    font-size: 12px;
  }

  .greet {
    flex: none;
    text-align: center;
    margin: auto 0 0;
    padding-top: 12px;
  }
  .mark {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 44px;
    letter-spacing: -0.05em;
    line-height: 1;
    background: linear-gradient(168deg, #9adcf7 0%, var(--azure) 42%, var(--royal) 78%, var(--deep) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 1.5px 0 rgba(255, 255, 255, 0.9)) drop-shadow(0 10px 20px rgba(13, 63, 143, 0.22));
  }
  .hello {
    margin-top: 8px;
    font-size: 13px;
    font-weight: 500;
    letter-spacing: 0.05em;
    color: var(--ink-soft);
  }

  .field {
    display: grid;
    grid-template-columns: repeat(3, minmax(84px, 148px));
    gap: clamp(20px, 4.5vh, 34px) clamp(18px, 4vw, 30px);
    width: min(600px, 100%);
    justify-content: center;
    margin: auto 0;
    padding-bottom: 4vh;
  }
</style>

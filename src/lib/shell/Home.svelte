<script lang="ts">
  import Orb from '../components/Orb.svelte';
  import { apps } from '../apps/registry';
  import type { BloomOrigin } from './state.svelte';

  interface Props {
    onopen: (appId: string, origin: BloomOrigin) => void;
  }
  let { onopen }: Props = $props();
</script>

<!-- home: a field of orbs. Not an icon grid — a surface of held apps. -->
<div class="home">
  <header class="mark" aria-hidden="true">flow</header>
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
    justify-content: center;
    gap: 48px;
    padding: max(24px, env(safe-area-inset-top)) 24px max(24px, env(safe-area-inset-bottom));
    animation: settle 0.72s var(--ease-rise);
  }

  @keyframes settle {
    from { opacity: 0; transform: translateY(18px) scale(0.985); }
    to { opacity: 1; transform: none; }
  }

  .mark {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 34px;
    letter-spacing: -0.045em;
    background: linear-gradient(168deg, #6ec6ef 0%, var(--azure) 45%, var(--royal) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    filter: drop-shadow(0 1px 0 rgba(255, 255, 255, 0.9));
  }

  .field {
    display: grid;
    grid-template-columns: repeat(3, minmax(84px, 150px));
    gap: clamp(20px, 5vw, 34px) clamp(18px, 4vw, 30px);
    width: min(600px, 100%);
    justify-content: center;
  }
</style>

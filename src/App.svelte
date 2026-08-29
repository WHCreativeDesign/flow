<script lang="ts">
  import Atmosphere from './lib/components/Atmosphere.svelte';
  import Idle from './lib/shell/Idle.svelte';
  import Home from './lib/shell/Home.svelte';
  import AppView from './lib/shell/AppView.svelte';
  import { shell } from './lib/shell/state.svelte';
  import { settings } from './lib/settings.svelte';

  // While an app is open it covers the screen: home and the atmosphere below
  // it are occluded, so they hold their pixels and stop animating. Nothing a
  // person can see stops breathing.
  const occluded = $derived(shell.state === 'app');

  $effect(() => {
    document.documentElement.dataset.effects = settings.current.richEffects ? 'full' : 'calm';
  });
</script>

<svelte:window onpointerdown={() => shell.touch()} onkeydown={() => shell.touch()} />

<Atmosphere paused={occluded} />

<main>
  {#if shell.state === 'idle'}
    <Idle onwake={() => shell.wake()} />
  {:else}
    <!-- One Home for both states: it stays mounted under an open app so the
         dismissal reveals the field it grew out of, instead of rebuilding the
         whole orb field on every open and every exit. -->
    <Home onopen={(id, origin) => shell.open(id, origin)} paused={occluded} />
  {/if}

  {#if shell.state === 'app' && shell.activeApp}
    <AppView appId={shell.activeApp} origin={shell.origin} onexit={() => shell.goHome()} />
  {/if}
</main>

<style>
  main {
    position: relative;
    z-index: 2;
    height: 100%;
  }
</style>

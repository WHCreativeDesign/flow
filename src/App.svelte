<script lang="ts">
  import Atmosphere from './lib/components/Atmosphere.svelte';
  import Idle from './lib/shell/Idle.svelte';
  import Home from './lib/shell/Home.svelte';
  import AppView from './lib/shell/AppView.svelte';
  import { shell } from './lib/shell/state.svelte';
</script>

<svelte:window onpointerdown={() => shell.touch()} onkeydown={() => shell.touch()} />

<Atmosphere />

<main>
  {#if shell.state === 'idle'}
    <Idle onwake={() => shell.wake()} />
  {:else if shell.state === 'home'}
    <Home onopen={(id, origin) => shell.open(id, origin)} />
  {/if}

  <!-- The app blooms above home rather than replacing it, so closing reveals
       the field it grew out of. Still one shell state at a time. -->
  {#if shell.state === 'app' && shell.activeApp}
    <Home onopen={() => {}} />
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

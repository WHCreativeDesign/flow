<script lang="ts">
  import Atmosphere from './lib/components/Atmosphere.svelte';
  import Idle from './lib/shell/Idle.svelte';
  import Home from './lib/shell/Home.svelte';
  import AppView from './lib/shell/AppView.svelte';
  import Lock from './lib/shell/Lock.svelte';
  import { shell } from './lib/shell/state.svelte';
  import { settings } from './lib/settings.svelte';
  import { auth } from './lib/auth.svelte';
  import { clearInstanceCache } from './lib/sync';
  import { assistant } from './lib/ai/assistant.svelte';
  import { memoryStore } from './lib/ai/memory.svelte';
  import { glanceAI } from './lib/ai/glance.svelte';
  import { startMenuMusic, stopMenuMusic } from './lib/sound/engine';
  import { deferredPause } from './lib/deferredPause.svelte';

  // While an app is open it covers the screen: home and the atmosphere below
  // it are occluded, so they hold their pixels and stop animating. Nothing a
  // person can see stops breathing.
  const occluded = $derived(shell.state === 'app');
  // Deferred by a beat in both directions: pausing home's field of orbs and
  // the atmosphere lands after an opening app's own mount has settled, and
  // un-pausing lands after a closing app's teardown has — never in the same
  // frame as either. See deferredPause.svelte.ts.
  const occludedSettled = deferredPause(() => occluded);

  // Ambient home music, off by default (settings.musicEnabled). It only
  // plays on the home pages themselves — never over idle, an open app, or a
  // backgrounded tab — so occlusion pauses it exactly like everything else
  // occlusion pauses.
  let pageVisible = $state(!document.hidden);
  $effect(() => {
    const shouldPlay =
      auth.user !== null && shell.state === 'home' && settings.current.musicEnabled && pageVisible;
    if (shouldPlay) startMenuMusic();
    else stopMenuMusic();
  });

  $effect(() => {
    // one attribute the whole stylesheet keys off, rather than a prop threaded
    // through every component that happens to draw something
    document.documentElement.dataset.gfx = String(settings.current.graphics);
  });

  // Nothing behind the lock belongs to anyone until someone is signed in, so
  // the shell does not mount home at all until the stored session resolves.
  $effect(() => {
    void auth.init();
  });

  /*
    Switching user has to switch everything with it. The cached app state is
    the previous person's, so it is dropped before the next one's rows load —
    otherwise User 2 gets a frame of User 1's notes. Settings are pulled
    rather than kept, because they belong to the account, not the screen.

    Keyed on the id alone: this must run on a change of user, not on every
    unrelated mutation of the user object.
  */
  let lastUser: string | null = null;
  $effect(() => {
    const id = auth.user?.id ?? null;
    if (id === lastUser) return;
    lastUser = id;
    clearInstanceCache();
    assistant.reset();
    memoryStore.reset();
    glanceAI.reset();
    shell.reset();
    if (id) void settings.pull();
  });
</script>

<svelte:window onpointerdown={() => shell.touch()} onkeydown={() => shell.touch()} />
<svelte:document onvisibilitychange={() => (pageVisible = !document.hidden)} />

<Atmosphere paused={occludedSettled.current} />

<main>
  {#if !auth.ready}
    <!-- resolving the stored token: no flash of the picker for a signed-in
         terminal, and no flash of home for a signed-out one -->
  {:else if !auth.user}
    <Lock />
  {:else if shell.state === 'idle'}
    <Idle onwake={() => shell.wake()} />
  {:else}
    <!-- One Home for both states: it stays mounted under an open app so the
         dismissal reveals the field it grew out of, instead of rebuilding the
         whole orb field on every open and every exit. -->
    <Home
      onopen={(id, origin) => shell.open(id, origin)}
      paused={occludedSettled.current}
      page={shell.homePage}
      onpage={(p) => shell.setHomePage(p)}
    />
  {/if}

  {#if auth.user && shell.state === 'app' && shell.activeApp}
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

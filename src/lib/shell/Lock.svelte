<script lang="ts">
  import { auth } from '../auth.svelte';
  import { play } from '../sound/engine';

  /*
    The sign-in surface. A terminal with no session shows this instead of
    home — nothing behind it is anyone's until someone signs in, and every
    table is scoped by RLS to whoever holds the session token.

    A plain username + password form, not a picker: the instance used to
    show a grid of every account before anyone typed anything, which both
    exposed who has an account here to a glance at the screen and reduced
    "password" to a short numeric passcode entered after a tap. Typing both
    fields is the ordinary shape of signing in anywhere else, and it is what
    makes an 8-character minimum (see auth.svelte.ts's login()) meaningful:
    a passcode you tap in is never going to be eight characters typed on
    purpose.
  */
  let username = $state('');
  let password = $state('');
  let shake = $state(false);
  let passwordField: HTMLInputElement | undefined = $state();

  async function submit(e: Event) {
    e.preventDefault();
    if (auth.busy || !username.trim() || !password) return;
    const ok = await auth.login(username.trim(), password);
    if (ok) {
      play('open');
    } else {
      play('deny');
      password = '';
      shake = true;
      setTimeout(() => (shake = false), 420);
      passwordField?.focus();
    }
  }
</script>

<div class="lock">
  <div class="intro">
    <h1>flow</h1>
    <p>sign in to this terminal</p>
  </div>

  <form class="entry" class:shake onsubmit={submit}>
    <input
      bind:value={username}
      class="fl-input"
      type="text"
      autocomplete="username"
      placeholder="username"
      aria-label="username"
      onkeydown={(e) => {
        if (e.key === 'Enter') passwordField?.focus();
      }}
    />
    <input
      bind:this={passwordField}
      bind:value={password}
      class="fl-input"
      type="password"
      autocomplete="current-password"
      placeholder="password"
      aria-label="password"
    />

    {#if auth.error}
      <span class="err">{auth.error}</span>
    {/if}

    <button type="submit" class="fl-btn primary" disabled={auth.busy || !username.trim() || !password}>
      {auth.busy ? 'checking…' : 'enter'}
    </button>
  </form>
</div>

<style>
  .lock {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 34px;
    padding: 32px;
  }

  .intro {
    text-align: center;
  }
  h1 {
    font-family: var(--font-display);
    font-size: 44px;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: var(--deep);
    margin: 0;
  }
  .intro p {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--deep);
    opacity: 0.62;
    margin: 6px 0 0;
  }

  .entry {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    width: 100%;
    max-width: 280px;
  }
  .err {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    color: #b4225a;
    text-align: center;
  }

  /* a wrong username or password should feel like one */
  .shake {
    animation: shake 0.4s var(--ease-bloom);
  }
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    18% { transform: translateX(-9px); }
    38% { transform: translateX(8px); }
    58% { transform: translateX(-5px); }
    78% { transform: translateX(3px); }
  }
  @media (prefers-reduced-motion: reduce) {
    .shake { animation: none; }
  }
</style>

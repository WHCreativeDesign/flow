<script lang="ts">
  import { auth } from '../auth.svelte';
  import { play } from '../sound/engine';

  /*
    The sign-in surface. A terminal with no session shows this instead of
    home — nothing behind it is anyone's until someone is chosen, and every
    table is scoped by RLS to whoever holds the session token.

    Two steps on purpose: pick a face, then enter a password. A combined list
    of name+password fields would put every account's field on screen at once,
    which is both uglier and a worse thing to hand someone.
  */
  let picked = $state<string | null>(null);
  let password = $state('');
  let shake = $state(false);
  let field: HTMLInputElement | undefined = $state();

  const chosen = $derived(auth.users.find((u) => u.id === picked));

  function pick(id: string) {
    picked = id;
    password = '';
    auth.error = null;
    play('tap');
    queueMicrotask(() => field?.focus());
  }

  function back() {
    picked = null;
    password = '';
    auth.error = null;
    play('home');
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!chosen || auth.busy) return;
    const ok = await auth.login(chosen.username, password);
    if (ok) {
      play('open');
    } else {
      play('deny');
      password = '';
      shake = true;
      setTimeout(() => (shake = false), 420);
      field?.focus();
    }
  }
</script>

<div class="lock">
  {#if !picked}
    <div class="intro">
      <h1>flow</h1>
      <p>who is using this terminal?</p>
    </div>

    <div class="faces">
      {#each auth.users as u (u.id)}
        <button class="face" onclick={() => pick(u.id)} style:--hue={u.avatarHue}>
          <span class="disc">{u.displayName.slice(0, 1).toUpperCase()}</span>
          <span class="name">{u.displayName}</span>
        </button>
      {/each}
    </div>

    {#if auth.users.length === 0}
      <p class="hint">no users yet — unlock the admin panel in settings to add one</p>
    {/if}
  {:else}
    <form class="entry" class:shake onsubmit={submit}>
      <span class="disc big" style:--hue={chosen?.avatarHue ?? 205}>
        {chosen?.displayName.slice(0, 1).toUpperCase()}
      </span>
      <span class="name big">{chosen?.displayName}</span>

      <input
        bind:this={field}
        bind:value={password}
        class="fl-input pin"
        type="password"
        inputmode="numeric"
        autocomplete="current-password"
        placeholder="password"
        aria-label="password"
      />

      {#if auth.error}
        <span class="err">{auth.error}</span>
      {/if}

      <div class="row">
        <button type="button" class="fl-btn quiet" onclick={back}>back</button>
        <button type="submit" class="fl-btn primary" disabled={auth.busy || !password}>
          {auth.busy ? 'checking…' : 'enter'}
        </button>
      </div>
    </form>
  {/if}
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
  .intro p,
  .hint {
    font-family: var(--font-body);
    font-size: 13px;
    color: var(--deep);
    opacity: 0.62;
    margin: 6px 0 0;
  }

  .faces {
    display: flex;
    flex-wrap: wrap;
    gap: 22px;
    justify-content: center;
  }
  .face {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    padding: 8px;
    background: none;
    border: none;
    cursor: pointer;
    transition: transform 0.32s var(--ease-overshoot);
  }
  .face:hover {
    transform: translateY(-3px);
  }
  .face:active {
    transform: scale(0.94);
    transition-duration: var(--press-duration);
    transition-timing-function: var(--ease-press);
  }

  /* the same construction as an orb, at picker size */
  .disc {
    display: grid;
    place-items: center;
    width: 84px;
    height: 84px;
    border-radius: 50%;
    font-family: var(--font-display);
    font-size: 30px;
    font-weight: 600;
    color: #fff;
    background:
      radial-gradient(ellipse 58% 42% at 32% 22%, rgba(255, 255, 255, 0.92) 0%, transparent 62%),
      linear-gradient(168deg,
        hsl(var(--hue) 88% 72%) 0%,
        hsl(var(--hue) 78% 56%) 55%,
        hsl(var(--hue) 72% 44%) 100%);
    box-shadow: 0 12px 28px hsl(var(--hue) 60% 40% / 0.34), inset 0 -6px 12px rgba(0, 0, 0, 0.12);
  }
  .disc.big {
    width: 96px;
    height: 96px;
    font-size: 34px;
  }
  .name {
    font-family: var(--font-body);
    font-size: 13px;
    font-weight: 600;
    color: var(--deep);
  }
  .name.big {
    font-size: 16px;
  }

  .entry {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }
  .pin {
    width: 210px;
    text-align: center;
    letter-spacing: 0.3em;
    font-size: 18px;
  }
  .err {
    font-family: var(--font-body);
    font-size: 12px;
    font-weight: 600;
    color: #b4225a;
  }
  .row {
    display: flex;
    gap: 10px;
  }

  /* a wrong password should feel like a wrong password */
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
    .face { transition: none; }
  }
</style>

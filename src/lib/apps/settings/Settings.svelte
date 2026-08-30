<script lang="ts">
  import { settings } from '../../settings.svelte';
  import { play } from '../../sound/engine';
  import { auth } from '../../auth.svelte';
  import { assistant } from '../../ai/assistant.svelte';

  const s = $derived(settings.current);

  /*
    The admin panel is reached by tapping the "flow" mark at the bottom five
    times, then entering the admin password. No visible control advertises
    it — that is the point of a hidden account — and the tap counter resets
    if you pause, so it is not something you land on by accident.
  */
  let taps = $state(0);
  let tapTimer: ReturnType<typeof setTimeout> | undefined;
  let askAdmin = $state(false);
  let adminPass = $state('');
  let adminError = $state<string | null>(null);

  function secretTap() {
    clearTimeout(tapTimer);
    taps += 1;
    if (taps >= 5) {
      taps = 0;
      askAdmin = true;
      adminError = null;
      play('toggle');
      return;
    }
    tapTimer = setTimeout(() => (taps = 0), 1200);
  }

  async function unlock(e: Event) {
    e.preventDefault();
    const ok = await auth.unlockAdmin(adminPass);
    adminPass = '';
    if (ok) {
      askAdmin = false;
      adminError = null;
      play('open');
      await loadAdminUsers();
    } else {
      adminError = 'wrong password';
      play('deny');
    }
  }

  /* ---- user management (admin only) ---- */
  interface AdminRow {
    id: string;
    display_name: string;
    username: string;
    is_admin: boolean;
    hidden: boolean;
    avatar_hue: number;
  }
  let adminUsers = $state<AdminRow[]>([]);
  let newName = $state('');
  let newPass = $state('');
  let opError = $state<string | null>(null);
  let pwFor = $state<string | null>(null);
  let pwValue = $state('');

  async function loadAdminUsers() {
    adminUsers = (await auth.adminListUsers()) as AdminRow[];
  }

  async function run(fn: () => Promise<void>) {
    opError = null;
    try {
      await fn();
      await loadAdminUsers();
      play('tap');
    } catch (err) {
      opError = (err as Error).message;
      play('deny');
    }
  }

  const addUser = () =>
    run(async () => {
      if (!newName.trim() || !newPass) throw new Error('name and password are both required');
      // spread the hues so new users do not all look alike
      await auth.adminCreateUser(newName.trim(), newPass, (adminUsers.length * 63 + 205) % 360);
      newName = '';
      newPass = '';
    });

  const changePassword = (id: string) =>
    run(async () => {
      if (!pwValue) throw new Error('a password is required');
      await auth.adminSetPassword(id, pwValue);
      pwFor = null;
      pwValue = '';
    });

  /* ---- assistant setup check ---- */
  let probe = $state<{ groqKey: boolean; geminiKey: boolean; groqModel: string; geminiModel: string } | null>(null);
  let probed = $state(false);
  async function checkAi() {
    probe = await assistant.probe();
    probed = true;
    play('tap');
  }

  const idleChoices = [
    { v: 30, label: '30 seconds' },
    { v: 90, label: '90 seconds' },
    { v: 300, label: '5 minutes' },
    { v: 0, label: 'never' }
  ];

  function setSound(on: boolean) {
    settings.update({ soundEnabled: on });
    if (on) play('toggle');
  }
  function setVolume(v: number) {
    settings.update({ soundVolume: v });
  }
  function setIdle(v: number) {
    settings.update({ idleTimeoutSec: v });
    play('tap');
  }
  function setEffects(on: boolean) {
    settings.update({ richEffects: on });
    play('toggle');
  }
  function setAi(on: boolean) {
    settings.update({ aiEnabled: on });
    play('toggle');
  }
  function setClock(use24: boolean) {
    settings.update({ use24hClock: use24 });
    play('toggle');
  }
</script>

<div class="fl-app">
  <div class="fl-app-head">
    <div>
      <div class="fl-app-title">settings</div>
      <div class="fl-app-sub">this terminal</div>
    </div>
  </div>

  <div class="panels fl-scroll">
    <section class="fl-glass panel">
      <h2>sound</h2>
      <div class="line">
        <span class="line-label">system sounds</span>
        <button
          class="switch"
          class:on={s.soundEnabled}
          role="switch"
          aria-checked={s.soundEnabled}
          aria-label="system sounds"
          onclick={() => setSound(!s.soundEnabled)}
        ><i></i></button>
      </div>
      <div class="line" class:dim={!s.soundEnabled}>
        <span class="line-label">volume</span>
        <input
          class="vol"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={s.soundVolume}
          disabled={!s.soundEnabled}
          oninput={(e) => setVolume(Number(e.currentTarget.value))}
          onchange={() => play('tap')}
          aria-label="volume"
        />
      </div>
    </section>

    <section class="fl-glass panel">
      <h2>surface</h2>
      <div class="line col">
        <span class="line-label">drift to idle after</span>
        <div class="chips">
          {#each idleChoices as c (c.v)}
            <button class="chip" class:sel={s.idleTimeoutSec === c.v} onclick={() => setIdle(c.v)}>
              {c.label}
            </button>
          {/each}
        </div>
      </div>
      <div class="line">
        <span class="line-col">
          <span class="line-label">full atmosphere</span>
          <span class="line-hint">drifting light and bokeh. turn off on older hardware.</span>
        </span>
        <button
          class="switch"
          class:on={s.richEffects}
          role="switch"
          aria-checked={s.richEffects}
          aria-label="full atmosphere"
          onclick={() => setEffects(!s.richEffects)}
        ><i></i></button>
      </div>
      <div class="line">
        <span class="line-label">24-hour clock</span>
        <button
          class="switch"
          class:on={s.use24hClock}
          role="switch"
          aria-checked={s.use24hClock}
          aria-label="24-hour clock"
          onclick={() => setClock(!s.use24hClock)}
        ><i></i></button>
      </div>
    </section>

    <section class="fl-glass panel">
      <h2>assistant</h2>
      <div class="line">
        <span class="line-col">
          <span class="line-label">assistant on the glance</span>
          <span class="line-hint">the daily summary, suggestion chips and ask field on the glance.</span>
        </span>
        <button
          class="switch"
          class:on={s.aiEnabled}
          role="switch"
          aria-checked={s.aiEnabled}
          aria-label="assistant on the glance"
          onclick={() => setAi(!s.aiEnabled)}
        ><i></i></button>
      </div>
    </section>

    <section class="fl-glass panel">
      <h2>this terminal</h2>
      <div class="line col">
        <span class="line-label">name</span>
        <input
          class="fl-input"
          value={s.deviceLabel}
          onchange={(e) => { settings.update({ deviceLabel: e.currentTarget.value.trim() || 'this terminal' }); play('tap'); }}
        />
      </div>
    </section>

    <section class="fl-glass panel">
      <h2>signed in</h2>
      <div class="line">
        <span class="line-label">{auth.user?.displayName ?? '—'}</span>
        <button class="fl-btn quiet" onclick={() => { play('home'); void auth.logout(); }}>sign out</button>
      </div>
      <p class="fine">your notes, chats, messages and settings follow this account to any terminal.</p>
    </section>

    <section class="fl-glass panel">
      <h2>assistant</h2>
      <div class="line">
        <span class="line-label">provider keys</span>
        <button class="fl-btn quiet" onclick={checkAi}>check</button>
      </div>
      {#if probed}
        {#if probe}
          <p class="fine">
            groq {probe.groqKey ? `ready · ${probe.groqModel}` : 'no key set'} ·
            gemini {probe.geminiKey ? `ready · ${probe.geminiModel}` : 'no key set'}
          </p>
          {#if !probe.groqKey && !probe.geminiKey}
            <p class="fine warn">
              add GROQ_API_KEY (and optionally GEMINI_API_KEY) to the `ai` edge function's secrets
              in Supabase. Keys never live in this app — it is a public build.
            </p>
          {/if}
        {:else}
          <p class="fine warn">could not reach the assistant function</p>
        {/if}
      {/if}
    </section>

    {#if auth.adminToken}
      <section class="fl-glass panel">
        <h2>users · admin</h2>

        {#each adminUsers as u (u.id)}
          <div class="line user-row">
            <span class="dot" style:--hue={u.avatar_hue}></span>
            <span class="line-label grow">
              {u.display_name}{#if u.is_admin}<em> · admin</em>{/if}
            </span>
            <button class="fl-btn quiet sm" onclick={() => { pwFor = pwFor === u.id ? null : u.id; pwValue = ''; play('tap'); }}>
              password
            </button>
            {#if !u.is_admin}
              <button class="fl-btn quiet sm" onclick={() => run(() => auth.adminDeleteUser(u.id))}>remove</button>
            {/if}
          </div>
          {#if pwFor === u.id}
            <div class="line sub">
              <input class="fl-input" type="password" bind:value={pwValue} placeholder="new password" />
              <button class="fl-btn primary sm" onclick={() => changePassword(u.id)}>set</button>
            </div>
          {/if}
        {/each}

        <div class="line sub">
          <input class="fl-input" bind:value={newName} placeholder="new user name" />
          <input class="fl-input" type="password" bind:value={newPass} placeholder="password" />
          <button class="fl-btn primary sm" onclick={addUser}>add</button>
        </div>

        {#if opError}<p class="fine warn">{opError}</p>{/if}

        <div class="line">
          <span class="fine">removing a user deletes everything of theirs.</span>
          <button class="fl-btn quiet sm" onclick={() => { auth.lockAdmin(); play('home'); }}>lock</button>
        </div>
      </section>
    {/if}

    {#if askAdmin}
      <section class="fl-glass panel">
        <h2>admin</h2>
        <form class="line sub" onsubmit={unlock}>
          <input class="fl-input" type="password" bind:value={adminPass} placeholder="admin password" />
          <button class="fl-btn primary sm" type="submit">unlock</button>
          <button class="fl-btn quiet sm" type="button" onclick={() => { askAdmin = false; adminPass = ''; }}>cancel</button>
        </form>
        {#if adminError}<p class="fine warn">{adminError}</p>{/if}
      </section>
    {/if}

    <section class="fl-glass panel about">
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="about-mark" onclick={secretTap}>flow</div>
      <p>a personal environment · by cloak</p>
      <p class="fine">one instance, every screen a terminal into it. everything here lives on your instance — nothing leaves it.</p>
    </section>
  </div>
</div>

<style>
  .grow { flex: 1; }
  .sm { padding: 5px 12px; font-size: 10px; }
  .user-row { gap: 8px; }
  .line.sub {
    gap: 8px;
    flex-wrap: wrap;
  }
  .line.sub .fl-input { flex: 1; min-width: 120px; }
  .dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    flex: none;
    background: linear-gradient(168deg, hsl(var(--hue) 88% 70%), hsl(var(--hue) 75% 50%));
  }
  .fine.warn { color: #8d1f48; }
  .about-mark { cursor: default; user-select: none; }

  .panels {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 2px 4px 12px;
  }
  .panel {
    flex: none;
    padding: 18px 20px;
  }
  h2 {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--royal);
    margin-bottom: 6px;
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 0;
  }
  .line + .line {
    border-top: 1px solid rgba(30, 111, 217, 0.1);
  }
  .line.col {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }
  .line.dim {
    opacity: 0.45;
  }
  .line-label {
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }
  .line-col {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .line-hint {
    font-size: 11.5px;
    color: var(--ink-faint);
    line-height: 1.45;
  }

  /* liquid toggle */
  .switch {
    flex: none;
    width: 52px;
    height: 30px;
    border-radius: 99px;
    border: 1px solid rgba(255, 255, 255, 0.85);
    cursor: pointer;
    position: relative;
    background: linear-gradient(178deg, rgba(15, 40, 71, 0.1), rgba(15, 40, 71, 0.16));
    box-shadow: inset 0 2px 5px rgba(13, 63, 143, 0.18);
    transition: background 0.35s ease;
    padding: 0;
  }
  .switch.on {
    background: linear-gradient(172deg, var(--sky), var(--azure));
    box-shadow: inset 0 2px 4px rgba(255, 255, 255, 0.5), inset 0 -4px 8px rgba(13, 63, 143, 0.25);
  }
  .switch i {
    position: absolute;
    top: 2px;
    left: 2px;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 25%, #fff 0%, #eaf7fd 60%, #cfeafa 100%);
    box-shadow: 0 3px 7px rgba(13, 63, 143, 0.3), inset 0 -2px 4px rgba(53, 169, 236, 0.2);
    transition: transform 0.35s var(--ease-overshoot);
  }
  .switch.on i {
    transform: translateX(22px);
  }

  .vol {
    flex: 1;
    max-width: 220px;
    appearance: none;
    height: 5px;
    border-radius: 99px;
    background: rgba(30, 111, 217, 0.15);
    cursor: pointer;
  }
  .vol::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 25%, #fff, var(--sky) 55%, var(--azure));
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 3px 8px rgba(13, 63, 143, 0.3);
  }
  .vol::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: radial-gradient(circle at 32% 25%, #fff, var(--sky) 55%, var(--azure));
    border: 1px solid rgba(255, 255, 255, 0.9);
    box-shadow: 0 3px 8px rgba(13, 63, 143, 0.3);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }
  .chip {
    border: 1px solid rgba(255, 255, 255, 0.85);
    border-radius: 999px;
    padding: 8px 16px;
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-soft);
    cursor: pointer;
    background: linear-gradient(172deg, rgba(255, 255, 255, 0.7), rgba(232, 248, 253, 0.45));
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 1), 0 4px 10px rgba(13, 63, 143, 0.08);
    transition: all 0.3s var(--ease-overshoot);
  }
  .chip.sel {
    color: #fff;
    text-shadow: 0 1px 2px rgba(13, 63, 143, 0.3);
    background: linear-gradient(172deg, var(--azure), var(--royal));
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.6), 0 6px 14px rgba(13, 63, 143, 0.25);
  }

  .about {
    text-align: center;
    padding: 26px 20px;
  }
  .about-mark {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 34px;
    letter-spacing: -0.045em;
    background: linear-gradient(168deg, #6ec6ef 0%, var(--azure) 45%, var(--royal) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .about p {
    margin-top: 6px;
    font-size: 13px;
    color: var(--ink-soft);
  }
  .about .fine {
    font-size: 11.5px;
    color: var(--ink-faint);
    max-width: 320px;
    margin: 8px auto 0;
    line-height: 1.6;
  }
</style>

<script lang="ts">
  import { instance } from '../../sync';
  import { play } from '../../sound/engine';
  import Pane from '../../components/Pane.svelte';
  import { CATALOG, itemById, type ItemKind, type StoreItem } from './catalog';

  /*
    flowstore — a storefront shell over placeholder apps and games.

    Nothing here installs anything real. "Get" flips this item's id into a
    list on the person's own instance state, same as any other per-user
    toggle in flow — it does not add an orb to the field. That is said
    plainly in the detail pane rather than left to look like more than it is.

    Two palettes on purpose, because the name is two words: "flow" reads in
    the system's own water gradient, "store" in a separate warm one. The
    split lives in the identity chrome — the title, the category chips, the
    featured card, each item's icon tile — not in the action button itself:
    "get" is the same flow blue every other primary action in the app uses,
    so a person never has to learn a second "this is the real button" color
    just because they're in the store.
  */

  let installed = $state<string[]>([]);
  let loaded = $state(false);
  let filter = $state<'all' | ItemKind>('all');
  let query = $state('');
  let selectedId = $state<string | null>(null);

  const selected = $derived(selectedId ? itemById(selectedId) : null);

  $effect(() => {
    void instance.getAppState('flowstore').then((s) => {
      if (Array.isArray(s?.installed)) installed = s.installed as string[];
      loaded = true;
    });
  });

  function persist() {
    void instance.setAppState('flowstore', { installed: $state.snapshot(installed) });
  }

  function isInstalled(id: string) {
    return installed.includes(id);
  }

  function toggleInstalled(id: string, e?: MouseEvent) {
    e?.stopPropagation();
    if (isInstalled(id)) {
      installed = installed.filter((x) => x !== id);
      play('toggle');
    } else {
      installed = [...installed, id];
      play('send');
    }
    persist();
  }

  function open(id: string) {
    selectedId = id;
    play('tap');
  }

  const featured = $derived(CATALOG.find((i) => i.featured));

  const filtered = $derived(
    CATALOG.filter((i) => {
      if (i.featured) return false;
      if (filter !== 'all' && i.kind !== filter) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return i.name.toLowerCase().includes(q) || i.category.toLowerCase().includes(q) || i.tagline.toLowerCase().includes(q);
    })
  );

  function stars(n: number) {
    return '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  }
</script>

<div class="fl-app store">
<Pane key={selectedId ?? '#browse'} direction={selectedId ? 1 : -1}>
  {#if selected}
    <div class="fl-app-head">
      <button class="fl-btn quiet" onclick={() => { selectedId = null; play('tap'); }} aria-label="back to flowstore">
        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
        back
      </button>
    </div>

    <div class="detail fl-scroll">
      <div class="detail-head">
        <span class="tile lg" style:--from={selected.accent[0]} style:--to={selected.accent[1]}>
          <svg viewBox="0 0 24 24" aria-hidden="true">{@html selected.icon}</svg>
        </span>
        <div class="detail-meta">
          <div class="detail-name">{selected.name}</div>
          <div class="detail-kind">{selected.kind === 'game' ? 'Game' : 'App'} · {selected.category}</div>
          <div class="stat-row">
            <span class="stat"><span class="stars">{stars(selected.rating)}</span> {selected.rating.toFixed(1)}</span>
            <span class="stat">{selected.sizeMb} MB</span>
          </div>
        </div>
      </div>

      <button
        class="fl-btn get-btn"
        class:installed={isInstalled(selected.id)}
        onclick={(e) => toggleInstalled(selected.id, e)}
      >
        {isInstalled(selected.id) ? 'open' : 'get'}
      </button>

      <p class="tagline">{selected.tagline}</p>

      <div class="shots" aria-hidden="true">
        {#each [0, 1, 2] as i (i)}
          <span class="shot" style:--from={selected.accent[0]} style:--to={selected.accent[1]} style:--shift={`${i * 8}deg`}></span>
        {/each}
      </div>

      <p class="blurb">{selected.blurb}</p>

      <p class="fine">
        flowstore is a design preview — everything in it is a placeholder. Getting {selected.name} marks it as
        installed on your instance; it does not add a working app to the field.
      </p>
    </div>
  {:else}
    <div class="fl-app-head">
      <div>
        <div class="fl-app-title"><span class="fw">flow</span><span class="sw">store</span></div>
        <div class="fl-app-sub">apps &amp; games for this instance</div>
      </div>
    </div>

    <div class="browse fl-scroll">
      <input
        class="fl-input search"
        placeholder="search flowstore"
        value={query}
        oninput={(e) => (query = e.currentTarget.value)}
      />

      <div class="chips">
        {#each [['all', 'all'], ['app', 'apps'], ['game', 'games']] as [v, label] ((v))}
          <button class="chip" class:sel={filter === v} onclick={() => { filter = v as typeof filter; play('tap'); }}>
            {label}
          </button>
        {/each}
      </div>

      {#if featured && filter === 'all' && !query.trim()}
        <div class="hero">
          <button class="hero-open" onclick={() => open(featured.id)}>
            <div class="hero-badge">featured</div>
            <div class="hero-body">
              <span class="tile hero-tile" style:--from={featured.accent[0]} style:--to={featured.accent[1]}>
                <svg viewBox="0 0 24 24" aria-hidden="true">{@html featured.icon}</svg>
              </span>
              <div class="hero-text">
                <div class="hero-name">{featured.name}</div>
                <div class="hero-tagline">{featured.tagline}</div>
              </div>
            </div>
          </button>
          <button
            class="fl-btn get-btn sm"
            class:installed={isInstalled(featured.id)}
            onclick={(e) => toggleInstalled(featured.id, e)}
          >
            {isInstalled(featured.id) ? 'open' : 'get'}
          </button>
        </div>
      {/if}

      {#if !loaded}
        <div class="fl-empty">…</div>
      {:else if filtered.length === 0}
        <div class="fl-empty">
          <div class="big">nothing matches</div>
          <div>try a different search or category</div>
        </div>
      {:else}
        <div class="grid">
          {#each filtered as item (item.id)}
            <div class="card fl-glass">
              <button class="card-open" onclick={() => open(item.id)}>
                <span class="tile" style:--from={item.accent[0]} style:--to={item.accent[1]}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">{@html item.icon}</svg>
                </span>
                <span class="card-meta">
                  <span class="card-name">{item.name}</span>
                  <span class="card-sub">{item.kind === 'game' ? 'Game' : 'App'} · {item.category}</span>
                </span>
              </button>
              <button
                class="fl-btn get-btn sm"
                class:installed={isInstalled(item.id)}
                onclick={(e) => toggleInstalled(item.id, e)}
              >
                {isInstalled(item.id) ? 'open' : 'get'}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {/if}
</Pane>
</div>

<style>
  /*
    The store's own accent, scoped to this component only — every other app
    speaks purely in the water palette from tokens.css; this is the one
    surface that deliberately doesn't, because it needs to read as a
    different kind of place the moment it opens.
  */
  .store {
    --store-a: #ff7a59;
    --store-b: #ff4d8d;
    --store-c: #8b5cf6;
    --store-grad: linear-gradient(135deg, var(--store-a) 0%, var(--store-b) 55%, var(--store-c) 100%);
  }

  .fl-app-title {
    display: inline-flex;
  }
  .fw {
    font-family: var(--font-display);
    font-weight: 600;
    background: linear-gradient(168deg, #9adcf7 0%, var(--azure) 42%, var(--royal) 78%, var(--deep) 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
  .sw {
    font-family: var(--font-display);
    font-weight: 600;
    background: var(--store-grad);
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .browse,
  .detail {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 2px 4px 16px;
    min-height: 0;
  }

  .search {
    flex: none;
  }

  .chips {
    display: flex;
    gap: 8px;
    flex: none;
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
    text-shadow: 0 1px 2px rgba(139, 30, 90, 0.35);
    background: var(--store-grad);
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.6), 0 6px 14px rgba(139, 30, 90, 0.28);
  }

  /* the store's own tinted icon tile, per item */
  .tile {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 52px;
    height: 52px;
    border-radius: 16px;
    background: linear-gradient(150deg, var(--from), var(--to));
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 0.55),
      inset 0 -8px 14px rgba(0, 0, 0, 0.12),
      0 6px 14px rgba(13, 63, 143, 0.16);
  }
  .tile svg {
    width: 26px;
    height: 26px;
    stroke: #fff;
    stroke-width: 1.8;
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.18));
  }
  .tile.lg {
    width: 76px;
    height: 76px;
    border-radius: 22px;
  }
  .tile.lg svg {
    width: 38px;
    height: 38px;
  }

  /* hero: the featured card, full store gradient */
  .hero {
    position: relative;
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.5);
    background: var(--store-grad);
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 0.5),
      inset 0 -14px 24px rgba(0, 0, 0, 0.14),
      0 14px 30px rgba(139, 30, 90, 0.28);
  }
  .hero-open {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
    transition: transform 0.3s var(--ease-overshoot);
  }
  .hero-open:active {
    transform: scale(0.98);
  }
  .hero-badge {
    align-self: flex-start;
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #fff;
    background: rgba(255, 255, 255, 0.22);
  }
  .hero-body {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .hero-tile {
    background: rgba(255, 255, 255, 0.2);
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.4);
  }
  .hero-text {
    min-width: 0;
  }
  .hero-name {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 19px;
    color: #fff;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }
  .hero-tagline {
    margin-top: 3px;
    font-size: 12.5px;
    color: rgba(255, 255, 255, 0.92);
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
    gap: 12px;
    padding-bottom: 8px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
    padding: 16px;
  }
  .card-open {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
    padding: 0;
    border: none;
    background: none;
    text-align: left;
    cursor: pointer;
    font: inherit;
    transition: transform 0.3s var(--ease-overshoot), filter 0.25s ease;
  }
  .card-open:hover {
    filter: brightness(1.03);
  }
  .card-open:active {
    transform: scale(0.98);
  }
  .card-meta {
    display: flex;
    flex-direction: column;
    gap: 2px;
    width: 100%;
  }
  .card-name {
    font-weight: 600;
    font-size: 14.5px;
    color: var(--ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .card-sub {
    font-size: 11px;
    color: var(--ink-faint);
  }

  /* "get" is flow-blue, same as any other primary action in the app — the
     store's own palette lives in the identity chrome (title, chips, hero,
     icon tiles), not in the button that actually does something. Once
     installed, "open" drops to the quiet glass treatment: it's no longer
     asking for a tap, just offering one. */
  .get-btn {
    align-self: stretch;
    justify-content: center;
    color: #fff;
    text-shadow: 0 1px 2px rgba(13, 63, 143, 0.3);
    background:
      radial-gradient(ellipse 70% 50% at 30% 18%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 60%),
      linear-gradient(172deg, var(--azure), var(--royal));
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 0.7),
      inset 0 -8px 14px rgba(13, 63, 143, 0.35),
      0 8px 18px rgba(13, 63, 143, 0.24);
  }
  .get-btn.installed {
    color: var(--deep);
    text-shadow: none;
    background: linear-gradient(172deg, rgba(255, 255, 255, 0.7), rgba(232, 248, 253, 0.45));
    box-shadow:
      inset 0 1.5px 0 rgba(255, 255, 255, 1),
      0 6px 14px rgba(13, 63, 143, 0.1);
  }
  .get-btn.sm {
    padding: 9px 18px;
    font-size: 12px;
    align-self: auto;
    width: 100%;
  }

  .detail-head {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: none;
  }
  .detail-meta {
    min-width: 0;
  }
  .detail-name {
    font-family: var(--font-display);
    font-weight: 600;
    font-size: 22px;
    color: var(--ink);
    letter-spacing: -0.02em;
  }
  .detail-kind {
    margin-top: 2px;
    font-size: 12px;
    color: var(--ink-faint);
  }
  .stat-row {
    display: flex;
    gap: 14px;
    margin-top: 8px;
  }
  .stat {
    font-size: 12px;
    font-weight: 600;
    color: var(--ink-soft);
  }
  .stars {
    color: var(--store-b);
    letter-spacing: 0.02em;
  }

  .tagline {
    flex: none;
    font-size: 14px;
    font-weight: 600;
    color: var(--ink);
  }

  .shots {
    display: flex;
    gap: 10px;
    flex: none;
  }
  .shot {
    flex: 1;
    aspect-ratio: 9 / 16;
    max-width: 110px;
    border-radius: 14px;
    background: linear-gradient(calc(135deg + var(--shift)), var(--from), var(--to));
    opacity: 0.9;
    box-shadow: inset 0 1.5px 0 rgba(255, 255, 255, 0.35), 0 8px 16px rgba(13, 63, 143, 0.14);
  }

  .blurb {
    flex: none;
    font-size: 14px;
    line-height: 1.6;
    color: var(--ink-soft);
  }

  .fine {
    flex: none;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-faint);
    padding-top: 4px;
    border-top: 1px solid rgba(53, 169, 236, 0.16);
  }
</style>

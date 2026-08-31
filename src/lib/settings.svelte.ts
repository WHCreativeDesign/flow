import { configureSound } from './sound/engine';
import { supabase } from './sync/supabase';
import { auth } from './auth.svelte';

/*
  System settings — the settings app writes here, the whole shell reads.

  Two layers, deliberately. localStorage still holds them so the shell can
  paint correctly on the very first frame, before any network call resolves;
  Supabase then holds the authoritative per-user copy, so your volume, clock
  format and idle timeout follow you to any terminal you sign in on rather
  than belonging to a browser.

  Device label is the one exception and stays local: it names the terminal,
  not the person, so syncing it would rename every screen at once.
*/
export interface FlowSettings {
  soundEnabled: boolean;
  soundVolume: number; // 0..1
  idleTimeoutSec: number; // 0 = never
  deviceLabel: string;
  use24hClock: boolean;
  /*
    Graphics tier, 1..3.

      1  low — no idle movement, no decorative depth, fewer drawn objects,
         same as normal below, PLUS the things that actually strain a weak
         GPU: no live backdrop blur (every `.fl-glass` panel falls back to a
         solid gradient instead of sampling what's behind it), an orb's
         press shadow stops interpolating, a chat bubble fades in by opacity
         instead of an animated blur filter, and dragging an open app skips
         animating its corner radius entirely (that write lands on every
         pointermove, not once per gesture). This is the tier a Chromebook
         or similar integrated-GPU device needs to stay smooth.

         Deliberately NOT touched, even at this tier: the border-radius
         curve on app open, close, and a drag's release. All three keep it
         smooth everywhere. border-radius is paid for by the element's full
         layout size, not its current on-screen scale, so snapping it
         straight to the target while the app is still large is one big
         clip-mask repaint rather than many small ones — a version of this
         shipped once and showed up as a glitched, flashing frame on real
         hardware. Interpolating costs more total work but spreads it out,
         which is what actually reads as smooth.
      2  normal — flat. Same animations, same gradients, but no idle movement
         at all, no decorative depth (shadows, grain, blur-ish stacks), and
         fewer drawn objects. (This tier used to be called "low" — most
         people who went looking for a graphics setting at all wanted this
         one, so it is the default expectation now and "low" was freed up
         for hardware that actually needs more than a flat look removed.)
      3  full — every layer, every drift.

    Tiers 2 and 3 keep transitions identical on purpose — a cheap device
    should still feel like the same system responding to you, and what it
    should not do is burn a battery animating things nobody asked to move.
    Tier 1 changes a few things you actually triggered too, but only the
    ones where dropping them is unambiguously cheaper, not the ones where
    it just looks that way — see the app-open/close note above.
  */
  graphics: 1 | 2 | 3;
  /** assistant surfaces on the glance page (summary, suggestions, ask) */
  aiEnabled: boolean;
  /*
    Wii U-menu-style ambient background music on the home pages. Off by
    default: background music is a bigger ask on a shared household terminal
    than any single UI sound is, so unlike every other sound setting this one
    opts in rather than out.
  */
  musicEnabled: boolean;
}

const KEY = 'flow.settings';

const defaults: FlowSettings = {
  soundEnabled: true,
  soundVolume: 0.5,
  idleTimeoutSec: 90,
  deviceLabel: 'this terminal',
  use24hClock: false,
  graphics: 3,
  aiEnabled: true,
  musicEnabled: false
};

function load(): FlowSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return migrate({ ...defaults, ...JSON.parse(raw) });
  } catch {
    /* fresh start */
  }
  return { ...defaults };
}

/* The tier replaced a richEffects boolean. Anyone who had turned effects off
   meant "this device struggles", which is tier 1, not tier 2. */
function migrate(s: FlowSettings & { richEffects?: boolean }): FlowSettings {
  if (s.graphics === undefined && s.richEffects !== undefined) {
    s.graphics = s.richEffects ? 3 : 1;
  }
  if (s.graphics !== 1 && s.graphics !== 2 && s.graphics !== 3) s.graphics = 3;
  delete s.richEffects;
  return s;
}

/** everything except the terminal's own name */
type SyncedSettings = Omit<FlowSettings, 'deviceLabel'>;

function synced(s: FlowSettings): SyncedSettings {
  const { deviceLabel: _ignored, ...rest } = s;
  return rest;
}

class SettingsStore {
  current = $state<FlowSettings>(load());
  #timer: ReturnType<typeof setTimeout> | undefined;

  update(patch: Partial<FlowSettings>) {
    this.current = { ...this.current, ...patch };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.current));
    } catch {
      /* private mode */
    }
    configureSound({ enabled: this.current.soundEnabled, volume: this.current.soundVolume });
    this.#push();
  }

  /* Sliders fire continuously; one write per pixel of volume drag would be
     both slow and rude to the free tier. */
  #push() {
    if (!auth.user) return;
    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => {
      const userId = auth.user?.id;
      if (!userId) return;
      void supabase()
        .from('user_settings')
        .upsert(
          { user_id: userId, data: synced(this.current), updated_at: new Date().toISOString() },
          { onConflict: 'user_id' }
        );
    }, 600);
  }

  /** Called on sign-in: the signed-in user's settings win over the device's. */
  async pull() {
    if (!auth.user) return;
    const { data, error } = await supabase()
      .from('user_settings')
      .select('data')
      .eq('user_id', auth.user.id)
      .maybeSingle();

    if (error) return;
    if (!data) {
      // first sign-in on this account: seed it from what the device has
      this.#push();
      return;
    }
    this.current = { ...this.current, ...(data.data as Partial<FlowSettings>) };
    try {
      localStorage.setItem(KEY, JSON.stringify(this.current));
    } catch {
      /* private mode */
    }
    configureSound({ enabled: this.current.soundEnabled, volume: this.current.soundVolume });
  }
}

export const settings = new SettingsStore();
configureSound({ enabled: settings.current.soundEnabled, volume: settings.current.soundVolume });

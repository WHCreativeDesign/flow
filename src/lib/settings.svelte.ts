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
  /** full atmosphere drift, or a still surface on weaker hardware */
  richEffects: boolean;
  /** assistant surfaces on the glance page (summary, suggestions, ask) */
  aiEnabled: boolean;
}

const KEY = 'flow.settings';

const defaults: FlowSettings = {
  soundEnabled: true,
  soundVolume: 0.5,
  idleTimeoutSec: 90,
  deviceLabel: 'this terminal',
  use24hClock: false,
  richEffects: true,
  aiEnabled: true
};

function load(): FlowSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch {
    /* fresh start */
  }
  return { ...defaults };
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

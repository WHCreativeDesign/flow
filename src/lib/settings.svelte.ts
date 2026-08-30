import { configureSound } from './sound/engine';

/*
  System settings — the settings app writes here, the whole shell reads.
  Persisted to localStorage; applied immediately.
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

class SettingsStore {
  current = $state<FlowSettings>(load());

  update(patch: Partial<FlowSettings>) {
    this.current = { ...this.current, ...patch };
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

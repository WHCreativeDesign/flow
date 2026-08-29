import type { AppState, DeviceInfo, InstanceClient, Unsubscribe } from './InstanceClient';
import { detectDeviceClass } from './InstanceClient';

/*
  localStorage-backed instance client: app state survives reloads and, via
  the `storage` event, syncs live across tabs on the same machine — a small
  honest preview of the multi-device model. Blobs (photos, audio) live in
  IndexedDB, not here.
*/
export class StorageInstanceClient implements InstanceClient {
  #listeners = new Map<string, Set<(state: AppState) => void>>();
  #onStorage = (e: StorageEvent) => {
    if (!e.key?.startsWith('flow.app.') || e.newValue == null) return;
    const appId = e.key.slice('flow.app.'.length);
    try {
      const state = JSON.parse(e.newValue) as AppState;
      this.#listeners.get(appId)?.forEach((h) => h(state));
    } catch {
      /* ignore malformed */
    }
  };

  async connect() {
    window.addEventListener('storage', this.#onStorage);
  }

  async disconnect() {
    window.removeEventListener('storage', this.#onStorage);
  }

  async getAppState(appId: string) {
    try {
      const raw = localStorage.getItem(`flow.app.${appId}`);
      return raw ? (JSON.parse(raw) as AppState) : null;
    } catch {
      return null;
    }
  }

  async setAppState(appId: string, state: AppState) {
    try {
      localStorage.setItem(`flow.app.${appId}`, JSON.stringify(state));
    } catch {
      /* quota / private mode: state stays in-memory for the session */
    }
    this.#listeners.get(appId)?.forEach((h) => h(state));
  }

  onAppState(appId: string, handler: (state: AppState) => void): Unsubscribe {
    let set = this.#listeners.get(appId);
    if (!set) {
      set = new Set();
      this.#listeners.set(appId, set);
    }
    set.add(handler);
    return () => set.delete(handler);
  }

  async listDevices(): Promise<DeviceInfo[]> {
    return [
      {
        id: 'local',
        label: 'this terminal',
        deviceClass: detectDeviceClass(),
        lastSeen: new Date().toISOString()
      }
    ];
  }
}

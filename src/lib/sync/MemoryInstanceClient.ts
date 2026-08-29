import type { AppState, DeviceInfo, InstanceClient, Unsubscribe } from './InstanceClient';
import { detectDeviceClass } from './InstanceClient';

/*
  In-memory implementation: the v1 default until a real backend lands, and a
  reference for how small the interface surface is. State lives for the tab
  session only.
*/
export class MemoryInstanceClient implements InstanceClient {
  #store = new Map<string, AppState>();
  #listeners = new Map<string, Set<(state: AppState) => void>>();

  async connect() {}
  async disconnect() {}

  async getAppState(appId: string) {
    return this.#store.get(appId) ?? null;
  }

  async setAppState(appId: string, state: AppState) {
    this.#store.set(appId, state);
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

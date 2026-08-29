/*
  The sync layer boundary (handoff §5–6).

  One instance = one authoritative running system. Devices are independent
  views into shared state, not mirrors. The UI talks ONLY to this interface —
  never to a backend SDK directly — so the instance authority can change
  (hosted backend in v1, local Pi host in phase two) by swapping the
  implementation, never by rewriting the UI.
*/

export type DeviceClass = 'phone' | 'tablet' | 'desktop' | 'wall';

export interface DeviceInfo {
  id: string;
  label: string;
  deviceClass: DeviceClass;
  lastSeen: string;
}

export type AppState = Record<string, unknown>;

export type Unsubscribe = () => void;

export interface InstanceClient {
  /** connect this terminal to the authoritative instance */
  connect(): Promise<void>;
  disconnect(): Promise<void>;

  /** per-app state, JSONB-shaped */
  getAppState(appId: string): Promise<AppState | null>;
  setAppState(appId: string, state: AppState): Promise<void>;

  /** live updates from other terminals looking at the same instance */
  onAppState(appId: string, handler: (state: AppState) => void): Unsubscribe;

  /** terminals registered against this instance */
  listDevices(): Promise<DeviceInfo[]>;
}

export function detectDeviceClass(): DeviceClass {
  const w = Math.min(window.innerWidth, window.innerHeight);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  if (coarse && w < 500) return 'phone';
  if (coarse && w < 900) return 'tablet';
  if (window.innerWidth >= 1920 && coarse) return 'wall';
  return 'desktop';
}

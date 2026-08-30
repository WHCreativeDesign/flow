import type { RealtimeChannel } from '@supabase/supabase-js';
import type { AppState, DeviceInfo, InstanceClient, Unsubscribe } from './InstanceClient';
import { detectDeviceClass } from './InstanceClient';
import { supabase } from './supabase';
import { auth } from '../auth.svelte';

/*
  The instance, backed by Supabase and scoped to the signed-in user.

  This is the swap the InstanceClient boundary was written for: the apps still
  call getAppState/setAppState(appId) and know nothing about any of this. What
  changes is that state is now per-user and shared across every terminal that
  user signs in on, rather than per-browser.

  Writes are debounced. Several apps call setAppState on every keystroke
  (notes autosaves as you type), and one network round trip per character
  would be both slow and rude to the free tier. The local cache is updated
  synchronously so reads never wait on the flush.
*/

const FLUSH_MS = 600;

export class SupabaseInstanceClient implements InstanceClient {
  #cache = new Map<string, AppState>();
  #pending = new Map<string, AppState>();
  #timer: ReturnType<typeof setTimeout> | undefined;
  #listeners = new Map<string, Set<(state: AppState) => void>>();
  #channel: RealtimeChannel | null = null;
  #channelUser: string | null = null;

  async connect() {
    this.#subscribe();
  }

  async disconnect() {
    await this.#flush();
    if (this.#channel) {
      await supabase().removeChannel(this.#channel);
      this.#channel = null;
      this.#channelUser = null;
    }
  }

  /*
    One channel per signed-in user. Another terminal writing the same row
    pushes here, so two screens on the same account stay live without either
    polling. Rebuilt on user change; torn down entirely on sign-out.
  */
  #subscribe() {
    const userId = auth.user?.id ?? null;
    if (userId === this.#channelUser) return;

    if (this.#channel) {
      void supabase().removeChannel(this.#channel);
      this.#channel = null;
    }
    this.#channelUser = userId;
    if (!userId) return;

    this.#channel = supabase()
      .channel(`app_state:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_state', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as { app_id?: string; data?: AppState } | null;
          if (!row?.app_id) return;
          // our own write echoes back; the cache already matches, so skip it
          if (this.#pending.has(row.app_id)) return;
          const state = (row.data ?? {}) as AppState;
          this.#cache.set(row.app_id, state);
          this.#listeners.get(row.app_id)?.forEach((h) => h(state));
        }
      )
      .subscribe();
  }

  async getAppState(appId: string): Promise<AppState | null> {
    this.#subscribe();
    if (this.#pending.has(appId)) return this.#pending.get(appId)!;
    if (this.#cache.has(appId)) return this.#cache.get(appId)!;

    const userId = auth.user?.id;
    if (!userId) return null;

    const { data, error } = await supabase()
      .from('app_state')
      .select('data')
      .eq('user_id', userId)
      .eq('app_id', appId)
      .maybeSingle();

    if (error || !data) return null;
    const state = (data.data ?? {}) as AppState;
    this.#cache.set(appId, state);
    return state;
  }

  async setAppState(appId: string, state: AppState) {
    this.#cache.set(appId, state);
    this.#pending.set(appId, state);
    this.#listeners.get(appId)?.forEach((h) => h(state));

    clearTimeout(this.#timer);
    this.#timer = setTimeout(() => void this.#flush(), FLUSH_MS);
  }

  async #flush() {
    const userId = auth.user?.id;
    if (!userId || this.#pending.size === 0) {
      this.#pending.clear();
      return;
    }
    const rows = [...this.#pending.entries()].map(([app_id, data]) => ({
      user_id: userId,
      app_id,
      data,
      updated_at: new Date().toISOString()
    }));
    this.#pending.clear();
    await supabase().from('app_state').upsert(rows, { onConflict: 'user_id,app_id' });
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

  /** Drop every cached row — called on sign-out so the next user starts clean. */
  clear() {
    this.#cache.clear();
    this.#pending.clear();
    clearTimeout(this.#timer);
    this.#subscribe();
  }

  async listDevices(): Promise<DeviceInfo[]> {
    return [
      {
        id: 'local',
        label: auth.user?.displayName ?? 'this terminal',
        deviceClass: detectDeviceClass(),
        lastSeen: new Date().toISOString()
      }
    ];
  }
}

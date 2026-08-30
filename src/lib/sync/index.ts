import type { InstanceClient } from './InstanceClient';
import { SupabaseInstanceClient } from './SupabaseInstanceClient';

/*
  The single place the implementation is chosen. Everything else imports
  `instance` and stays ignorant of what backs it — which is exactly what made
  moving from localStorage to Supabase a swap here rather than a rewrite of
  every app. A phase-two Pi host slots in the same way.
*/
const client = new SupabaseInstanceClient();
export const instance: InstanceClient = client;
void instance.connect();

/* Sign-out has to drop cached state, or the next user briefly sees the last
   one's notes while their own rows load. */
export function clearInstanceCache() {
  client.clear();
}

export type { InstanceClient, AppState, DeviceInfo, DeviceClass } from './InstanceClient';

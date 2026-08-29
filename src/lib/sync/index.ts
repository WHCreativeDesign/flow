import type { InstanceClient } from './InstanceClient';
import { MemoryInstanceClient } from './MemoryInstanceClient';

/*
  The single place the implementation is chosen. Everything else imports
  `instance` and stays ignorant of what backs it. v1 backend (next pass)
  slots in here as a second implementation; a phase-two Pi host as a third
  (`LocalInstanceClient`) — a swap, never a rewrite.
*/
export const instance: InstanceClient = new MemoryInstanceClient();
export type { InstanceClient, AppState, DeviceInfo, DeviceClass } from './InstanceClient';

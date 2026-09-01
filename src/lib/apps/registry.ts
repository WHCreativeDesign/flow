import type { Component } from 'svelte';
import Assistant from './assistant/Assistant.svelte';
import Memory from './memory/Memory.svelte';
import QuickInfo from './quickinfo/QuickInfo.svelte';
import Settings from './settings/Settings.svelte';

/*
  The app registry. Icons are stroke paths on a 24×24 viewBox so the same
  path renders in the orb and inside the app.
*/
export interface FlowApp {
  id: string;
  label: string;
  /** inner SVG markup for a 24×24 stroke icon */
  icon: string;
  component: Component;
}

export const apps: FlowApp[] = [
  {
    id: 'assistant',
    label: 'flow',
    icon: '<path d="M12 3.6a8.4 8.4 0 0 0-7.2 12.8L3.6 20.4l4-1.2A8.4 8.4 0 1 0 12 3.6z"/><path d="M9 11h6M9 14h3.5"/>',
    component: Assistant
  },
  {
    id: 'memory',
    label: 'memory',
    icon: '<circle cx="6" cy="7" r="2.2"/><circle cx="18" cy="7" r="2.2"/><circle cx="12" cy="17" r="2.6"/><path d="M7.8 8.5 10.2 15M16.2 8.5 13.8 15M8.2 7h7.6"/>',
    component: Memory
  },
  {
    id: 'quickinfo',
    label: 'quick info',
    icon: '<path d="M13 3 5 13.5h5.5L10 21l8-11h-5.5L13 3z"/>',
    component: QuickInfo
  },
  {
    id: 'settings',
    label: 'settings',
    icon: '<circle cx="12" cy="12" r="3.1"/><path d="M12 3.2v2.1M12 18.7v2.1M20.8 12h-2.1M5.3 12H3.2M18.2 5.8l-1.5 1.5M7.3 16.7l-1.5 1.5M18.2 18.2l-1.5-1.5M7.3 7.3L5.8 5.8"/>',
    component: Settings
  }
];

export function appById(id: string): FlowApp | undefined {
  return apps.find((a) => a.id === id);
}

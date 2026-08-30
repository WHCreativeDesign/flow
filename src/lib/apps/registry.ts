import type { Component } from 'svelte';
import Camera from './camera/Camera.svelte';
import Notes from './notes/Notes.svelte';
import Messages from './messages/Messages.svelte';
import Weather from './weather/Weather.svelte';
import Music from './music/Music.svelte';
import Settings from './settings/Settings.svelte';
import Assistant from './assistant/Assistant.svelte';

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
    id: 'camera',
    label: 'camera',
    icon: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.4"/>',
    component: Camera
  },
  {
    id: 'notes',
    label: 'notes',
    icon: '<path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z"/><path d="M15 4v4h4M8.5 12h7M8.5 16h4.5"/>',
    component: Notes
  },
  {
    id: 'messages',
    label: 'messages',
    icon: '<path d="M4 5h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9.5L5 20v-4H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 9.5h8M8 12.5h5"/>',
    component: Messages
  },
  {
    id: 'weather',
    label: 'weather',
    icon: '<circle cx="8.5" cy="8" r="3.2"/><path d="M14 18a4 4 0 0 0 0-8 5.5 5.5 0 0 0-10.3 1.6A3.6 3.6 0 0 0 5 18h9z"/>',
    component: Weather
  },
  {
    id: 'music',
    label: 'music',
    icon: '<path d="M9 17V5.5l11-2V15"/><ellipse cx="6" cy="17.5" rx="3" ry="2.6"/><ellipse cx="17" cy="15.5" rx="3" ry="2.6"/>',
    component: Music
  },
  {
    id: 'assistant',
    label: 'flow',
    icon: '<path d="M12 3.6a8.4 8.4 0 0 0-7.2 12.8L3.6 20.4l4-1.2A8.4 8.4 0 1 0 12 3.6z"/><path d="M9 11h6M9 14h3.5"/>',
    component: Assistant
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

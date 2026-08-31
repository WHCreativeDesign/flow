/*
  The flowstore catalog — placeholder apps and games only.

  Nothing here installs anything real: tapping "get" flips a row in this
  person's own instance state (see FlowStore.svelte), it doesn't add an orb
  to the field. This is a design pass for the storefront shell, not a
  packaging system, and the app says so plainly rather than pretending.

  Icons are the same convention as the app registry: stroke paths on a
  24×24 viewBox, shared across a few items rather than one bespoke icon
  each, since these are stand-ins.
*/

export type ItemKind = 'app' | 'game';

export interface StoreItem {
  id: string;
  name: string;
  kind: ItemKind;
  category: string;
  tagline: string;
  blurb: string;
  rating: number;
  sizeMb: number;
  icon: string;
  /** [from, to] for this item's icon tile gradient */
  accent: [string, string];
  featured?: boolean;
}

const ICONS = {
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  calendar: '<path d="M4 5h16a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z"/><path d="M8 3v4M16 3v4M3 10h18"/>',
  brush: '<path d="M4 20c0-4 2-6 5-6a3 3 0 0 1 3 3c0 3-2 5-6 5-1 0-2-1-2-2z"/><path d="M9.5 13.5L18 5a2 2 0 0 1 3 3l-8.5 8.5"/>',
  leaf: '<path d="M20 4C10 4 4 10 4 18v2h2c8 0 14-6 14-16z"/><path d="M6 20c4-4 8-8 14-14"/>',
  feather: '<path d="M20 4c-8 1-14 6-16 16 10-2 15-8 16-16z"/><path d="M6 18l6-6"/>',
  cube: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M4 7.5L12 12l8-4.5M12 12v9"/>',
  gamepad: '<path d="M7 9h10a4 4 0 0 1 4 4v2a3 3 0 0 1-5.2 2L14 15h-4l-1.8 2A3 3 0 0 1 3 15v-2a4 4 0 0 1 4-4z"/><path d="M8.5 11v3M7 12.5h3M16 12h.01M18.5 14h.01"/>',
  dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1"/><circle cx="15" cy="9" r="1"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/><circle cx="12" cy="12" r="1"/>',
  rocket: '<path d="M12 3c3 2 5 6 5 10 0 2-1 3-1 3l-4 2-4-2s-1-1-1-3c0-4 2-8 5-10z"/><path d="M9 15l-3 5 4-1M15 15l3 5-4-1"/>',
  moon: '<path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5z"/>',
  bubbles: '<circle cx="9" cy="10" r="5"/><circle cx="16" cy="15" r="3.4"/>',
  shield: '<path d="M12 3l7 3v6c0 5-3 8-7 9-4-1-7-4-7-9V6z"/>'
};

export const CATALOG: StoreItem[] = [
  {
    id: 'ledger',
    name: 'Ledger',
    kind: 'app',
    category: 'Finance',
    tagline: 'A calm running total for a household budget.',
    blurb:
      'Ledger keeps one shared number honest: what came in, what went out, what is left this month. No categories to fight with, no bank login — you type the number, it remembers the trend.',
    rating: 4.6,
    sizeMb: 18,
    icon: ICONS.chart,
    accent: ['#f59e0b', '#ef4444']
  },
  {
    id: 'routines',
    name: 'Routines',
    kind: 'app',
    category: 'Productivity',
    tagline: 'Small recurring things, checked off together.',
    blurb:
      'Bins, plants, filters — the chores nobody quite owns. Routines puts them on a shared weekly board so "did anyone water it" has an answer instead of a shrug.',
    rating: 4.4,
    sizeMb: 12,
    icon: ICONS.calendar,
    accent: ['#22c55e', '#0ea5a4']
  },
  {
    id: 'palette',
    name: 'Palette',
    kind: 'app',
    category: 'Photo & Video',
    tagline: 'Light touch-ups for the camera roll.',
    blurb:
      'Crop, warm up, straighten — the four adjustments that fix most photos, in an editor with nothing else in it. Palette is deliberately not a full studio.',
    rating: 4.2,
    sizeMb: 34,
    icon: ICONS.brush,
    accent: ['#ec4899', '#a855f7']
  },
  {
    id: 'pulse',
    name: 'Pulse',
    kind: 'app',
    category: 'Health & Fitness',
    tagline: 'A gentle activity log, not a scoreboard.',
    blurb:
      'Log a walk, a stretch, a swim. Pulse shows a week at a glance and never a streak counter — the goal was always consistency, not guilt.',
    rating: 4.7,
    sizeMb: 15,
    icon: ICONS.leaf,
    accent: ['#06b6d4', '#3b82f6']
  },
  {
    id: 'wordsmith',
    name: 'Wordsmith',
    kind: 'app',
    category: 'Writing',
    tagline: 'A distraction-free page for longer writing.',
    blurb:
      'One page, one font, a word count in the corner. Wordsmith is for the writing that outgrows a note — letters, drafts, the thing you keep meaning to finish.',
    rating: 4.5,
    sizeMb: 9,
    icon: ICONS.feather,
    accent: ['#8b5cf6', '#5b6bf0']
  },
  {
    id: 'stackwell',
    name: 'Stackwell',
    kind: 'game',
    category: 'Puzzle',
    tagline: 'Falling blocks, patient pacing.',
    blurb:
      'The classic stacking puzzle, slowed down and softened — no sudden difficulty spike, just a clean board and a satisfying line clear.',
    rating: 4.8,
    sizeMb: 42,
    icon: ICONS.cube,
    accent: ['#f59e0b', '#ef4444'],
    featured: true
  },
  {
    id: 'driftline',
    name: 'Driftline',
    kind: 'game',
    category: 'Racing',
    tagline: 'One-touch drifting through hand-drawn tracks.',
    blurb:
      'Tap to drift, hold to brake. Driftline trades a full control scheme for one gesture and a dozen tracks that reward learning their curves by feel.',
    rating: 4.3,
    sizeMb: 96,
    icon: ICONS.gamepad,
    accent: ['#22c55e', '#0ea5a4']
  },
  {
    id: 'bubblewrap-pop',
    name: 'Bubblewrap Pop',
    kind: 'game',
    category: 'Casual',
    tagline: 'The satisfying part of packing a box, forever.',
    blurb:
      'No score, no timer, no ads waiting behind the next sheet. Just an endless sheet of bubblewrap and the small, specific pleasure of popping it.',
    rating: 4.9,
    sizeMb: 21,
    icon: ICONS.bubbles,
    accent: ['#ec4899', '#a855f7']
  },
  {
    id: 'nightshade-tactics',
    name: 'Nightshade Tactics',
    kind: 'game',
    category: 'Strategy',
    tagline: 'Turn-based skirmishes on a small hex board.',
    blurb:
      'Six units a side, a handful of terrain rules, and enough depth to matter without a rulebook. Every match fits on one screen and one coffee break.',
    rating: 4.5,
    sizeMb: 128,
    icon: ICONS.moon,
    accent: ['#06b6d4', '#3b82f6']
  },
  {
    id: 'quaddle',
    name: 'Quaddle',
    kind: 'game',
    category: 'Word',
    tagline: 'One four-letter word, once a day.',
    blurb:
      'A shorter, gentler daily word puzzle — four letters, four guesses, shareable but never smug about it.',
    rating: 4.6,
    sizeMb: 11,
    icon: ICONS.dice,
    accent: ['#8b5cf6', '#5b6bf0']
  },
  {
    id: 'skyhaul',
    name: 'Skyhaul',
    kind: 'game',
    category: 'Arcade',
    tagline: 'Deliver the cargo, mind the crosswind.',
    blurb:
      'A tilt-and-thrust flying arcade game about landing gently, not fast. Skyhaul rewards a soft touch on the controls over a heavy one.',
    rating: 4.1,
    sizeMb: 64,
    icon: ICONS.rocket,
    accent: ['#f59e0b', '#ef4444']
  },
  {
    id: 'emberfall',
    name: 'Emberfall',
    kind: 'game',
    category: 'Adventure',
    tagline: 'A short, warm story about a cooling star.',
    blurb:
      'A two-hour narrative adventure, told entirely through a village learning to live by lantern light. No combat, no fail state, just a story worth finishing.',
    rating: 4.7,
    sizeMb: 210,
    icon: ICONS.shield,
    accent: ['#22c55e', '#0ea5a4']
  }
];

export function itemById(id: string): StoreItem | undefined {
  return CATALOG.find((i) => i.id === id);
}

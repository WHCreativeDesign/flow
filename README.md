# flow

**a personal environment** · by [cloak](https://usecloak.org) · `flow.usecloak.org`

Not an operating system. Not an app. One live instance per user, accessible from any device on the network, rendering natively per device class rather than mirroring a screen.

## The model

A ship's computer: one authoritative instance; every screen is a terminal into it. Devices don't sync with each other — they all read and write one source of truth, so no cross-device conflict resolution exists or is needed.

## Three states, no others

There is no desktop, no windows, no z-index stacking. Any surface running flow is in exactly one of:

| state | behavior |
|---|---|
| **idle** | Ambient drift, clock visible. Wakes on any touch or motion. |
| **home** | Two pages you swipe between: **glance** (clock, notifications, weather, assistant placeholders) and **field** (the orbs). |
| **app** | Edge to edge, zero chrome. One universal edge-swipe-up returns home. |

Exiting is interactive. On touch the bottom edge is a gesture bar: drag up from it and the app follows your finger, shrinking back toward the orb it came from. Release decides the way a physical object would — by where the gesture is *heading*, not only where it stopped. A fast flick dismisses from an inch up; the same inch dragged slowly settles back. Velocity also sets the duration of the finish. Pointer devices get a **home** key in that same position instead — a drag is a poor gesture with a mouse, so the control changes but its place does not.

The signature gesture is **press → release → bloom**: an orb compresses under the finger (~0.83, fast ease-in), then expands from its exact origin point to fill the screen. Never slide, never cut, never cross-fade.

## The home pages

Home is a horizontal pager, and it lays out per device class rather than stretching one design across every screen. On a phone the glance is a single stack; from 900px it becomes a composition — the clock and weather hold a quiet left column while everything that is a *list* sits in a narrow right rail at reading width, denser rather than wider. Between those sizes the stack is capped to a comfortable measure so a tablet-width window never gets full-bleed bars.

Page one is a glance surface — a lock screen in spirit: the clock owns it, with real notifications read out of instance state (the latest message, the most recent note, capture and library counts) and live weather from the shared forecast source. Page two is the orb field.

The page you were on is held in shell state, so opening an app and coming back — or drifting out to idle and waking — returns you to the page you left, never one you did not choose.

Paging uses the same physics as the app dismissal: the surface tracks your finger with resistance at the ends of the run, and the release is decided by where the gesture is heading, not only where it stopped. Pages carry parallax as they move so the motion reads as depth rather than a flat slide.

**Assistant features are placeholders and are labelled as such in the UI.** The daily summary and the ask field are deliberately inert — a placeholder that looked live would misrepresent what the system does.

## Apps

All six orbs open working apps. State persists on the instance (localStorage for structured state, IndexedDB for blobs) through the `InstanceClient` boundary:

- **camera** — live viewfinder (`getUserMedia`), capture with flash, front/back flip, a persistent gallery with save/delete.
- **notes** — create, edit, autosave, delete; titles derived from the first line.
- **messages** — named threads with a composer and timestamped bubbles; honest about scope (streams live on this instance until multi-device sync lands).
- **weather** — live Open-Meteo data: current conditions, 24-hour strip, 7-day range bars; geolocation or place search; °C/°F.
- **music** — a local library (files persist in IndexedDB), playlist, seek, skip, and a live frequency visualizer.
- **settings** — system sounds and volume, idle timeout, 12/24-hour clock, terminal name; applied instantly and persisted.

## Sound

All cues are synthesized in `src/lib/sound/engine.ts` — no audio assets. The palette is Windows-7-Aero-inspired struck glass: two-partial bar voices (fundamental + 2.76× inharmonic partial) through a lowpass and a small generated hall, phrased in open fifths in A. Wake, press, bloom, home, send, shutter, toggle, and a gentle two-note refusal. Volume and mute live in settings.

## Performance contract

The atmosphere is the most expensive thing on screen, so it obeys hard rules: **no `filter`, no `mix-blend-mode`, and nothing animated except `transform`.** Filters and blend modes force the compositor to re-rasterize and read back full-screen layers every frame, forever, and the cost grows with whatever is drawn above them. Softness comes from gradient alpha falloff instead — it rasterizes once and is then only ever moved.

Anything occluded stops animating: while an app is open, home and the atmosphere below it hold their pixels and pause. Nothing a person can actually see stops breathing. Layer promotion (`will-change`) is treated as borrowed GPU memory and held only while something is genuinely moving.

Settings carries a **full atmosphere** switch; turning it off leaves a still surface for weaker hardware.

## Motion law

1. No linear easing anywhere.
2. Grow from the touch (`transform-origin` set at press time).
3. Everything has weight — press compresses, release overshoots, then settles.
4. Idle still breathes; nothing in flow is ever fully still.

Easings live in [`src/styles/tokens.css`](src/styles/tokens.css) and nowhere else.

## Development

```sh
npm install
npm run dev      # local dev server
npm run build    # static SPA bundle → dist/
npm run check    # svelte-check / typescript
```

## Architecture

- **Frontend** — Svelte 5 + Vite, fully static SPA. Hosted on GitHub Pages ([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)); `index.html` is copied to `404.html` at build time as the SPA fallback, and `public/CNAME` pins `flow.usecloak.org`.
- **Sync** — the UI talks only to the [`InstanceClient`](src/lib/sync/InstanceClient.ts) interface, never to a backend SDK directly. `StorageInstanceClient` is the current implementation — structured state in localStorage (surviving reloads and syncing live across tabs), blobs in IndexedDB; the v1 hosted backend arrives next pass as a second implementation, and a phase-two `LocalInstanceClient` moves authority to a Raspberry Pi — each a swap behind the interface, never a rewrite.

## Design

Light mode only. Blue hybrid of Liquid Glass and Frutiger Aero — depth from stacked atmosphere layers (bokeh at three blur depths, aurora, caustics, lens bloom, grain), never from a flat gradient. Depth comes from saturation, not darkness.

- Palette, type scale, and motion tokens: [`src/styles/tokens.css`](src/styles/tokens.css)
- Two materials, one physics: frosted glass frames, liquid is touched. Anything touchable is liquid; anything framing it is glass.
- Type: **Quicksand** (wordmark/headings), **Hanken Grotesk** (everything read at length).
- Branding is lowercase everywhere: `flow`, never `Flow`.
- `prefers-reduced-motion` is respected deliberately — drift stops, state changes become near-instant fades.

Visual source of truth: the brand prototype `flow-brand-v2.html` (kept outside this repo); the production shell reimplements its tested material values and easings.

## Build order (handoff §7)

- [x] 1. Repo + deploy pipeline (Pages, CNAME, SPA fallback)
- [x] 2. Design system (tokens, orb, glass/liquid materials, atmosphere)
- [x] 3. Three-state shell with the universal swipe layer
- [x] 4. Bloom transition (press → compress → expand-from-origin)
- [ ] 5. Backend setup — next pass (schema, RLS on every table, auth; verify a second browser cannot read the first user's rows)
- [ ] 6. Instance + sync wiring in-app (auth UI, backend `InstanceClient` implementation, `connect()` on boot)
- [ ] 7. Multi-device: Realtime shared state, adaptive rendering per device class
- [ ] 8. Pi migration: `LocalInstanceClient`, mDNS `flow.local`, tunnel for off-network
- [ ] 9. Offline transports: Bluetooth → audio → QR burst
- [x] 10. Apps — camera, notes, messages, weather, music, settings all functional on local state

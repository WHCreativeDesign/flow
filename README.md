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

Every way out collapses. The home key and Escape run the same reverse bloom as the drag — the card shrinks back into the orb it grew from, casting a shadow the whole way down — just on a fixed duration, since a click carries no velocity to read. Nothing in flow cuts.

The signature gesture is **press → release → bloom**: an orb compresses under the finger (~0.83, fast ease-in), then expands from its exact origin point to fill the screen. Never slide, never cut, never cross-fade.

## The home pages

Home is a horizontal pager, and it lays out per device class rather than stretching one design across every screen. On a phone the glance is a single stack; from 900px it becomes a composition — the clock and weather hold a quiet left column while everything that is a *list* sits in a narrow right rail at reading width, denser rather than wider. Between those sizes the stack is capped to a comfortable measure so a tablet-width window never gets full-bleed bars.

Page one is a glance surface — a lock screen in spirit: the clock owns it, with real notifications read out of instance state (the latest message, the most recent note, capture and library counts) and live weather from the shared forecast source. Page two is the orb field.

The page you were on is held in shell state, so opening an app and coming back — or drifting out to idle and waking — returns you to the page you left, never one you did not choose.

Paging uses the same physics as the app dismissal: the surface tracks your finger with resistance at the ends of the run, and the release is decided by where the gesture is heading, not only where it stopped. Pages carry parallax as they move so the motion reads as depth rather than a flat slide.

Notifications can be cleared: **swipe a card away on touch, or use the clear target that appears on hover with a pointer.** A cleared card records what it was *about*, so it stays gone until the underlying thing actually changes — a newer message or another capture brings it back, re-reading the same state does not.

The glance's daily summary, suggestion chips and ask field are live. The summary is generated once a day per user from what is actually on the glance — the weather, what is waiting, the time — and cached on the instance, because the glance re-renders on every clock tick and asking a model each time would burn a free tier before lunch. Chips fill the ask field; asking hands the question to the assistant app, since a lock screen is the wrong place to read three paragraphs. Settings can switch the whole surface off.

## Users

flow is one instance per household, not per person. The terminal opens on a
picker — **User 1**, **User 2**, whoever else exists — and nothing behind it
belongs to anyone until someone signs in.

Users are deliberately **not** Supabase Auth. These are people sharing a screen
in a kitchen, identified by a short password, not by email and a confirmation
link. So flow keeps its own `app_users` table: passwords are bcrypt hashes made
by `pgcrypto` inside Postgres and never leave it, the browser only ever holds an
opaque session token, and both credential tables have RLS on with **no policies
at all** — the publishable key cannot read a single row of either. Every
credential path goes through a `SECURITY DEFINER` function instead.

Everything a person owns follows them to any terminal they sign in on: notes,
message threads, assistant chat history, the camera gallery index, the music
playlist, weather places, cleared glance cards, and their settings. One policy
shape does the work — `user_id = current_user_id()`, where `current_user_id()`
resolves the `x-flow-token` header against live sessions. A terminal with no
session sees nothing.

The **admin** is a hidden account that never appears on the picker. It is
reached by tapping the `flow` mark at the bottom of settings five times and
entering its password; unlocking it does not change who is signed in — you stay
yourself and additionally hold an admin token, held in memory only, that dies
with the tab. From there: add users, rename them, change passwords, remove them.
Removing a user deletes everything of theirs, by cascade.

## The assistant

The assistant is real now. It was a labelled placeholder before, because a
placeholder that looked live would misrepresent what the system does.

Answers come from **Groq** free tier, falling back to **Gemini 3.6 Flash**
when Groq fails or is rate-limited. Chat history is per-user and lives in
Supabase, so a conversation started on the phone continues on the wall.

The conversation is laid out the way ChatGPT and Claude lay one out, because
that shape has a reason behind it: a reply is a document, not a chat bubble.
Bubbles were built for short turns between equals — they cap the line length,
centre the eye on the wrong axis, and make three paragraphs look like shouting.
So the question sits in a small container on the right and the answer runs full
width as plain text, one orb marking who is speaking, measure capped for
reading.

Replies arrive **word by word, paced by the text itself**: a word costs a beat,
a comma buys a short rest, a full stop a longer one, a paragraph break longer
still. That is what makes it read as writing rather than as a progress bar —
prose has rhythm, and revealing it evenly throws the rhythm away. One
`requestAnimationFrame` loop against real elapsed time drives it, and once a
message is fully out its per-word spans are thrown away for a single text node.
History never re-types itself.

The waiting state is a **pulsing orb**, not three dots: three layers that are
rasterised once and thereafter only transformed, so it can sit on screen
indefinitely without costing a frame budget. It is the same mark that labels
the finished reply, so waiting and answered are visibly the same voice.

## Memory

The assistant can write things down about you between conversations. When you
state a durable fact — a name, a preference, a routine — it emits a
`<remember>` tag, which the Edge Function strips out of what you see and writes
to a per-user `memories` table; later conversations get those facts in their
system prompt. A tag contract rather than native tool-calling, because that
works identically on Groq and Gemini and would not break the moment the
fallback fires.

Memory is **shown, not silent**. A reply that stored something says so
underneath, and the assistant app lists everything it knows about you with a
delete on each line and a *forget all*. Being remembered without being told is
the part of assistant memory people object to. Facts are stored one per row
rather than as a rolling summary precisely so they can be listed and removed
one at a time.

Neither provider key is in this repository or in the built bundle, and neither
can be: flow is a static build on GitHub Pages, so anything it ships is
readable by anyone who opens it. The keys live as secrets on the `ai` Edge
Function, which authenticates the caller's flow session token before it will
talk to a provider. Model ids are read from env with defaults, so a retired
model is a secret change rather than a redeploy — and when every provider
fails, the function returns *what* failed rather than collapsing it into one
opaque "unavailable".

## Apps

All seven orbs open working apps. State persists per-user in Supabase through the `InstanceClient` boundary — the swap that boundary was written for. Photo and audio blobs stay in IndexedDB on the device:

- **camera** — live viewfinder (`getUserMedia`), capture with flash, front/back flip, a persistent gallery with save/delete.
- **notes** — create, edit, autosave, delete; titles derived from the first line.
- **messages** — named threads with a composer and timestamped bubbles; honest about scope (streams live on this instance until multi-device sync lands).
- **weather** — live Open-Meteo data: current conditions, 24-hour strip, 7-day range bars; geolocation or place search; °C/°F.
- **music** — a local library (files persist in IndexedDB), playlist, seek, skip, and a live frequency visualizer.
- **assistant** — Groq-backed chat with Gemini fallback; per-user history that follows you between terminals.
- **settings** — system sounds and volume, idle timeout, 12/24-hour clock, terminal name; applied instantly and persisted. Also sign-out, an assistant key check, and the hidden admin panel.

## Sound

All cues are synthesized in `src/lib/sound/engine.ts` — no audio assets. The reference is the PS5 system UI: **air first, tone second.** Most of the character lives in a bandpass-filtered noise sweep rather than in pitch, and where a pitch does appear, a cue plays exactly one of them. Never two.

That last rule is the whole design. Two notes in sequence read as a *tune*, and a tune on every app launch turns the launch into an announcement. So opening is one gesture — weight, air rising, one tone settling into it — and closing is that same gesture inverted. Not a different melody, the same motion backwards.

The layered voice underneath is unchanged: a sine **body** with a soft attack, an octave-below **weight** so the tone has a floor, a twelfth-above **presence** so it isn't dull, a **breath** of bandpassed noise under the attack only, and a short damped **room** sent lightly. On top of it sit `sweep()`, the noise whoosh that carries the palette, and `sub()`, a slow low swell for weight.

Two cues are exempt and keep their voice exactly, because they are the two the system is recognised by:

- **wake** — the startup sound. This is the thing coming to life, and the palette around it is anonymous on purpose so this one still lands as an arrival.
- **page** — the glance ↔ field turn.

Every node a cue creates is torn down when its voice ends — a cue that leaves nodes on the bus keeps them in the render graph forever, and the graph is processed every quantum. Volume and mute live in settings.

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

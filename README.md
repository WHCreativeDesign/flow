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
| **home** | Two pages you swipe between: **glance** (clock, notifications, assistant) and **field** (the orbs). |
| **app** | Edge to edge, zero chrome. A **home** button at the bottom edge returns home. |

Exiting is a tap, not a gesture. A **home** button sits at the bottom edge of every app — one control, one position, on every device. It used to be a hidden swipe-up bar on touch (drag up and the app followed your finger, released the way a physical object would based on where the gesture was heading) and a button only for a mouse, on the theory that a drag is a poor gesture with a mouse anyway. In practice a hidden gesture is a poor gesture full stop — undiscoverable, and a broken-feeling tap target the moment a finger drags instead of taps — so touch gets the same visible button pointer devices already had. Mouse can still drag-dismiss the same zone under the button, a quieter leftover of the original gesture, but nothing depends on it being discovered.

Every way out collapses. The home button and Escape run the same reverse bloom the old drag did — the card shrinks back into the orb it grew from, casting a shadow the whole way down — just on a fixed duration, since a click carries no velocity to read. Nothing in flow cuts.

The signature gesture is **press → release → bloom**: an orb compresses under the finger (~0.83, fast ease-in), then expands from its exact origin point to fill the screen. Never slide, never cut, never cross-fade.

## The home pages

Home is a horizontal pager, and it lays out per device class rather than stretching one design across every screen. On a phone the glance is a single stack; from 900px it becomes a composition — the clock holds a quiet left column while everything that is a *list* sits in a narrow right rail at reading width, denser rather than wider. Between those sizes the stack is capped to a comfortable measure so a tablet-width window never gets full-bleed bars.

Page one is a glance surface — a lock screen in spirit: the clock owns it, with real notifications read out of instance state (due reminders) and the assistant's daily summary. Page two is the orb field.

The page you were on is held in shell state, so opening an app and coming back — or drifting out to idle and waking — returns you to the page you left, never one you did not choose.

Paging uses the same physics as the app dismissal: the surface tracks your finger with resistance at the ends of the run, and the release is decided by where the gesture is heading, not only where it stopped. Pages carry parallax as they move so the motion reads as depth rather than a flat slide.

Notifications can be cleared: **swipe a card away on touch, or use the clear target that appears on hover with a pointer.** A cleared card records what it was *about*, so it stays gone until the underlying thing actually changes — a due reminder firing again does, re-reading the same state does not.

The glance's daily summary, suggestion chips and ask field are live. The summary is generated once a day per user from what is actually on the glance — what is waiting, the time — and cached on the instance, because the glance re-renders on every clock tick and asking a model each time would burn a free tier before lunch. Chips fill the ask field; asking hands the question to the assistant app, since a lock screen is the wrong place to read three paragraphs. Settings can switch the whole surface off.

## Users

flow is one instance per household, not per person. The terminal opens on a
plain username-and-password form, and nothing behind it belongs to anyone
until someone signs in. It is a form, not a picker: the instance used to show
a grid of every account before anyone typed anything, which both exposed who
has an account here to a glance at the screen and reduced "password" to a
short numeric passcode entered after a tap. Typing both fields is the
ordinary shape of signing in anywhere else, and it is what makes a real
minimum length mean something.

Users are deliberately **not** Supabase Auth. These are people sharing a screen
in a kitchen, identified by a username and a password — minimum 8 characters,
enforced server-side when a password is set — not by email and a confirmation
link. So flow keeps its own `app_users` table: passwords are bcrypt hashes made
by `pgcrypto` inside Postgres and never leave it, the browser only ever holds an
opaque session token, and both credential tables have RLS on with **no policies
at all** — the publishable key cannot read a single row of either. Every
credential path goes through a `SECURITY DEFINER` function instead. Login
itself compares a password hash even on an unknown username, so a wrong
username and a wrong password take the same time and cannot be told apart.

Everything a person owns follows them to any terminal they sign in on:
assistant chat history, their memory graph, cleared glance cards, and their
settings. One policy shape does the work — `user_id = current_user_id()`,
where `current_user_id()` resolves the `x-flow-token` header against live
sessions. A terminal with no session sees nothing.

The **admin** is a hidden account with no sign-in form of its own. It is
reached by tapping the `flow` mark at the bottom of settings five times and
entering its password; unlocking it does not change who is signed in — you stay
yourself and additionally hold an admin token, held in memory only, that dies
with the tab. From there: add users, rename them, change passwords, remove them.
Removing a user deletes everything of theirs, by cascade.

## The assistant

The assistant is real now. It was a labelled placeholder before, because a
placeholder that looked live would misrepresent what the system does.

Answers come from **Groq** free tier, falling back to **NVIDIA NIM**, falling
back to **Gemini** — three independent providers, so one running out of quota
is a fallback, not an outage. NVIDIA speaks the same OpenAI-compatible
chat-completions shape Groq does, so it reuses that code path rather than
adding a fourth one; it carries no vision support here, so an attached photo
skips it and goes straight to Groq or Gemini.

Every default model is deliberately on the **light end** of its provider's
lineup — Groq's 20B `gpt-oss-20b` rather than a 70B, NVIDIA's 8B Nemotron Nano
rather than the 49B Super it replaced, Gemini's flash-lite rather than plain
flash. A free tier's request-and-token ceiling scales with model size, so the
small model is what keeps three keys from three providers actually usable
instead of exhausted by the second question — which is the literal problem
the previous defaults hit: within a day, Groq's model had been deprecated,
NVIDIA's had hit end-of-life, and Gemini's plain-flash quota was already
gone. Model IDs are env-overridable (`GROQ_MODEL`, `GROQ_VISION_MODEL`,
`NVIDIA_MODEL`, `GEMINI_MODEL`) precisely because a provider retiring a model
is routine, not exceptional, on a free tier.

Two of these three are reasoning-tuned models, and both leak that reasoning
somewhere if left on defaults. Groq's `gpt-oss` line returns chain-of-thought
in a separate `reasoning` field — `include_reasoning:false` on the request
keeps it out, so `content` is reliably the whole answer. NVIDIA's Nemotron
Nano has no request-level toggle at all: it reads the literal phrase
"detailed thinking off" out of its own system message and changes behaviour
on it, so that phrase is appended to the system prompt on every NVIDIA call.

Each provider holds a pool of **up to five keys**, tried in order — one key
is one point of failure, and a 429 on one key says nothing about the next. A
key that returns 401 is disabled on the spot; a 429 is recorded but never
disables, because quota comes back. Keys live in a table with RLS on and no
policies and no grants, so the browser cannot read a single row; the admin
panel lists a masked tail and nothing else.

Replies **stream**, token by token, from all three providers. Streaming is
opt-in per request: this function deploys independently of the app, so an
older build in the wild would call `res.json()` on an event stream — defaulting
to JSON keeps every deploy backward compatible. Chat history is per-user and
lives in Supabase, so a conversation started on the phone continues on the
wall.

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

The assistant can write things down about you between conversations, and you
can see and edit exactly what it wrote. When you state a durable fact — a
name, a preference, a routine — it emits a `<remember>` tag, which the Edge
Function strips out of what you see and writes as a titled markdown node into
a per-user `memory_nodes` table; later conversations get the most recently
touched nodes in their system prompt. A tag contract rather than native
tool-calling, because that works identically across all three providers and
would not break the moment the fallback fires.

Memory is **shown, not silent**. A reply that stored something says so
underneath, in-line in the chat. The **memory** app is where it actually
lives: every node is a small markdown document — a title and a body you can
rewrite by hand — rendered as an Obsidian-style node graph on a hand-rolled
`<canvas>` force-directed layout (no charting library; flow's only real
dependency is `@supabase/supabase-js`). Nodes repel each other, an optional
link between two nodes pulls them toward a rest distance, a weak centering
force keeps the graph on-screen, and the whole simulation stops redrawing
once it settles rather than looping forever. Drag a node to reposition it
(the position persists), tap one to edit its title and body or delete it,
and toggle **link** in the header to connect two nodes by tapping them in
turn.

Being remembered without being told is the part of assistant memory people
object to, which is why it is surfaced twice: once as the quiet toast in
chat, and permanently as an editable node you can find, correct, or delete
whenever you want.

Neither provider key is in this repository or in the built bundle, and neither
can be: flow is a static build on GitHub Pages, so anything it ships is
readable by anyone who opens it. The keys live as secrets on the `ai` Edge
Function, which authenticates the caller's flow session token before it will
talk to a provider. Model ids are read from env with defaults, so a retired
model is a secret change rather than a redeploy — and when every provider
fails, the function returns *what* failed rather than collapsing it into one
opaque "unavailable".

## Actions

The assistant can act on your own data, not just describe it: change a
setting, or set or clear a reminder. It emits a small closed vocabulary of
tags to do it — `<setting key="soundVolume" value="0.3"/>`,
`<reminder-create at="...">...</reminder-create>`, and so on — the same
convention `<remember>` already used for memory, extended rather than
replaced. That choice over real provider tool-calling is deliberate: a fixed
vocabulary behaves identically across Groq, NVIDIA and Gemini and survives
the fallback chain exactly like `<remember>` does, where three different
`tools`/`tool_calls` implementations would not.

The Edge Function's only job with an action tag is to recognise it, strip it
from what you see, and hand it to the client as structured data. Every action
actually **executes in the browser**, through the exact same
`settings.update()` / `supabase()` calls the real UI already uses — nothing
here has more reach than a person tapping a switch already has, because it
*is* that same call. Actions auto-execute and report what happened
afterward, the same trust model memory uses: a setting is trivially
reversible, so asking first would slow down the common case for a cost that
isn't there.

The vocabulary is closed, and that closedness is the actual boundary, not
this code's care: there is no admin action, nothing resembling one, and no
action ever writes anything but the signed-in person's own data. A request
for a real other-user action has nothing to bind to, on either side — the
Edge Function never taught the model a tag for it, and the client's own
executor ignores any tag name it doesn't recognise even if one somehow
arrived. Every self-closing and block tag pattern, the streaming hold-back
that keeps raw markup off the screen mid-reply, and the whitespace left
behind when two tags sit on one line are covered by a standalone test file
run before each deploy — this is exactly the kind of regex surface a
plausible-looking fix can quietly break.

**`reminder-create`** needs an absolute ISO-8601 timestamp, computed by the
model itself from the "Now" line already in its context, because there is no
other way to ground "in 20 minutes" in a stateless request. A due reminder surfaces on the glance as a notification
card, dismissed through the same `collect()`/`clearNote()` mechanism the
glance uses generally — no separate "fired" flag, because a reminder's own
id as its signature already means a dismissed one never comes back.

## What the assistant can see

The assistant reads the signed-in person's own reminders and settings on
every question, plus the memory graph's most recently touched nodes (see
[Memory](#memory) above). Not a cached digest — assembled fresh, because the
point is that it knows what is true now. Reminders carry their real id in
the listing, which is what lets a `reminder-delete` action reference an
existing one exactly rather than needing to invent one.

Everything it sees stops at "cannot reach anyone else's." Not because the
code is careful but because the layer underneath it cannot return another
user's rows — reminders and settings go through the same RLS-scoped client
the UI uses.

Photos are the one thing it cannot see *into* by default — the bytes are
only sent when you attach one, from chat's composer or from quick info. The
context tells it so explicitly, so it says a photo needs attaching rather
than inventing what is in it. The instance dump is fenced and labelled as
reference material, never instruction: a note that says "ignore your
instructions" is something to answer about, not to obey.

## Apps

The orb field is deliberately narrow: four apps, all built around the
assistant. State persists per-user in Supabase through the `InstanceClient`
boundary or directly via RLS-scoped tables, depending on the app:

- **flow** (chat) — Groq-backed chat with NVIDIA and Gemini fallback; per-user history that follows you between terminals. See [The assistant](#the-assistant).
- **memory** — the node-graph viewer/editor described in [Memory](#memory) above: every fact the assistant has kept is a markdown node you can drag, edit, link, or delete on a hand-rolled canvas graph.
- **quick info** — the fast lane into memory. A line of text and/or a photo, no chat and no history, goes straight to the assistant, which turns it into one markdown memory node and hands back a short confirmation rather than a conversation. Voice capture is deliberately not here yet — nothing in the repo does audio input, so this ships text and image first, with an easy path to add a `MediaRecorder` step later without changing the shape of what gets sent.
- **settings** — system sounds and volume, an optional ambient menu-music bed, idle timeout, 12/24-hour clock, terminal name, the assistant-on-glance toggle, and the three-stage graphics tier (see [Performance contract](#performance-contract)); applied instantly and persisted. Also sign-out, an assistant provider-key check, and the hidden admin panel.

An earlier version of flow carried camera, notes, messages, weather, music,
and a flowstore shell as separate orbs. They were cut to focus the instance
on the assistant and its memory rather than removed piecemeal: their
component files, Supabase tables, and IndexedDB stores are still on disk,
untouched and unreferenced by the app — nothing was deleted, they are simply
no longer part of the running system.

## Inside an app

Apps have their own navigation — the chat list to one conversation, for instance — and those pages tween rather than cut, through one shared `Pane`. Both panes are mounted during the change so the outgoing one can actually leave. Depth sets the direction: going deeper, the new pane rises from behind and the old recedes; coming back, exactly reversed, which is what makes back read as back rather than as another forward.

## Sound

All cues are synthesized in `src/lib/sound/engine.ts` — no audio assets. The reference is the PS5 system UI: **air first, tone second.** Most of the character lives in a bandpass-filtered noise sweep rather than in pitch, and where a pitch does appear, a cue plays exactly one of them. Never two.

That last rule is the whole design. Two notes in sequence read as a *tune*, and a tune on every app launch turns the launch into an announcement. So opening is one gesture — weight, air rising, one tone settling into it — and closing is that same gesture inverted. Not a different melody, the same motion backwards.

The layered voice underneath is unchanged: a sine **body** with a soft attack, an octave-below **weight** so the tone has a floor, a twelfth-above **presence** so it isn't dull, a **breath** of bandpassed noise under the attack only, and a short damped **room** sent lightly. On top of it sit `sweep()`, the noise whoosh that carries the palette, and `sub()`, a slow low swell for weight.

Two cues are exempt and keep their voice exactly, because they are the two the system is recognised by:

- **wake** — the startup sound. This is the thing coming to life, and the palette around it is anonymous on purpose so this one still lands as an arrival.
- **page** — the glance ↔ field turn.

Every node a cue creates is torn down when its voice ends — a cue that leaves nodes on the bus keeps them in the render graph forever, and the graph is processed every quantum. Volume and mute live in settings.

### Menu music

An optional ambient bed plays on the home pages, in the style of the Wii U menu: three detuned triangles under a lowpass whose corner breathes on its own LFO, gliding through a slow I–V–vi–IV chord progression in D — D major, A major, B minor, G major, a five-second glide between roughly seventeen-second holds — with sparse plucked chimes dropped over it from the same D pentatonic every cue above uses. That chord skeleton is a common, unownable harmonic pattern, not anyone's melody, so the whole thing is an original generative composition rather than a transcription of any actual soundtrack — closer to wind chimes drifting over a slowly changing chord than a fixed tune, so there is no melody to recognise.

It is **off by default**, unlike every other sound setting here, because background music playing continuously on a shared household terminal is a bigger ask than a UI blip firing once. `settings.musicEnabled` toggles it from the sound panel.

It runs on its own gain bus straight to the destination rather than through the shared `master` bus every cue plays through: muting UI sound and muting ambient music are different requests, so they stay two independent controls instead of one master switch pretending to be both. `startMenuMusic()`/`stopMenuMusic()` in `engine.ts` fade it in and out and are idempotent, driven from `App.svelte` by `shell.state === 'home' && settings.musicEnabled`, paused whenever the tab is hidden — the same occlusion rule everything else on the atmosphere obeys.

## Performance contract

The atmosphere is the most expensive thing on screen, so it obeys hard rules: **no `filter`, no `mix-blend-mode`, and nothing animated except `transform`.** Filters and blend modes force the compositor to re-rasterize and read back full-screen layers every frame, forever, and the cost grows with whatever is drawn above them. Softness comes from gradient alpha falloff instead — it rasterizes once and is then only ever moved.

Anything occluded stops animating: while an app is open, home and the atmosphere below it hold their pixels and pause. Nothing a person can actually see stops breathing. Layer promotion (`will-change`) is treated as borrowed GPU memory and held only while something is genuinely moving.

Settings carries a **three-stage graphics tier**, and the split between the stages is deliberate:

| tier | what changes |
|---|---|
| **1 · low** | Everything tier 2 drops, plus the things that actually strain a weak GPU or a software compositor: no live `backdrop-filter` blur (every glass panel falls back to a solid gradient), an orb's press shadow stops interpolating on hover/press, a chat bubble fades in by opacity instead of an animated `filter: blur()`, and dragging an open app skips animating its corner radius entirely — that write happens on every pointermove of the gesture, far more often than anything else in the app. Built for a Chromebook or any other integrated-GPU device where these were the actual bottleneck. |
| **2 · normal** | Same animations, same gradients. No idle movement anywhere, no shadows, far fewer drawn objects. (This was tier 1's job before the tiers were renumbered — it turned out to be what most people wanted by default, so it moved to "normal" and "low" was freed up for hardware that needs more than a flat look removed.) |
| **3 · full** | Every layer, every drift. |

Tiers 2 and 3 keep transitions **identical** to each other on purpose. A cheap device should still feel like the same system answering you; what it should not do is spend a battery animating things nobody asked to move. So what tier 2 removes is the work that never ends — an idle loop pins a promoted layer and re-composites forever — and never the motion you triggered. Gradients stay untouched at both: they rasterise once and are then only moved, so they cost almost nothing, and they are what makes flow look like flow.

Tier 1 changes a few things you actually triggered too, but only where dropping them is unambiguously cheaper. It does **not** touch app open, close, or a drag's release — all three keep animating `border-radius` smoothly at every tier, on purpose. `border-radius` is paid for by an element's full layout size, not by whatever scale it happens to be drawn at, so snapping it straight to its target value while the app is still near full size is one large clip-mask repaint rather than many small ones — a version of this shipped briefly and showed up as a visibly glitched, flashing frame on real hardware, which is worse than the interpolation it was trying to avoid. The lesson stuck: on this element, spreading the cost beats concentrating it.

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
- [x] 10. Apps — chat, memory graph, quick info, settings all functional on local state

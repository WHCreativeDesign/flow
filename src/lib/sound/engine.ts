/*
  flow sound design — synthesized, no assets.

  The reference is the PS5 system UI: air first, tone second. Cues are built
  from filtered-noise sweeps with a soft low swell under them, and where a
  pitch appears at all it is a single clean sine voice — never a melodic
  figure. A two-note cue reads as a jingle ("dun-dun") and turns every app
  launch into an announcement; one gesture of air reads as the surface
  moving. Close is the same gesture inverted, not a different tune.

  Two reverb buses, deliberately:
    room — 0.5s, quiet. The PS5 palette lives here: intimate, close, dry.
    hall — 1.4s, airier. Only the `send` chime uses it, so that cue keeps
           exactly the character it had before this palette landed.
*/

type CueName =
  | 'wake'
  | 'press'
  | 'open'
  | 'home'
  | 'tap'
  | 'page'
  | 'toggle'
  | 'send'
  | 'shutter'
  | 'deny';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hall: ConvolverNode | null = null;
let room: ConvolverNode | null = null;

let enabled = true;
let volume = 0.5;

export function configureSound(opts: { enabled: boolean; volume: number }) {
  enabled = opts.enabled;
  volume = opts.volume;
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.02);
}

/* Exponentially decaying noise. `seconds` sets the tail, `tilt` how fast it dies. */
function makeImpulse(ac: AudioContext, seconds: number, tilt: number): AudioBuffer {
  const len = Math.floor(ac.sampleRate * seconds);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, tilt) * 0.5;
    }
  }
  return buf;
}

function ensure(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume * 0.9;
    master.connect(ctx.destination);

    // the old hall, kept intact for `send`
    hall = ctx.createConvolver();
    hall.buffer = makeImpulse(ctx, 1.4, 2.8);
    const wetHall = ctx.createGain();
    wetHall.gain.value = 0.35;
    hall.connect(wetHall).connect(ctx.destination);

    // the close room the PS5 palette sits in
    room = ctx.createConvolver();
    room.buffer = makeImpulse(ctx, 0.5, 4.2);
    const wetRoom = ctx.createGain();
    wetRoom.gain.value = 0.16;
    room.connect(wetRoom).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/*
  Every node created by a voice is torn down when that voice finishes. A cue
  that leaves nodes attached to a bus keeps them in the render graph forever,
  and the graph — processed every quantum — grows with each sound the system
  plays.
*/

/*
  One struck-glass voice: fundamental plus the inharmonic 2.76x partial of a
  struck bar. Only `send` uses this now; it is what gives that cue its bell.
*/
function glass(
  ac: AudioContext,
  freq: number,
  at: number,
  { gain = 0.18, decay = 0.9, bright = 3800 }: { gain?: number; decay?: number; bright?: number } = {}
) {
  const out = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = bright;
  lp.Q.value = 0.4;

  out.connect(lp);
  lp.connect(master!);
  lp.connect(hall!);

  const partials: Array<[number, number]> = [
    [1, 1],
    [2.76, 0.28],
    [5.4, 0.06]
  ];
  const voices: OscillatorNode[] = [];
  for (const [ratio, amp] of partials) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = freq * ratio;
    // struck attack: 4ms in, exponential ring-down
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * amp, at + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * (ratio === 1 ? 1 : 0.45));
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.1);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    voices.push(o);
  }
  // the fundamental rings longest, so its end is the voice's end
  voices[0].addEventListener('ended', () => {
    out.disconnect();
    lp.disconnect();
  });
}

/*
  The PS5 tone: pure sine with two quiet harmonics — harmonic, not inharmonic,
  so it reads as soft and synthetic rather than as a struck bell. Slower attack
  than `glass` (6ms) so it swells rather than strikes. `bend` glides the pitch
  by that ratio across the decay, which is what gives the nav blips their
  slight give.
*/
function soft(
  ac: AudioContext,
  freq: number,
  at: number,
  {
    gain = 0.12,
    decay = 0.5,
    bright = 2600,
    bend = 1
  }: { gain?: number; decay?: number; bright?: number; bend?: number } = {}
) {
  const out = ac.createGain();
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = bright;
  lp.Q.value = 0.3;

  out.connect(lp);
  lp.connect(master!);
  lp.connect(room!);

  const partials: Array<[number, number]> = [
    [1, 1],
    [2, 0.16],
    [3, 0.05]
  ];
  const voices: OscillatorNode[] = [];
  for (const [ratio, amp] of partials) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * ratio, at);
    if (bend !== 1) o.frequency.exponentialRampToValueAtTime(freq * ratio * bend, at + decay * 0.6);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain * amp, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + decay * (ratio === 1 ? 1 : 0.6));
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + decay + 0.08);
    o.onended = () => {
      o.disconnect();
      g.disconnect();
    };
    voices.push(o);
  }
  voices[0].addEventListener('ended', () => {
    out.disconnect();
    lp.disconnect();
  });
}

/*
  The signature: noise through a bandpass whose centre glides from `from` to
  `to`. Up is something opening, down is something leaving. The amplitude
  swells in over the first third and decays out — a hard edge here would click.
*/
function sweep(
  ac: AudioContext,
  at: number,
  {
    from = 420,
    to = 2800,
    dur = 0.42,
    gain = 0.09,
    q = 0.8
  }: { from?: number; to?: number; dur?: number; gain?: number; q?: number } = {}
) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(from, at);
  bp.frequency.exponentialRampToValueAtTime(to, at + dur);

  const g = ac.createGain();
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + dur * 0.32);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  src.connect(bp).connect(g);
  g.connect(master!);
  g.connect(room!);

  src.start(at);
  src.stop(at + dur + 0.02);
  src.onended = () => {
    src.disconnect();
    bp.disconnect();
    g.disconnect();
  };
}

/* Low swell — the weight under an opening app. Felt, not heard. */
function sub(
  ac: AudioContext,
  at: number,
  { freq = 58, dur = 0.4, gain = 0.1 }: { freq?: number; dur?: number; gain?: number } = {}
) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.72, at + dur);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + dur * 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.05);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

/* A soft, pitched thump for presses — felt more than heard. */
function thump(ac: AudioContext, at: number, freq = 190, gain = 0.1) {
  const o = ac.createOscillator();
  const g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, at);
  o.frequency.exponentialRampToValueAtTime(freq * 0.6, at + 0.09);
  g.gain.setValueAtTime(0, at);
  g.gain.linearRampToValueAtTime(gain, at + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + 0.15);
  o.onended = () => {
    o.disconnect();
    g.disconnect();
  };
}

/* Filtered noise puff (nav ticks, shutter). Dry — ticks want no tail. */
function puff(
  ac: AudioContext,
  at: number,
  { gain = 0.12, dur = 0.05, center = 3200 }: { gain?: number; dur?: number; center?: number } = {}
) {
  const len = Math.floor(ac.sampleRate * dur);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = center;
  bp.Q.value = 1.1;
  const g = ac.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(master!);
  src.start(at);
  src.onended = () => {
    src.disconnect();
    bp.disconnect();
    g.disconnect();
  };
}

// A major — the key the two kept cues (`wake`, `page`) were written in
const A4 = 440;
const Cs5 = 554.37;
const E5 = 659.25;

// the PS5 palette sits cooler and lower, and never uses two of these at once
const D4 = 293.66;
const G4 = 392.0;
const D5 = 587.33;
const Fs5 = 739.99;
const A5 = 880;

const cues: Record<CueName, (ac: AudioContext, t: number) => void> = {
  /*
    Startup. The one warm struck-glass pair the system had, kept exactly as it
    was — this is the sound of the thing coming to life, and the PS5 palette
    around it is deliberately more anonymous so this one still lands.
  */
  wake: (ac, t) => {
    glass(ac, E5, t, { gain: 0.1, decay: 1.3, bright: 3200 });
    glass(ac, A4, t + 0.02, { gain: 0.06, decay: 1.5, bright: 2400 });
  },
  // the compress: felt, nearly silent
  press: (ac, t) => {
    puff(ac, t, { gain: 0.022, dur: 0.022, center: 5200 });
    thump(ac, t, 180, 0.05);
  },
  /*
    Opening: weight, then air rising, then one tone settling into it. One
    tone — a second note would make this a jingle, and an app launch is not
    an announcement.
  */
  open: (ac, t) => {
    sub(ac, t, { freq: 58, dur: 0.42, gain: 0.095 });
    sweep(ac, t, { from: 420, to: 3000, dur: 0.44, gain: 0.085, q: 0.75 });
    soft(ac, D5, t + 0.06, { gain: 0.1, decay: 0.55, bright: 3000 });
  },
  // closing: the same gesture inverted — air falling, one tone under it
  home: (ac, t) => {
    sweep(ac, t, { from: 2800, to: 520, dur: 0.34, gain: 0.08, q: 0.75 });
    soft(ac, G4, t + 0.04, { gain: 0.09, decay: 0.5, bright: 2000 });
    sub(ac, t + 0.02, { freq: 46, dur: 0.28, gain: 0.055 });
  },
  // navigation tick: short, dry, neutral
  tap: (ac, t) => {
    puff(ac, t, { gain: 0.05, dur: 0.026, center: 4600 });
    soft(ac, Fs5, t, { gain: 0.05, decay: 0.16, bright: 5000 });
  },
  /*
    Paging between glance and field. This is the original struck-glass tap,
    kept exactly as it was — the general `tap` above moved to the PS5 tick,
    but the page turn is the one place that voice was worth keeping.
  */
  page: (ac, t) => {
    glass(ac, Cs5, t, { gain: 0.07, decay: 0.35, bright: 4200 });
  },
  // the same tick with a little give in the pitch
  toggle: (ac, t) => {
    puff(ac, t, { gain: 0.035, dur: 0.022, center: 4000 });
    soft(ac, A4, t, { gain: 0.07, decay: 0.2, bright: 3200, bend: 1.12 });
  },
  // something leaving: a short lift of air and one tone bending up after it
  send: (ac, t) => {
    sweep(ac, t, { from: 900, to: 3200, dur: 0.26, gain: 0.05, q: 1 });
    soft(ac, D5, t + 0.02, { gain: 0.085, decay: 0.34, bright: 4200, bend: 1.18 });
  },
  // mechanical but soft: puff + low thump + a distant high tone
  shutter: (ac, t) => {
    puff(ac, t, { gain: 0.16, dur: 0.045, center: 2600 });
    thump(ac, t + 0.005, 160, 0.1);
    soft(ac, A5, t + 0.05, { gain: 0.045, decay: 0.4, bright: 5200 });
  },
  // one low tone sagging under itself — gentle refusal, no alarm
  deny: (ac, t) => {
    soft(ac, D4, t, { gain: 0.095, decay: 0.5, bright: 1500, bend: 0.94 });
    sub(ac, t, { freq: 52, dur: 0.24, gain: 0.05 });
  }
};

export function play(name: CueName) {
  if (!enabled) return;
  const ac = ensure();
  if (!ac || !master || !hall || !room) return;
  cues[name](ac, ac.currentTime + 0.001);
}

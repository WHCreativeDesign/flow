/*
  flow sound design — synthesized, no assets.

  The reference is the PS5 system UI: air first, tone second. Most of the
  character lives in a bandpassed noise sweep, not in pitch, and where a pitch
  does appear a cue plays exactly one of them.

  That last rule is the design. Two notes in sequence read as a *tune*, and a
  tune on every app launch turns the launch into an announcement — the "dun
  dun" the Echo and Aero palettes before it both had. So opening is one
  gesture: weight, air rising, one tone settling into it. Closing is that same
  gesture inverted, not a different melody.

  The layered voice from the Echo palette survives as the tonal core:

    body      a sine fundamental with a soft (not clicky) attack
    weight    an octave below at low level, so the tone has a floor
    presence  a twelfth above, quiet, to keep it from sounding dull
    air       a breath of bandpassed noise under the attack only
    room      a short damped reverb, sent lightly

  Two cues are exempt and keep their Echo voice exactly, because they are the
  two the system is recognised by:

    wake      the startup sound — the thing coming to life
    page      the glance <-> field turn

  Nothing is inharmonic, nothing rings long.

  Every node created here is torn down when its voice ends. A cue that leaves
  nodes on the bus keeps them in the render graph forever, and the graph is
  processed every quantum.
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
  | 'dismiss'
  | 'thinking'
  | 'reply'
  | 'noted'
  | 'deny';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let room: ConvolverNode | null = null;
let roomSend: GainNode | null = null;

let enabled = true;
let volume = 0.5;

export function configureSound(opts: { enabled: boolean; volume: number }) {
  enabled = opts.enabled;
  volume = opts.volume;
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.02);
}

/* A small, damped room: 0.9s of decaying noise, darker as it decays. */
function makeImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 0.9);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      const noise = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.4);
      // one-pole lowpass, so the tail darkens as it fades
      last = last * 0.62 + noise * 0.38;
      d[i] = last * 0.7;
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

    room = ctx.createConvolver();
    room.buffer = makeImpulse(ctx);
    roomSend = ctx.createGain();
    roomSend.gain.value = 0.22;
    room.connect(roomSend).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

interface ToneOptions {
  gain?: number;
  /** seconds to full level — soft enough never to click */
  attack?: number;
  /** seconds of exponential fall */
  release?: number;
  /** lowpass corner, Hz */
  tone?: number;
  /** glide up to the pitch from this ratio (1 = no glide) */
  from?: number;
  /** how much of the octave-below layer to mix */
  weight?: number;
  /** how much of the twelfth-above layer to mix */
  presence?: number;
  /** breath of noise under the attack */
  air?: number;
  /** reverb send for this voice */
  send?: number;
}

/*
  One layered voice. Returns nothing; the voice disposes of itself when the
  longest layer finishes.
*/
function tone(ac: AudioContext, freq: number, at: number, o: ToneOptions = {}) {
  const {
    gain = 0.16,
    attack = 0.012,
    release = 0.42,
    tone: cutoff = 5200,
    from = 1,
    weight = 0.3,
    presence = 0.1,
    air = 0.05,
    send = 1
  } = o;

  const bus = ac.createGain();
  bus.gain.value = 1;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = cutoff;
  lp.Q.value = 0.5;

  const wet = ac.createGain();
  wet.gain.value = send;

  bus.connect(lp);
  lp.connect(master!);
  lp.connect(wet);
  wet.connect(room!);

  const end = at + attack + release + 0.05;
  const layers: Array<[number, number]> = [
    [1, 1],
    [0.5, weight],
    [3, presence]
  ];
  const oscs: OscillatorNode[] = [];

  for (const [ratio, amp] of layers) {
    if (amp <= 0) continue;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = 'sine';
    if (from !== 1) {
      osc.frequency.setValueAtTime(freq * ratio * from, at);
      osc.frequency.exponentialRampToValueAtTime(freq * ratio, at + Math.max(0.04, attack * 3));
    } else {
      osc.frequency.value = freq * ratio;
    }
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain * amp), at + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, at + attack + release);
    osc.connect(g).connect(bus);
    osc.start(at);
    osc.stop(end);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
    oscs.push(osc);
  }

  if (air > 0) {
    const dur = 0.055;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const bp = ac.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(7000, freq * 3.2);
    bp.Q.value = 0.8;
    const g = ac.createGain();
    g.gain.value = air * gain;
    src.connect(bp).connect(g).connect(bus);
    src.start(at);
    src.onended = () => {
      src.disconnect();
      bp.disconnect();
      g.disconnect();
    };
  }

  // the fundamental outlasts every other layer, so its end is the voice's end
  oscs[0]?.addEventListener('ended', () => {
    bus.disconnect();
    lp.disconnect();
    wet.disconnect();
  });
}

/* A low, soft impulse — felt more than heard. */
function body(ac: AudioContext, at: number, freq = 150, gain = 0.09) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.62, at + 0.1);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + 0.14);
  osc.connect(g).connect(master!);
  osc.start(at);
  osc.stop(at + 0.18);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

/* Filtered noise, for the one mechanical cue in the set. */
function noise(ac: AudioContext, at: number, { gain = 0.12, dur = 0.05, center = 3200, q = 1.1 } = {}) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ac.createBufferSource();
  src.buffer = buf;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = center;
  bp.Q.value = q;
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

/*
  The PS5 signature: noise through a bandpass whose centre glides from `from`
  to `to`. Rising is something opening, falling is something leaving. The
  amplitude swells in over the first third and decays out — a hard edge here
  would click.
*/
function sweep(
  ac: AudioContext,
  at: number,
  { from = 420, to = 2800, dur = 0.42, gain = 0.09, q = 0.8 } = {}
) {
  const len = Math.max(1, Math.floor(ac.sampleRate * dur));
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
  g.gain.setValueAtTime(0.0001, at);
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

/* A slow low swell — the weight under an opening app. Longer than `body`,
   which is an impulse; this one has to still be there when the tone lands. */
function sub(ac: AudioContext, at: number, { freq = 58, dur = 0.4, gain = 0.1 } = {}) {
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, at);
  osc.frequency.exponentialRampToValueAtTime(freq * 0.72, at + dur);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.linearRampToValueAtTime(gain, at + dur * 0.22);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(master!);
  osc.start(at);
  osc.stop(at + dur + 0.05);
  osc.onended = () => {
    osc.disconnect();
    g.disconnect();
  };
}

// D major pentatonic — the warm, unhurried set the whole system speaks in
const D4 = 293.66;
const E4 = 329.63;
const Fs4 = 369.99;
const A4 = 440.0;
const D5 = 587.33;
const Fs5 = 739.99;
const A5 = 880.0;
const D6 = 1174.66;

const cues: Record<CueName, (ac: AudioContext, t: number) => void> = {
  /*
    Startup — kept exactly as it was. This is the sound of the system coming
    to life, and the palette around it is deliberately more anonymous so this
    one still lands as an arrival.
  */
  wake: (ac, t) => {
    tone(ac, A4, t, { gain: 0.11, attack: 0.03, release: 0.5, from: 0.94, weight: 0.34, air: 0.04 });
    tone(ac, E4, t, { gain: 0.05, attack: 0.04, release: 0.7, presence: 0.04, air: 0 });
    tone(ac, D5, t + 0.13, { gain: 0.12, attack: 0.02, release: 0.7, from: 0.97, presence: 0.14 });
  },
  // the compress: weight and a breath, almost no pitch
  press: (ac, t) => {
    body(ac, t, 168, 0.075);
    noise(ac, t, { gain: 0.022, dur: 0.03, center: 5200, q: 0.7 });
  },
  /*
    Opening: weight, then air rising, then one tone settling into it. One —
    the two rising steps this replaced were the jingle.
  */
  open: (ac, t) => {
    sub(ac, t, { freq: 58, dur: 0.42, gain: 0.095 });
    sweep(ac, t, { from: 420, to: 3000, dur: 0.44, gain: 0.085, q: 0.75 });
    tone(ac, D5, t + 0.06, { gain: 0.1, attack: 0.016, release: 0.5, from: 0.96, weight: 0.3, presence: 0.08, air: 0.03 });
  },
  // closing: the same gesture inverted — air falling, one tone under it
  home: (ac, t) => {
    sweep(ac, t, { from: 2800, to: 520, dur: 0.34, gain: 0.08, q: 0.75 });
    tone(ac, Fs4, t + 0.04, { gain: 0.095, attack: 0.018, release: 0.46, weight: 0.36, presence: 0.04, air: 0.02 });
    sub(ac, t + 0.02, { freq: 46, dur: 0.28, gain: 0.055 });
  },
  // navigation tick: short, dry, neutral
  tap: (ac, t) => {
    noise(ac, t, { gain: 0.05, dur: 0.026, center: 4600, q: 0.9 });
    tone(ac, A5, t, { gain: 0.055, attack: 0.005, release: 0.14, weight: 0.18, presence: 0.1, air: 0, send: 0.4 });
  },
  /*
    Paging between glance and field — kept exactly as it was, the second of
    the two cues the system is recognised by. This is the voice `tap` had
    before `tap` moved to the tick above.
  */
  page: (ac, t) => {
    tone(ac, A5, t, { gain: 0.085, attack: 0.008, release: 0.24, weight: 0.24, presence: 0.12, air: 0.06, send: 0.7 });
  },
  // the same tick with a little give in the pitch — a switch moving
  toggle: (ac, t) => {
    noise(ac, t, { gain: 0.03, dur: 0.02, center: 4000, q: 0.9 });
    tone(ac, Fs5, t, { gain: 0.07, attack: 0.006, release: 0.18, from: 0.9, weight: 0.2, air: 0, send: 0.5 });
  },
  // something leaving: a short lift of air, one tone gliding up after it
  send: (ac, t) => {
    sweep(ac, t, { from: 900, to: 3200, dur: 0.26, gain: 0.05, q: 1 });
    tone(ac, D5, t + 0.02, { gain: 0.085, attack: 0.008, release: 0.3, from: 0.86, presence: 0.14, air: 0.03 });
  },
  // the one mechanical cue: a soft clack with a bright tail behind it
  shutter: (ac, t) => {
    noise(ac, t, { gain: 0.13, dur: 0.04, center: 2400, q: 1.4 });
    body(ac, t + 0.004, 140, 0.085);
    tone(ac, D6, t + 0.045, { gain: 0.05, attack: 0.006, release: 0.34, weight: 0, presence: 0.2, air: 0 });
  },
  // something taken off the pile: a short fall of air, one tone under it
  dismiss: (ac, t) => {
    sweep(ac, t, { from: 2600, to: 700, dur: 0.2, gain: 0.055, q: 1 });
    tone(ac, Fs5, t + 0.02, { gain: 0.06, attack: 0.006, release: 0.22, weight: 0.22, air: 0, send: 0.5 });
  },
  /*
    The assistant's three cues.

    Built from the same tone()/sweep()/sub() voices as everything else, in the
    same D pentatonic, at the same gains — an assistant that announced itself
    in a different sound language would read as a bolted-on product rather
    than part of the system. `thinking` is the quietest cue in the whole set
    because it fires while you wait, and `reply` is a single tone for exactly
    the reason open/home are: two notes would be a jingle.
  */
  // the question going out: a short rise of air, barely pitched
  thinking: (ac, t) => {
    sweep(ac, t, { from: 700, to: 2400, dur: 0.3, gain: 0.035, q: 0.7 });
    tone(ac, D5, t + 0.03, { gain: 0.045, attack: 0.02, release: 0.3, from: 0.92, weight: 0.2, air: 0.02, send: 0.6 });
  },
  // the answer landing: one tone settling, air falling in behind it
  reply: (ac, t) => {
    sweep(ac, t, { from: 2200, to: 780, dur: 0.28, gain: 0.05, q: 0.8 });
    tone(ac, A4, t + 0.02, { gain: 0.085, attack: 0.014, release: 0.5, from: 1.06, weight: 0.32, presence: 0.1, air: 0.03 });
    sub(ac, t, { freq: 52, dur: 0.26, gain: 0.05 });
  },
  // something written down: the smallest possible acknowledgement
  noted: (ac, t) => {
    noise(ac, t, { gain: 0.028, dur: 0.02, center: 5000, q: 0.9 });
    tone(ac, D6, t, { gain: 0.045, attack: 0.005, release: 0.16, weight: 0.14, presence: 0.12, air: 0, send: 0.4 });
  },
  // one low tone sagging under itself — a refusal, never an alarm
  deny: (ac, t) => {
    tone(ac, D4, t, { gain: 0.095, attack: 0.022, release: 0.5, from: 1.08, weight: 0.42, presence: 0.02, air: 0.02 });
    sub(ac, t, { freq: 52, dur: 0.24, gain: 0.05 });
  }
};

export function play(name: CueName) {
  if (!enabled) return;
  const ac = ensure();
  if (!ac || !master || !room) return;
  cues[name](ac, ac.currentTime + 0.001);
}

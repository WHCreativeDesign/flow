/*
  flow sound design — synthesized, no assets.

  The reference is the Amazon Echo family: pure, warm, high-fidelity earcons
  rather than anything struck or metallic. Every cue is built the same way,
  in layers:

    body      a sine fundamental with a soft (not clicky) attack
    weight    an octave below at low level, so the tone has a floor
    presence  a twelfth above, quiet, to keep it from sounding dull
    air       a breath of bandpassed noise under the attack only
    room      a short damped reverb, sent lightly

  Pitches sit in a D major pentatonic, and cues are phrased as intervals:
  rising to open, falling to close. Nothing is inharmonic, nothing rings long.

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
  | 'toggle'
  | 'send'
  | 'shutter'
  | 'dismiss'
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

// D major pentatonic — the warm, unhurried set the whole system speaks in
const D4 = 293.66;
const E4 = 329.63;
const Fs4 = 369.99;
const A4 = 440.0;
const D5 = 587.33;
const Fs5 = 739.99;
const A5 = 880.0;
const B5 = 987.77;
const D6 = 1174.66;

const cues: Record<CueName, (ac: AudioContext, t: number) => void> = {
  // rising fifth, gliding in — the surface coming up to meet you
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
  // two rising steps, opening out
  open: (ac, t) => {
    tone(ac, Fs5, t, { gain: 0.13, attack: 0.012, release: 0.34, weight: 0.32, air: 0.07 });
    tone(ac, B5, t + 0.085, { gain: 0.14, attack: 0.012, release: 0.52, presence: 0.16, air: 0.05 });
    body(ac, t, 190, 0.05);
  },
  // the same two steps, falling — coming home
  home: (ac, t) => {
    tone(ac, B5, t, { gain: 0.12, attack: 0.012, release: 0.3, presence: 0.14, air: 0.05 });
    tone(ac, Fs5, t + 0.085, { gain: 0.13, attack: 0.014, release: 0.55, weight: 0.34, air: 0.03 });
  },
  // one clean note — the smallest possible confirmation
  tap: (ac, t) => {
    tone(ac, A5, t, { gain: 0.085, attack: 0.008, release: 0.24, weight: 0.24, presence: 0.12, air: 0.06, send: 0.7 });
  },
  // a tight pair, no tail — a switch moving
  toggle: (ac, t) => {
    tone(ac, Fs5, t, { gain: 0.075, attack: 0.006, release: 0.14, weight: 0.2, air: 0.08, send: 0.5 });
    tone(ac, B5, t + 0.045, { gain: 0.07, attack: 0.006, release: 0.2, presence: 0.1, air: 0, send: 0.6 });
  },
  // rising through the pentatonic — something leaving on its way
  send: (ac, t) => {
    tone(ac, Fs5, t, { gain: 0.085, attack: 0.008, release: 0.22, air: 0.05 });
    tone(ac, A5, t + 0.06, { gain: 0.095, attack: 0.008, release: 0.24, air: 0.04 });
    tone(ac, D6, t + 0.12, { gain: 0.1, attack: 0.01, release: 0.5, presence: 0.18, air: 0.03 });
  },
  // the one mechanical cue: a soft clack with a bright tail behind it
  shutter: (ac, t) => {
    noise(ac, t, { gain: 0.13, dur: 0.04, center: 2400, q: 1.4 });
    body(ac, t + 0.004, 140, 0.085);
    tone(ac, D6, t + 0.045, { gain: 0.05, attack: 0.006, release: 0.34, weight: 0, presence: 0.2, air: 0 });
  },
  // a short falling step — something taken off the pile
  dismiss: (ac, t) => {
    tone(ac, A5, t, { gain: 0.07, attack: 0.006, release: 0.16, weight: 0.22, air: 0.07, send: 0.5 });
    tone(ac, Fs5, t + 0.05, { gain: 0.06, attack: 0.008, release: 0.28, air: 0, send: 0.6 });
  },
  // two low steps down — a refusal, never an alarm
  deny: (ac, t) => {
    tone(ac, Fs4, t, { gain: 0.09, attack: 0.02, release: 0.34, weight: 0.4, presence: 0.04, air: 0.02 });
    tone(ac, D4, t + 0.13, { gain: 0.09, attack: 0.024, release: 0.6, weight: 0.45, presence: 0.02, air: 0 });
  }
};

export function play(name: CueName) {
  if (!enabled) return;
  const ac = ensure();
  if (!ac || !master || !room) return;
  cues[name](ac, ac.currentTime + 0.001);
}

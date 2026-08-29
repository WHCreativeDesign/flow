/*
  flow sound design — synthesized, no assets.

  The reference is the Windows 7 / Aero palette: soft struck glass and
  marimba-like tones with an airy tail, built on open fifths and major
  seconds. Nothing bubbly, nothing cartoonish. Every cue is a short
  two-partial "glass bar" voice (fundamental + inharmonic 2.76× partial,
  the ratio of a struck bar) through a gentle lowpass and a small
  generated hall.
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
  | 'deny';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let hall: ConvolverNode | null = null;

let enabled = true;
let volume = 0.5;

export function configureSound(opts: { enabled: boolean; volume: number }) {
  enabled = opts.enabled;
  volume = opts.volume;
  if (master && ctx) master.gain.setTargetAtTime(volume * 0.9, ctx.currentTime, 0.02);
}

/* A small hall: 1.4s of exponentially decaying noise, lowpassed by decay. */
function makeImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 1.4);
  const buf = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 2.8) * 0.5;
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

    hall = ctx.createConvolver();
    hall.buffer = makeImpulse(ctx);
    const wet = ctx.createGain();
    wet.gain.value = 0.35;

    master.connect(ctx.destination);
    hall.connect(wet).connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

/*
  One struck-glass voice.

  Every node created here is torn down when the voice finishes. A cue that
  leaves nodes attached to the master bus keeps them in the render graph
  forever, and the graph — processed every quantum — grows with each sound
  the system plays.
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

/* Filtered noise puff (shutter, ticks). */
function puff(ac: AudioContext, at: number, { gain = 0.12, dur = 0.05, center = 3200 }: { gain?: number; dur?: number; center?: number } = {}) {
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

// pitches around A major — the warm, unhurried key of the Aero palette
const A4 = 440;
const Cs5 = 554.37;
const E5 = 659.25;
const A5 = 880;
const E4 = 329.63;
const Fs4 = 369.99;

const cues: Record<CueName, (ac: AudioContext, t: number) => void> = {
  // one warm note with air — the surface noticing you
  wake: (ac, t) => {
    glass(ac, E5, t, { gain: 0.1, decay: 1.3, bright: 3200 });
    glass(ac, A4, t + 0.02, { gain: 0.06, decay: 1.5, bright: 2400 });
  },
  // the compress: felt, nearly silent
  press: (ac, t) => {
    thump(ac, t, 210, 0.08);
    puff(ac, t, { gain: 0.03, dur: 0.03, center: 4200 });
  },
  // rising open fifth, the bloom
  open: (ac, t) => {
    glass(ac, A4, t, { gain: 0.13, decay: 0.8 });
    glass(ac, E5, t + 0.09, { gain: 0.15, decay: 1.1 });
  },
  // the same fifth, falling — coming home
  home: (ac, t) => {
    glass(ac, E5, t, { gain: 0.12, decay: 0.7 });
    glass(ac, A4, t + 0.09, { gain: 0.12, decay: 1.1, bright: 2800 });
  },
  // small neutral confirmation
  tap: (ac, t) => {
    glass(ac, Cs5, t, { gain: 0.07, decay: 0.35, bright: 4200 });
  },
  toggle: (ac, t) => {
    glass(ac, Fs4, t, { gain: 0.08, decay: 0.3, bright: 3600 });
    glass(ac, Cs5, t + 0.05, { gain: 0.06, decay: 0.4 });
  },
  // quick ascending triad — something left on its way
  send: (ac, t) => {
    glass(ac, A4, t, { gain: 0.09, decay: 0.5 });
    glass(ac, Cs5, t + 0.07, { gain: 0.1, decay: 0.5 });
    glass(ac, E5, t + 0.14, { gain: 0.11, decay: 0.9 });
  },
  // mechanical but soft: puff + low thump + a distant high ping
  shutter: (ac, t) => {
    puff(ac, t, { gain: 0.16, dur: 0.045, center: 2600 });
    thump(ac, t + 0.005, 160, 0.1);
    glass(ac, A5, t + 0.05, { gain: 0.05, decay: 0.5, bright: 5200 });
  },
  // two low seconds — gentle refusal, no alarm
  deny: (ac, t) => {
    glass(ac, Fs4, t, { gain: 0.09, decay: 0.5, bright: 2600 });
    glass(ac, E4, t + 0.14, { gain: 0.09, decay: 0.8, bright: 2200 });
  }
};

export function play(name: CueName) {
  if (!enabled) return;
  const ac = ensure();
  if (!ac || !master || !hall) return;
  cues[name](ac, ac.currentTime + 0.001);
}

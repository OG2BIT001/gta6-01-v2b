// All sound is synthesised with WebAudio — no audio files. The context is
// created lazily on the first user gesture (browsers refuse it earlier),
// and every call is a no-op until then, so the game is silent-safe in any
// environment, including the headless smoke test.

let ctx = null;
let master = null;
let engineNodes = null;
let sirenNodes = null;
let rainNodes = null;
let padTimer = 0;

export function initAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = typeof window !== 'undefined' ? window.AudioContext || window.webkitAudioContext : null;
  if (!AC) return;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

export function setMuted(muted) {
  if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 0.5, ctx.currentTime, 0.03);
}

function env(gainNode, t0, a, peak, d) {
  const g = gainNode.gain;
  g.setValueAtTime(0.0001, t0);
  g.linearRampToValueAtTime(peak, t0 + a);
  g.exponentialRampToValueAtTime(0.0001, t0 + a + d);
}

function tone(freq, type, a, d, peak, when = 0, slideTo = null) {
  if (!ctx) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + a + d);
  env(g, t0, a, peak, d);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + a + d + 0.05);
}

function noise(dur, peak, filterFreq, type = 'lowpass') {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const g = ctx.createGain();
  env(g, t0, 0.004, peak, dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
}

export const sfx = {
  shot() { noise(0.11, 0.5, 2600, 'highpass'); tone(150, 'square', 0.004, 0.07, 0.18, 0, 60); },
  dryFire() { tone(900, 'square', 0.002, 0.03, 0.08); },
  hit() { noise(0.06, 0.3, 900); },
  crash(big) { noise(big ? 0.4 : 0.18, big ? 0.6 : 0.35, 500); tone(70, 'sine', 0.005, big ? 0.35 : 0.15, 0.4, 0, 40); },
  pickup() { tone(660, 'square', 0.005, 0.07, 0.16); tone(990, 'square', 0.005, 0.09, 0.16, 0.07); },
  cash() { tone(1240, 'triangle', 0.005, 0.06, 0.2); tone(1560, 'triangle', 0.005, 0.08, 0.2, 0.05); },
  door() { tone(180, 'sine', 0.005, 0.09, 0.25, 0, 90); noise(0.05, 0.12, 700); },
  step() { noise(0.03, 0.05, 500); },
  hurt() { tone(220, 'sawtooth', 0.004, 0.12, 0.2, 0, 110); },
  star() { tone(520, 'square', 0.004, 0.06, 0.15); tone(390, 'square', 0.004, 0.09, 0.15, 0.06); },
  missionStart() { [392, 523, 659].forEach((f, i) => tone(f, 'triangle', 0.006, 0.16, 0.22, i * 0.09)); },
  missionDone() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 'triangle', 0.006, 0.22, 0.24, i * 0.1)); },
  fail() { [330, 262, 196].forEach((f, i) => tone(f, 'sawtooth', 0.006, 0.2, 0.14, i * 0.12)); },
  phone() { tone(1046, 'sine', 0.004, 0.09, 0.14); tone(1046, 'sine', 0.004, 0.09, 0.14, 0.16); },
  spray() { noise(0.7, 0.16, 3000, 'bandpass'); },
  horn() { tone(370, 'square', 0.01, 0.16, 0.16); tone(466, 'square', 0.01, 0.16, 0.12); },
};

// Continuous engine hum while driving; pitch follows speed. Call every
// frame with the speed fraction (0..1), or with null to stop it.
export function engineSound(frac) {
  if (!ctx) return;
  if (frac === null) {
    if (engineNodes) {
      engineNodes.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.15);
      const old = engineNodes;
      setTimeout(() => { try { old.osc.stop(); } catch { /* already stopped */ } }, 250);
      engineNodes = null;
    }
    return;
  }
  if (!engineNodes) {
    const osc = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const g = ctx.createGain();
    osc.type = 'sawtooth';
    osc2.type = 'square';
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    g.gain.value = 0.0;
    osc.connect(filter); osc2.connect(filter); filter.connect(g).connect(master);
    osc.start(); osc2.start();
    engineNodes = { osc, osc2, filter, g };
  }
  const f = 55 + frac * 165;
  const t = ctx.currentTime;
  engineNodes.osc.frequency.setTargetAtTime(f, t, 0.05);
  engineNodes.osc2.frequency.setTargetAtTime(f * 0.5 + 2, t, 0.05);
  engineNodes.filter.frequency.setTargetAtTime(300 + frac * 900, t, 0.08);
  engineNodes.g.gain.setTargetAtTime(0.05 + frac * 0.05, t, 0.1);
}

// Two-tone police siren, on while any police unit is close and active.
export function sirenSound(on) {
  if (!ctx) return;
  if (on && !sirenNodes) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 830;
    lfo.frequency.value = 0.7;
    lfoGain.gain.value = 130;
    lfo.connect(lfoGain).connect(osc.frequency);
    g.gain.value = 0.035;
    osc.connect(g).connect(master);
    osc.start(); lfo.start();
    sirenNodes = { osc, lfo, g };
  } else if (!on && sirenNodes) {
    const old = sirenNodes;
    old.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
    setTimeout(() => { try { old.osc.stop(); old.lfo.stop(); } catch { /* done */ } }, 300);
    sirenNodes = null;
  }
}

export function rainSound(on) {
  if (!ctx) return;
  if (on && !rainNodes) {
    const len = ctx.sampleRate * 2;
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    const g = ctx.createGain();
    g.gain.value = 0.045;
    src.connect(filter).connect(g).connect(master);
    src.start();
    rainNodes = { src, g };
  } else if (!on && rainNodes) {
    const old = rainNodes;
    old.g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.3);
    setTimeout(() => { try { old.src.stop(); } catch { /* done */ } }, 400);
    rainNodes = null;
  }
}

// A slow synthwave pad: a soft detuned chord that drifts every few seconds
// while the game runs. Cheap ambience, called from the main loop.
const PAD_CHORDS = [[110, 165, 220, 277], [98, 147, 196, 247], [87, 131, 175, 220], [104, 156, 208, 262]];
export function padTick(dt, night) {
  if (!ctx) return;
  padTimer -= dt;
  if (padTimer > 0) return;
  padTimer = 7;
  const chord = PAD_CHORDS[Math.floor(Math.random() * PAD_CHORDS.length)];
  for (const f of chord) {
    tone(f, 'triangle', 1.8, 5.5, night ? 0.028 : 0.018);
    tone(f * 1.003, 'sine', 2.2, 5.0, 0.012);
  }
}

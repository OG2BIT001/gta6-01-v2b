// Headless smoke test for Neon Tide: Coral Bay. Stubs the DOM, canvas and
// storage, loads game/src/main.js the way a browser would (including the
// ?shot= staging), pumps animation frames, presses keys, and asserts the
// game actually runs: title → play, dialogue, driving, shooting, a mission
// start, and every screenshot scene. Run: node tools/smoke.mjs
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const here = fileURLToPath(new URL('.', import.meta.url));
const mainUrl = new URL('../game/src/main.js', `file://${here}`).href;

function makeCtx() {
  const grad = { addColorStop() {} };
  const base = {
    canvas: null,
    fillStyle: '', strokeStyle: '', lineWidth: 1, lineCap: '', font: '',
    textAlign: '', globalAlpha: 1, globalCompositeOperation: '', shadowColor: '', shadowBlur: 0,
    save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
    beginPath() {}, moveTo() {}, lineTo() {}, arcTo() {}, arc() {}, ellipse() {},
    quadraticCurveTo() {}, closePath() {}, fill() {}, stroke() {}, clip() {},
    fillRect() {}, strokeRect() {}, fillText() {},
    createLinearGradient() { return grad; },
    createRadialGradient() { return grad; },
    measureText() { return { width: 42 }; },
  };
  return base;
}

let rafCallback = null;
const listeners = {};
const storage = new Map();

function installGlobals(search) {
  const canvas = { width: 0, height: 0, getContext: () => makeCtx() };
  const status = { textContent: '' };
  globalThis.document = {
    getElementById: (id) => (id === 'game' ? canvas : status),
  };
  globalThis.window = {
    innerWidth: 1280,
    innerHeight: 720,
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    AudioContext: undefined,
    webkitAudioContext: undefined,
  };
  globalThis.window.window = globalThis.window;
  globalThis.location = { search };
  globalThis.localStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
  };
  globalThis.requestAnimationFrame = (cb) => { rafCallback = cb; return 1; };
}

function fire(name, event) {
  for (const fn of listeners[name] || []) fn(event);
}

function pump(seconds) {
  const frames = Math.floor(seconds * 60);
  let ts = pump.ts || 0;
  for (let i = 0; i < frames; i += 1) {
    ts += 1000 / 60;
    const cb = rafCallback;
    rafCallback = null;
    if (cb) cb(ts);
  }
  pump.ts = ts;
}

function key(code, down = true) {
  fire(down ? 'keydown' : 'keyup', { code, preventDefault() {} });
}
function tap(code) {
  key(code, true);
  pump(0.05);
  key(code, false);
  pump(0.05);
}

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures += 1;
}

// ---- 1. screenshot scenes stage cleanly
for (const scene of ['title', 'drive', 'chase', 'foot']) {
  installGlobals(`?shot=${scene}&seed=7`);
  pump.ts = 0;
  await import(`${mainUrl}?scene=${scene}`);
  check(`shot=${scene} stages`, globalThis.window.__shotReady === true);
  const st = globalThis.window.__game.state();
  check(`shot=${scene} world populated`, st.cars.length > 10 && st.city.buildings.length > 100,
    `${st.cars.length} cars, ${st.city.buildings.length} buildings`);
  if (scene === 'chase') check('chase has police', st.cops.length > 0, `${st.cops.length} cops, heat ${st.heat.toFixed(1)}`);
  if (scene === 'drive') check('drive: player is driving', !!st.player.car);
}

// ---- 2. a real play session
installGlobals('');
pump.ts = 0;
await import(`${mainUrl}?scene=play`);
const game = globalThis.window.__game;
let st = game.state();
check('boots to title', st.screen === 'title');
tap('Enter');
pump(0.2);
st = game.state();
check('Enter starts the game', st.screen === 'play');
check('intro dialogue queued', st.dialogue.length === 2);
tap('KeyE'); tap('KeyE');
pump(0.2);
st = game.state();
check('dialogue advances and clears', st.dialogue.length === 0);

// Walk north for two seconds.
key('KeyW', true);
pump(2);
key('KeyW', false);
st = game.state();
check('player walks', st.player.y < 740, `y=${Math.round(st.player.y)}`);

// Teleport next to Selene and take the first job.
st.player.x = st.city.places.selene.x + 20;
st.player.y = st.city.places.selene.y + 20;
tap('KeyE');
pump(0.2);
st = game.state();
check('mission 1 starts at Selene', !!st.mission && st.mission.def.id === 'first-night');
check('mission dialogue plays', st.dialogue.length === 3);
tap('KeyE'); tap('KeyE'); tap('KeyE');

// Teleport to the club pickup, on foot → stage 2.
st.player.x = st.city.places.club.x;
st.player.y = st.city.places.club.y;
pump(0.3);
st = game.state();
check('pickup stage completes', !!st.mission && st.mission.stage === 1, `stage=${st.mission?.stage}`);
// Deliver to the safehouse.
st.player.x = st.city.places.safehouse.x;
st.player.y = st.city.places.safehouse.y;
pump(0.3);
st = game.state();
check('mission 1 completes and pays', st.mission === null && st.progress === 1 && st.money > 120,
  `progress=${st.progress}, money=${st.money}`);
check('save written', storage.size > 0);

// Heat + police: give the player 3 stars and let the world run.
st.heat = 3.4;
pump(4);
st = game.state();
check('police respond to heat', st.cops.length > 0, `${st.cops.length} cops`);
// Cool off again so the following checks run in free play, not in a cell.
st.heat = 0;
st.cops = [];
st.cars = st.cars.filter(c => c.kind !== 'cop');
st.screen = 'play';
st.over = null;
st.player.health = 100;
st.dialogue = []; // the mission outro would otherwise (correctly) block firing

// Shooting does not crash and registers gunfire.
fire('mousedown', { clientX: 900, clientY: 300 });
pump(0.4);
fire('mouseup', {});
st = game.state();
check('shooting ran', st.gunfireAt > 0);

// Pause and resume.
tap('KeyP');
st = game.state();
check('pause screen', st.screen === 'pause');
tap('KeyP');
pump(0.2);
st = game.state();
check('resume', st.screen === 'play');

console.log(failures === 0 ? '\nSMOKE OK' : `\nSMOKE FAILED: ${failures}`);
process.exit(failures === 0 ? 0 : 1);

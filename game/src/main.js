// Neon Tide: Coral Bay — entry point. Owns the game state, the input, the
// fixed-step loop, the screen machine (title / play / pause / wasted /
// victory), saving, and the ?shot= staging the screenshot harness uses.
import { STEP, SAVE_KEY, PLAYER } from './config.js';
import { buildCity, colliders } from './city.js';
import { makeRng } from './rng.js';
import {
  makePlayer, makeCar, spawnParkedCars, spawnWorldPickups, updateEntities,
  enterCar, exitCar, nearestEnterableCar, tryShoot, wantedStars, spawnRival,
} from './entities.js';
import { MISSIONS, missionOffer, startMission, updateMissions, failMission, currentObjective } from './missions.js';
import { drawWorld, drawHUD, drawDialogue, drawTitle, drawPause, drawOver, drawVictory, SCREEN } from './render.js';
import { fx, resetFx, updateFx, updateWeather, weather, muzzle, floatText } from './fx.js';
import { initAudio, engineSound, sirenSound, rainSound, padTick, sfx, setMuted } from './audio.js';

const params = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
const seed = Number(params.get('seed') || 7) || 7;
const shotName = params.get('shot');

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

let viewW = 1280;
let viewH = 720;
function resize() {
  viewW = window.innerWidth || 1280;
  viewH = window.innerHeight || 720;
  canvas.width = viewW;
  canvas.height = viewH;
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------ state
function freshState() {
  const city = buildCity(seed);
  const state = {
    city,
    solids: colliders(city),
    rng: makeRng(seed * 31 + 5),
    time: 0,
    dayT: 0.36,
    player: makePlayer(city.places.safehouse.x + 30, city.places.safehouse.y + 90),
    cars: [], peds: [], cops: [], rivals: [], pickups: [],
    heat: 0, bustProgress: 0, gunfireAt: -99,
    money: 120, progress: 0,
    mission: null, dialogue: [], hint: '', hintT: 0,
    events: [], shotFx: [],
    screen: SCREEN.TITLE, over: null, showHelp: false, muted: false,
    rivalsHostile: false, godMode: false, saveDirty: false,
    aimAngle: 0, aiming: false, victoryShown: false,
    view: { x0: 0, y0: 0 },
  };
  spawnParkedCars(state);
  spawnWorldPickups(state);
  return state;
}

let state = freshState();

// ------------------------------------------------------------ save
function readSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
      money: state.money, progress: state.progress,
      x: state.player.x, y: state.player.y, dayT: state.dayT,
    }));
  } catch { /* storage unavailable — play on without saving */ }
}

function applySave(save) {
  state.money = save.money ?? state.money;
  state.progress = save.progress ?? 0;
  state.player.x = save.x ?? state.player.x;
  state.player.y = save.y ?? state.player.y;
  state.dayT = save.dayT ?? state.dayT;
}

let hasSave = !!readSave();

// ------------------------------------------------------------ input
const keys = new Set();
const pressed = new Set();
let mouse = { x: viewW / 2, y: viewH / 2 - 80, down: false };

window.addEventListener('keydown', (e) => {
  initAudio();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (!keys.has(e.code)) pressed.add(e.code);
  keys.add(e.code);
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('mousedown', (e) => { initAudio(); mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('mouseup', () => { mouse.down = false; });
window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
window.addEventListener('blur', () => { keys.clear(); mouse.down = false; });

function inputState() {
  return {
    up: keys.has('KeyW') || keys.has('ArrowUp'),
    down: keys.has('KeyS') || keys.has('ArrowDown'),
    left: keys.has('KeyA') || keys.has('ArrowLeft'),
    right: keys.has('KeyD') || keys.has('ArrowRight'),
    sprint: keys.has('ShiftLeft') || keys.has('ShiftRight'),
  };
}

// ------------------------------------------------------------ flow helpers
function startGame(continueSave) {
  state = freshState();
  resetFx();
  if (continueSave) {
    const save = readSave();
    if (save) applySave(save);
  }
  state.screen = SCREEN.PLAY;
  state.dialogue = [
    { who: 'Selene', text: 'Nix — welcome to Coral Bay. Your room is at the Harbourview Safehouse, and your first job is whenever you are ready.' },
    { who: 'Selene', text: 'Come and see me at the Overlook, downtown. Follow the pink marker. Steal something with wheels on the way, if you like.' },
  ];
  hasSave = !!readSave();
}

function respawnAfterOver() {
  const fine = Math.min(150, state.money);
  state.money -= fine;
  if (state.mission) failMission(state, 'That went badly. The job is off — come and see me when you are patched up.');
  state.heat = 0;
  state.cops = [];
  state.cars = state.cars.filter(c => c.kind !== 'cop');
  const spot = state.over === 'busted' ? state.city.places.safehouse : state.city.places.hospital;
  state.player.car = null;
  state.player.x = spot.x + 30;
  state.player.y = spot.y + 80;
  state.player.health = PLAYER.maxHealth;
  state.player.armour = 0;
  state.over = null;
  state.bustProgress = 0;
  state.screen = SCREEN.PLAY;
  writeSave();
}

function tryRespray() {
  const p = state.player;
  if (!p.car || state.heat <= 0) return false;
  for (const key of ['spray1', 'spray2', 'spray3']) {
    const s = state.city.places[key];
    if (Math.hypot(p.x - s.x, p.y - s.y) < 120) {
      if (state.money < 200) {
        state.hint = 'A respray costs $200';
        state.hintT = 2.4;
        return true;
      }
      state.money -= 200;
      state.heat = 0;
      state.cops = [];
      state.cars = state.cars.filter(c => c.kind !== 'cop');
      p.car.health = 100;
      p.car.colour = ['#c23b4e', '#3b6dc2', '#3fae6a', '#e0a32e', '#7a4fc2'][Math.floor(Math.random() * 5)];
      sfx.spray();
      floatText(p.x, p.y - 40, 'RESPRAYED — HEAT CLEARED', '#ff8fc7');
      return true;
    }
  }
  return false;
}

function interact() {
  if (state.dialogue.length) {
    state.dialogue.shift();
    sfx.pickup();
    return;
  }
  const p = state.player;
  // Respray first when in a car — it is the only in-car interaction.
  if (p.car) {
    tryRespray();
    return;
  }
  const selene = state.city.places.selene;
  if (Math.hypot(p.x - selene.x, p.y - selene.y) < 92) {
    const offer = missionOffer(state);
    if (offer) startMission(state, offer);
  }
}

// ------------------------------------------------------------ per-step update
function step(dt) {
  state.time += dt;
  state.dayT = (state.dayT + dt / 260) % 1;
  updateWeather(dt);
  updateFx(dt);
  if (state.hintT > 0) {
    state.hintT -= dt;
    if (state.hintT <= 0) state.hint = '';
  }
  // Expire tracers / muzzle markers.
  for (let i = state.shotFx.length - 1; i >= 0; i -= 1) {
    const s = state.shotFx[i];
    if (s.angle !== undefined && !s.done) {
      s.done = true;
      muzzle(s.x, s.y, s.angle);
    }
    s.life = (s.life ?? 0.07) - dt;
    if (s.life <= 0) state.shotFx.splice(i, 1);
  }

  if (state.screen !== SCREEN.PLAY) return;

  const input = inputState();
  const talking = state.dialogue.length > 0;
  const moveInput = talking
    ? { up: false, down: false, left: false, right: false, sprint: false }
    : input;

  updateEntities(state, dt, moveInput);

  // Aiming + shooting.
  const p = state.player;
  const aimWX = mouse.x + state.view.x0;
  const aimWY = mouse.y + state.view.y0;
  state.aimAngle = Math.atan2(aimWY - p.y, aimWX - p.x);
  state.aiming = mouse.down;
  if (mouse.down && !talking) tryShoot(state, aimWX, aimWY);

  updateMissions(state, dt);

  // Story completion → victory screen, once.
  if (state.events.includes('storyComplete') && !state.victoryShown) {
    state.victoryShown = true;
    state.screen = SCREEN.VICTORY;
    writeSave();
  }
  if (state.over && state.screen === SCREEN.PLAY) {
    state.screen = SCREEN.OVER;
    sfx.fail();
    writeSave();
  }
  state.events.length = 0;
  if (state.saveDirty) {
    state.saveDirty = false;
    writeSave();
  }

  // Ambient audio follows the world.
  engineSound(p.car ? Math.abs(p.car.speed) / 560 : null);
  sirenSound(state.cops.length > 0 && wantedStars(state) > 0);
  rainSound(weather.raining);
  padTick(dt, state.dayT > 0.78 || state.dayT < 0.22);
}

// ------------------------------------------------------------ per-frame: keys + draw
function handlePressed() {
  const hit = (code) => pressed.has(code);
  if (state.screen === SCREEN.TITLE) {
    if (hit('Enter')) startGame(hasSave);
    if (hit('KeyN')) { localStorage.removeItem(SAVE_KEY); hasSave = false; startGame(false); }
    if (hit('KeyH')) state.showHelp = !state.showHelp;
  } else if (state.screen === SCREEN.PLAY) {
    if (hit('KeyE') || hit('Enter')) interact();
    if (hit('KeyF')) {
      if (state.player.car) exitCar(state);
      else {
        const car = nearestEnterableCar(state);
        if (car) enterCar(state, car);
      }
    }
    if (hit('KeyH') && state.player.car) {
      sfx.horn();
      for (const ped of state.peds) {
        if (Math.hypot(ped.x - state.player.x, ped.y - state.player.y) < 170) ped.flee = 1.1;
      }
    }
    if (hit('KeyP') || hit('Escape')) state.screen = SCREEN.PAUSE;
    if (hit('KeyM')) {
      state.muted = !state.muted;
      setMuted(state.muted);
    }
  } else if (state.screen === SCREEN.PAUSE) {
    if (hit('KeyP') || hit('Escape') || hit('Enter')) state.screen = SCREEN.PLAY;
    if (hit('KeyS')) writeSave();
    if (hit('KeyQ')) { writeSave(); state.screen = SCREEN.TITLE; hasSave = true; }
  } else if (state.screen === SCREEN.OVER) {
    if (hit('Enter')) respawnAfterOver();
  } else if (state.screen === SCREEN.VICTORY) {
    if (hit('Enter')) state.screen = SCREEN.PLAY;
  }
  pressed.clear();
}

let lastStatus = '';
function draw() {
  if (state.screen === SCREEN.TITLE) {
    drawTitle(ctx, state, viewW, viewH, hasSave);
  } else {
    const view = drawWorld(ctx, state, viewW, viewH);
    state.view = view;
    drawHUD(ctx, state, viewW, viewH);
    drawDialogue(ctx, state, viewW, viewH);
    if (state.screen === SCREEN.PAUSE) drawPause(ctx, state, viewW, viewH);
    if (state.screen === SCREEN.OVER) drawOver(ctx, state, viewW, viewH);
    if (state.screen === SCREEN.VICTORY) drawVictory(ctx, state, viewW, viewH);
  }
  const obj = currentObjective(state);
  const text = obj ? obj.label : '';
  if (statusEl && text !== lastStatus) {
    lastStatus = text;
    statusEl.textContent = text;
  }
}

// ------------------------------------------------------------ shot staging
function stageShot(name) {
  const P = state.city.places;
  state.screen = SCREEN.PLAY;
  state.dialogue = [];
  if (name === 'drive') {
    state.dayT = 0.52;
    const car = makeCar(2880, 700, Math.PI / 2, '#c23b4e');
    car.speed = 330;
    state.cars.push(car);
    enterCar(state, car);
    for (let i = 0; i < 110; i += 1) step(STEP);
  } else if (name === 'chase') {
    state.dayT = 0.8;
    const car = makeCar(3700, 2100, 0, '#e0a32e');
    car.speed = 380;
    state.cars.push(car);
    enterCar(state, car);
    state.heat = 3.6;
    for (let i = 0; i < 170; i += 1) {
      keys.add('KeyW');
      step(STEP);
    }
    keys.delete('KeyW');
  } else if (name === 'foot') {
    state.dayT = 0.86;
    state.player.x = P.club.x - 120;
    state.player.y = P.club.y + 130;
    state.player.angle = 0.4;
    state.aimAngle = 0.4;
    state.aiming = true;
    spawnRival(state, P.club.x + 150, P.club.y + 60);
    spawnRival(state, P.club.x + 210, P.club.y + 170);
    state.mission = null;
    for (let i = 0; i < 40; i += 1) step(STEP);
  } else {
    // 'title' and anything else: the menu over the dusk pan.
    state.screen = SCREEN.TITLE;
    for (let i = 0; i < 30; i += 1) step(STEP);
  }
  draw();
  window.__shotReady = true;
}

// ------------------------------------------------------------ loop
let accumulator = 0;
let lastTs = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastTs) lastTs = ts;
  let elapsed = (ts - lastTs) / 1000;
  lastTs = ts;
  if (elapsed > 0.25) elapsed = 0.25;
  accumulator += elapsed;
  handlePressed();
  while (accumulator >= STEP) {
    step(STEP);
    accumulator -= STEP;
  }
  draw();
}

if (shotName) {
  stageShot(shotName);
}
requestAnimationFrame(frame);

// For the headless smoke test and curious players alike.
window.__game = { state: () => state, MISSIONS, startGame };

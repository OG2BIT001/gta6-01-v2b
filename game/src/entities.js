// Everything that moves: the player (on foot and driving), traffic,
// pedestrians, police, rival gang members and pickups — plus the shared
// physics (building collision, car handling) and the wanted system.
// Gameplay code talks to missions through state.events, a list of short
// strings ('theft', 'pedHit', 'rivalDown', ...) pushed as things happen.
import { WORLD, ROAD_W, AVENUES_X, STREETS_Y, PLAYER, CAR, HEAT, BAY } from './config.js';
import { nearestRoadPoint } from './city.js';
import { sparks, smoke, blood, floatText, addShake, splash } from './fx.js';
import { sfx } from './audio.js';

export const CAR_COLOURS = ['#c23b4e', '#3b6dc2', '#3fae6a', '#d8d3c8', '#2e2e33', '#e0a32e', '#7a4fc2', '#2ea8b8', '#b86a32', '#8f9aa6'];
export const PED_COLOURS = ['#d9a05b', '#5b8dd9', '#d95b7a', '#5bd97e', '#c8c8c8', '#8a5bd9', '#d9d35b', '#5bd0d9'];

let nextId = 1;

export function makePlayer(x, y) {
  return {
    x, y, angle: -Math.PI / 2, vx: 0, vy: 0,
    health: PLAYER.maxHealth, armour: 0,
    car: null, walk: 0, fireCd: 0, stepCd: 0, muzzleA: 0,
  };
}

export function makeCar(x, y, angle, colour, kind = 'civil') {
  return {
    id: nextId++, x, y, angle, speed: 0, colour, kind,
    health: 100, driver: null, parked: false, locked: false,
    ai: null, smokeCd: 0, hornCd: 0, sirenPhase: Math.random() * 6,
  };
}

export function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function inWater(x, y) {
  return x > BAY.x && y > BAY.y;
}

// Circle-vs-rectangle collision against building/piers; pushes the circle
// out along the smallest penetration axis. Returns true when it hit.
export function collideBuildings(solids, x, y, r) {
  let hit = false;
  let px = x;
  let py = y;
  for (const b of solids) {
    if (px + r < b.x || px - r > b.x + b.w || py + r < b.y || py - r > b.y + b.h) continue;
    const cx = Math.max(b.x, Math.min(px, b.x + b.w));
    const cy = Math.max(b.y, Math.min(py, b.y + b.h));
    const dx = px - cx;
    const dy = py - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 > r * r) continue;
    hit = true;
    if (d2 > 0.0001) {
      const d = Math.sqrt(d2);
      px = cx + (dx / d) * r;
      py = cy + (dy / d) * r;
    } else {
      // Centre inside the rect: leave by the nearest face.
      const left = px - b.x;
      const right = b.x + b.w - px;
      const top = py - b.y;
      const bottom = b.y + b.h - py;
      const m = Math.min(left, right, top, bottom);
      if (m === left) px = b.x - r;
      else if (m === right) px = b.x + b.w + r;
      else if (m === top) py = b.y - r;
      else py = b.y + b.h + r;
    }
  }
  return { x: px, y: py, hit };
}

function clampWorld(o, r) {
  o.x = Math.max(r, Math.min(WORLD.w - r, o.x));
  o.y = Math.max(r, Math.min(WORLD.h - r, o.y));
}

// ---------------------------------------------------------------- heat
export function addHeat(state, amount, why) {
  const before = Math.floor(state.heat);
  state.heat = Math.min(HEAT.max, state.heat + amount);
  const after = Math.floor(state.heat);
  if (after > before && after >= 1) {
    sfx.star();
    floatText(state.player.x, state.player.y - 34, '★'.repeat(after), '#ffd34d');
  }
  if (why) state.events.push(why);
}

// Any police unit with line of sight refreshes the "seen" clock; heat only
// decays while unseen.
export function policeCanSee(state) {
  const p = state.player;
  for (const cop of state.cops) {
    if (dist2(cop.car.x, cop.car.y, p.x, p.y) < 460 * 460) return true;
  }
  return false;
}

// ---------------------------------------------------------------- traffic
const TRAFFIC_TARGET = 26;
const PARKED_TARGET = 34;

export function spawnTrafficCar(state, anywhere = false) {
  const rng = state.rng;
  const vertical = rng() < 0.55;
  const laneSign = rng() < 0.5 ? 1 : -1;
  let x;
  let y;
  if (anywhere || rng() < 0.4) {
    x = 200 + rng() * (WORLD.w - 400);
    y = 200 + rng() * (WORLD.h - 400);
    const rp = nearestRoadPoint(x, y);
    x = rp.x; y = rp.y;
  } else {
    // Spawn just outside the camera view so cars never pop in.
    const a = rng() * Math.PI * 2;
    x = state.player.x + Math.cos(a) * 900;
    y = state.player.y + Math.sin(a) * 900;
    const rp = nearestRoadPoint(x, y);
    x = rp.x; y = rp.y;
  }
  if (x < 60 || y < 60 || x > WORLD.w - 60 || y > WORLD.h - 60 || inWater(x, y)) return;
  const lane = laneSign * ROAD_W * 0.24;
  const car = makeCar(x, y, 0, CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)]);
  if (vertical) {
    car.x += lane;
    car.angle = laneSign > 0 ? Math.PI / 2 : -Math.PI / 2;
    car.ai = { axis: 'y', dir: laneSign, speed: 150 + rng() * 130 };
  } else {
    car.y += lane;
    car.angle = laneSign > 0 ? 0 : Math.PI;
    car.ai = { axis: 'x', dir: laneSign, speed: 150 + rng() * 130 };
  }
  car.driver = { civilian: true };
  state.cars.push(car);
}

export function spawnParkedCars(state) {
  const rng = state.rng;
  let tries = 0;
  while (state.cars.filter(c => c.parked).length < PARKED_TARGET && tries < 300) {
    tries += 1;
    const x = 150 + rng() * (WORLD.w - 300);
    const y = 150 + rng() * (WORLD.h - 300);
    if (inWater(x, y)) continue;
    const rp = nearestRoadPoint(x, y);
    const vertical = rp.x !== x;
    const car = makeCar(rp.x, rp.y, 0, CAR_COLOURS[Math.floor(rng() * CAR_COLOURS.length)]);
    const side = rng() < 0.5 ? 1 : -1;
    if (vertical) {
      car.x += side * (ROAD_W / 2 - 26);
      car.angle = Math.PI / 2;
    } else {
      car.y += side * (ROAD_W / 2 - 26);
      car.angle = 0;
    }
    car.parked = true;
    // Keep the spawn block and mission spots clear of parked cars.
    if (dist2(car.x, car.y, state.player.x, state.player.y) < 200 * 200) continue;
    state.cars.push(car);
  }
}

function trafficStep(state, car, dt) {
  const ai = car.ai;
  // Slow for the car ahead.
  let target = ai.speed;
  for (const other of state.cars) {
    if (other === car) continue;
    const aheadX = car.x + Math.cos(car.angle) * 66;
    const aheadY = car.y + Math.sin(car.angle) * 66;
    if (dist2(other.x, other.y, aheadX, aheadY) < 40 * 40) target = Math.min(target, 30);
  }
  const p = state.player;
  const aheadX = car.x + Math.cos(car.angle) * 70;
  const aheadY = car.y + Math.sin(car.angle) * 70;
  if (!p.car && dist2(p.x, p.y, aheadX, aheadY) < 44 * 44) target = 0;
  car.speed += (target - car.speed) * Math.min(1, dt * 2.2);
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const nearX = AVENUES_X.some(rx => Math.abs(car.x - rx) < 8);
  const nearY = STREETS_Y.some(ry => Math.abs(car.y - ry) < 8);
  if ((ai.axis === 'y' && nearY) || (ai.axis === 'x' && nearX)) {
    if (state.rng() < 0.012) {
      const dir = state.rng() < 0.5 ? 1 : -1;
      if (ai.axis === 'y') {
        ai.axis = 'x'; ai.dir = dir;
        car.angle = dir > 0 ? 0 : Math.PI;
      } else {
        ai.axis = 'y'; ai.dir = dir;
        car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
      }
    }
  }
  clampWorld(car, 20);
  if (inWater(car.x, car.y)) car.health = 0;
}

// ---------------------------------------------------------------- peds
const PED_TARGET = 30;

export function spawnPed(state) {
  const rng = state.rng;
  const x = 150 + rng() * (WORLD.w - 300);
  const y = 150 + rng() * (WORLD.h - 300);
  if (inWater(x, y)) return;
  const rp = nearestRoadPoint(x, y);
  const vertical = rp.x !== x;
  state.peds.push({
    id: nextId++, x: rp.x + (vertical ? (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14) : (rng() - 0.5) * 40),
    y: rp.y + (vertical ? (rng() - 0.5) * 40 : (rng() < 0.5 ? -1 : 1) * (ROAD_W / 2 + 14)),
    angle: rng() * Math.PI * 2, speed: 40 + rng() * 45,
    colour: PED_COLOURS[Math.floor(rng() * PED_COLOURS.length)],
    skin: ['#f2c79b', '#c68850', '#8a5a33', '#6e4525'][Math.floor(rng() * 4)],
    walk: rng() * 6, flee: 0, dead: false, turnCd: rng() * 3,
  });
}

function pedStep(state, ped, dt) {
  if (ped.dead) return;
  ped.turnCd -= dt;
  const p = state.player;
  const threat = (p.car && Math.abs(p.car.speed) > 120 && dist2(ped.x, ped.y, p.x, p.y) < 130 * 130)
    || (state.gunfireAt > state.time - 1.2 && dist2(ped.x, ped.y, p.x, p.y) < 320 * 320);
  if (threat) ped.flee = 1.2;
  if (ped.flee > 0) {
    ped.flee -= dt;
    ped.angle = Math.atan2(ped.y - p.y, ped.x - p.x);
    ped.speed = 205;
  } else if (ped.turnCd <= 0) {
    ped.turnCd = 2 + state.rng() * 4;
    ped.angle += (state.rng() - 0.5) * 1.6;
    ped.speed = 40 + state.rng() * 45;
  }
  const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
  const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
  const res = collideBuildings(state.solids, nx, ny, 10);
  if (res.hit) ped.angle += Math.PI * 0.7;
  ped.x = res.x; ped.y = res.y;
  ped.walk += dt * (ped.speed / 22);
  clampWorld(ped, 12);
  if (inWater(ped.x, ped.y)) { ped.x -= Math.cos(ped.angle) * 30; ped.y -= Math.sin(ped.angle) * 30; }
}

// ---------------------------------------------------------------- player
export function nearestEnterableCar(state, maxD = 64) {
  const p = state.player;
  let best = null;
  let bestD = maxD * maxD;
  for (const car of state.cars) {
    if (car.health <= 0) continue;
    const d = dist2(car.x, car.y, p.x, p.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

export function enterCar(state, car) {
  const p = state.player;
  p.car = car;
  car.parked = false;
  car.ai = null;
  if (car.driver && car.driver.civilian) {
    // The driver bails out and runs.
    state.peds.push({
      id: nextId++, x: car.x + 20, y: car.y + 10, angle: Math.random() * 6.28,
      speed: 200, colour: PED_COLOURS[0], skin: '#c68850', walk: 0, flee: 2.5, dead: false, turnCd: 3,
    });
    car.driver = null;
    addHeat(state, HEAT.theft, 'theft');
  }
  sfx.door();
}

export function exitCar(state) {
  const p = state.player;
  if (!p.car) return;
  const car = p.car;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
  const res = collideBuildings(state.solids, p.x, p.y, PLAYER.radius);
  p.x = res.x; p.y = res.y;
  p.car = null;
  sfx.door();
}

export function damagePlayer(state, amount) {
  const p = state.player;
  if (state.godMode) return;
  let left = amount;
  if (p.armour > 0) {
    const absorbed = Math.min(p.armour, left * 0.7);
    p.armour -= absorbed;
    left -= absorbed;
  }
  p.health -= left;
  sfx.hurt();
  if (p.health <= 0 && !state.over) {
    p.health = 0;
    state.over = 'wasted';
    state.events.push('wasted');
  }
}

function driveStep(state, dt, input) {
  const p = state.player;
  const car = p.car;
  const fwd = input.up ? 1 : 0;
  const back = input.down ? 1 : 0;
  if (fwd) car.speed += CAR.accel * dt * (1 - Math.max(0, car.speed) / 560);
  if (back) {
    if (car.speed > 12) car.speed -= CAR.brake * dt;
    else car.speed = Math.max(-CAR.reverse, car.speed - CAR.accel * 0.6 * dt);
  }
  car.speed -= car.speed * CAR.drag * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 26 * dt);
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (steer !== 0 && Math.abs(car.speed) > 4) {
    car.angle += steer * Math.min(1, Math.abs(car.speed) / 130) * CAR.grip * 0.42 * dt * Math.sign(car.speed);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const res = collideBuildings(state.solids, nx, ny, CAR.radius);
  if (res.hit && Math.abs(car.speed) > 90) {
    sparks(car.x, car.y, 12);
    sfx.crash(Math.abs(car.speed) > 260);
    addShake(Math.min(9, Math.abs(car.speed) / 45));
    car.health -= Math.abs(car.speed) * 0.045;
    damagePlayer(state, Math.abs(car.speed) * 0.012);
  }
  if (res.hit) car.speed *= 0.35;
  car.x = res.x; car.y = res.y;
  clampWorld(car, 22);
  p.x = car.x; p.y = car.y; p.angle = car.angle;

  // Running over peds and rivals, and bumping other cars.
  for (const ped of state.peds) {
    if (ped.dead) continue;
    if (Math.abs(car.speed) > 55 && dist2(ped.x, ped.y, car.x, car.y) < 30 * 30) {
      ped.dead = true;
      blood(ped.x, ped.y, 10);
      sfx.hit();
      addShake(3);
      addHeat(state, HEAT.hitPed, 'pedHit');
      state.events.push('pedDown');
    }
  }
  for (const car2 of state.cars) {
    if (car2 === car) continue;
    if (dist2(car2.x, car2.y, car.x, car.y) < 36 * 36) {
      const push = Math.atan2(car2.y - car.y, car2.x - car.x);
      car2.x += Math.cos(push) * 3;
      car2.y += Math.sin(push) * 3;
      if (Math.abs(car.speed) > 110) {
        sparks(car2.x, car2.y, 8);
        sfx.crash(false);
        car2.health -= Math.abs(car.speed) * 0.06;
        addHeat(state, HEAT.hitCar, 'carHit');
      }
      car.speed *= 0.82;
    }
  }
  if (inWater(car.x, car.y)) {
    splash(car.x, car.y, 14);
    car.health -= 60 * dt;
    if (car.health <= 0) { exitCar(state); }
  }
  if (car.health < 45) {
    car.smokeCd -= dt;
    if (car.smokeCd <= 0) { car.smokeCd = 0.12; smoke(car.x, car.y, 2, car.health < 22); }
  }
  if (car.health <= 0 && p.car) {
    smoke(car.x, car.y, 16, true);
    exitCar(state);
    state.events.push('carWrecked');
  }
}

function footStep(state, dt, input) {
  const p = state.player;
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
  const moving = mx !== 0 || my !== 0;
  const speed = input.sprint ? PLAYER.sprintSpeed : PLAYER.footSpeed;
  if (moving) {
    const len = Math.hypot(mx, my);
    mx /= len; my /= len;
    p.angle = Math.atan2(my, mx);
    p.walk += dt * (speed / 24);
    p.stepCd -= dt;
    if (p.stepCd <= 0) { p.stepCd = speed > 250 ? 0.24 : 0.34; sfx.step(); }
  }
  const res = collideBuildings(state.solids, p.x + mx * speed * dt, p.y + my * speed * dt, PLAYER.radius);
  p.x = res.x; p.y = res.y;
  clampWorld(p, 14);
  if (inWater(p.x, p.y)) { p.x -= mx * 20; p.y -= my * 20; }
}

// Shooting: hitscan toward the aim point. Works on foot and (drive-by)
// from a car at reduced accuracy.
export function tryShoot(state, aimX, aimY) {
  const p = state.player;
  if (p.fireCd > 0 || state.over) return;
  p.fireCd = 0.19;
  state.gunfireAt = state.time;
  const a = Math.atan2(aimY - p.y, aimX - p.x);
  p.muzzleA = a;
  const mx = p.x + Math.cos(a) * 20;
  const my = p.y + Math.sin(a) * 20;
  // Muzzle flash + sound come from fx/audio (imported lazily to avoid a cycle).
  state.events.push('shotFired');
  state.shotFx.push({ x: mx, y: my, angle: a });
  sfx.shot();
  addHeat(state, HEAT.shot * 0.4, null);

  const spread = p.car ? 0.09 : 0.028;
  const ang = a + (Math.random() - 0.5) * spread;
  const RANGE = 430;
  let bestT = RANGE;
  let target = null;
  let targetKind = null;
  const test = (o, r, kind) => {
    const dx = o.x - p.x;
    const dy = o.y - p.y;
    const t = dx * Math.cos(ang) + dy * Math.sin(ang);
    if (t < 10 || t > bestT) return;
    const perp = Math.abs(-dx * Math.sin(ang) + dy * Math.cos(ang));
    if (perp < r) { bestT = t; target = o; targetKind = kind; }
  };
  for (const r of state.rivals) if (!r.dead) test(r, 15, 'rival');
  for (const ped of state.peds) if (!ped.dead) test(ped, 13, 'ped');
  for (const cop of state.cops) test(cop.car, 24, 'copcar');
  for (const car of state.cars) if (car !== p.car) test(car, 24, 'car');

  const endX = p.x + Math.cos(ang) * bestT;
  const endY = p.y + Math.sin(ang) * bestT;
  state.shotFx.push({ tracer: true, x: mx, y: my, x2: endX, y2: endY });
  if (!target) return;
  sparks(endX, endY, 4, '#ffe9a3');
  if (targetKind === 'rival') {
    target.health -= 34;
    blood(endX, endY, 5);
    if (target.health <= 0 && !target.dead) {
      target.dead = true;
      state.events.push('rivalDown');
      addHeat(state, HEAT.killRival, null);
      dropCash(state, target.x, target.y, 40 + Math.floor(Math.random() * 60));
    }
  } else if (targetKind === 'ped') {
    target.dead = true;
    blood(endX, endY, 8);
    addHeat(state, HEAT.hitPed, 'pedHit');
    state.events.push('pedDown');
  } else if (targetKind === 'copcar') {
    target.health -= 9;
    addHeat(state, 0.5, null);
  } else if (targetKind === 'car') {
    target.health -= 7;
    if (target.driver && target.driver.civilian) {
      target.ai = null;
      target.parked = true;
    }
  }
}

export function dropCash(state, x, y, amount) {
  state.pickups.push({ x, y, kind: 'cash', amount, bob: Math.random() * 6 });
}

// ---------------------------------------------------------------- police
export function wantedStars(state) {
  return Math.floor(state.heat);
}

function desiredCops(state) {
  const stars = wantedStars(state);
  return [0, 2, 3, 4, 6, 8][stars] || 0;
}

function spawnCop(state) {
  const p = state.player;
  const a = Math.random() * Math.PI * 2;
  const d = 780 + Math.random() * 200;
  let x = p.x + Math.cos(a) * d;
  let y = p.y + Math.sin(a) * d;
  const rp = nearestRoadPoint(Math.max(60, Math.min(WORLD.w - 60, x)), Math.max(60, Math.min(WORLD.h - 60, y)));
  x = rp.x; y = rp.y;
  if (inWater(x, y)) return;
  const car = makeCar(x, y, Math.atan2(p.y - y, p.x - x), '#e8ecf2', 'cop');
  car.health = 130;
  state.cars.push(car);
  state.cops.push({ car, shootCd: 1 + Math.random(), bust: 0 });
}

function copStep(state, cop, dt) {
  const p = state.player;
  const car = cop.car;
  const target = p;
  const dx = target.x - car.x;
  const dy = target.y - car.y;
  const dist = Math.hypot(dx, dy);
  const wantAngle = Math.atan2(dy, dx);
  let diff = wantAngle - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  const topSpeed = p.car ? 505 : 300;
  const speedTarget = dist > 60 ? topSpeed : dist * 1.4;
  car.angle += Math.max(-2.6 * dt, Math.min(2.6 * dt, diff * 2.2 * dt * 3));
  car.speed += (speedTarget - car.speed) * Math.min(1, dt * 1.6);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  const res = collideBuildings(state.solids, nx, ny, CAR.radius);
  if (res.hit) car.speed *= 0.4;
  car.x = res.x; car.y = res.y;
  clampWorld(car, 22);

  // Busted meter: a cop right beside a slow or on-foot player fills it.
  const playerSlow = !p.car || Math.abs(p.car.speed) < 26;
  if (dist < 74 && playerSlow && !state.over) {
    cop.bust += dt;
    state.bustProgress = Math.max(state.bustProgress || 0, cop.bust / 2.6);
    if (cop.bust > 2.6) {
      state.over = 'busted';
      state.events.push('busted');
    }
  } else {
    cop.bust = Math.max(0, cop.bust - dt * 1.4);
    if (cop === state.cops[0]) state.bustProgress = Math.max(0, (state.bustProgress || 0) - dt * 0.5);
  }

  // At 3+ stars, cops shoot at a player on foot or in a slow car.
  cop.shootCd -= dt;
  if (wantedStars(state) >= 3 && dist < 300 && cop.shootCd <= 0 && !state.over) {
    cop.shootCd = 0.55 + Math.random() * 0.5;
    state.shotFx.push({ tracer: true, x: car.x, y: car.y, x2: p.x + (Math.random() - 0.5) * 30, y2: p.y + (Math.random() - 0.5) * 30, hostile: true });
    sfx.shot();
    if (Math.random() < 0.42) damagePlayer(state, 4 + Math.random() * 5);
  }
  if (car.health <= 0) {
    smoke(car.x, car.y, 10, true);
    state.events.push('copDown');
    addHeat(state, 0.6, null);
    removeCop(state, cop);
  }
}

function removeCop(state, cop) {
  state.cops = state.cops.filter(c => c !== cop);
  state.cars = state.cars.filter(c => c !== cop.car);
}

// ---------------------------------------------------------------- rivals
export function spawnRival(state, x, y, opts = {}) {
  const rival = {
    id: nextId++, x, y, angle: Math.random() * 6.28, health: opts.health || 100,
    dead: false, walk: Math.random() * 6, shootCd: 1 + Math.random() * 1.5,
    strafe: Math.random() < 0.5 ? 1 : -1, guard: opts.guard || null,
  };
  state.rivals.push(rival);
  return rival;
}

function rivalStep(state, r, dt) {
  if (r.dead) return;
  const p = state.player;
  const d = Math.hypot(p.x - r.x, p.y - r.y);
  const hostile = state.rivalsHostile || (r.guard && state.events.includes('alarm'));
  if (hostile && d < 430 && !state.over) {
    // Keep a firing distance, strafing sideways.
    const toP = Math.atan2(p.y - r.y, p.x - r.x);
    let moveA = null;
    if (d > 190) moveA = toP;
    else if (d < 120) moveA = toP + Math.PI;
    else moveA = toP + Math.PI / 2 * r.strafe;
    if (moveA !== null) {
      const res = collideBuildings(state.solids, r.x + Math.cos(moveA) * 120 * dt, r.y + Math.sin(moveA) * 120 * dt, 12);
      r.x = res.x; r.y = res.y;
      r.angle = toP;
      r.walk += dt * 5;
    }
    r.shootCd -= dt;
    if (r.shootCd <= 0 && d < 380) {
      r.shootCd = 0.8 + Math.random() * 0.9;
      state.shotFx.push({ tracer: true, x: r.x, y: r.y, x2: p.x + (Math.random() - 0.5) * 44, y2: p.y + (Math.random() - 0.5) * 44, hostile: true });
      sfx.shot();
      if (Math.random() < 0.34) damagePlayer(state, 3 + Math.random() * 5);
    }
  } else if (r.guard) {
    // Idle guard: slow patrol around the post.
    r.walk += dt * 2;
    const gx = r.guard.x + Math.cos(state.time * 0.24 + r.id) * 46;
    const gy = r.guard.y + Math.sin(state.time * 0.24 + r.id) * 46;
    r.x += (gx - r.x) * dt * 1.4;
    r.y += (gy - r.y) * dt * 1.4;
    r.angle = Math.atan2(gy - r.y, gx - r.x);
  }
}

// ---------------------------------------------------------------- pickups
export function spawnWorldPickups(state) {
  const P = state.city.places;
  state.pickups.push(
    { x: P.hospital.x + 40, y: P.hospital.y + 66, kind: 'health', amount: 60, bob: 0 },
    { x: P.spray1.x - 60, y: P.spray1.y + 60, kind: 'armour', amount: 50, bob: 2 },
    { x: P.beach.x, y: P.beach.y - 70, kind: 'health', amount: 40, bob: 4 },
    { x: P.docks.x - 80, y: P.docks.y + 40, kind: 'armour', amount: 50, bob: 1 },
  );
}

function pickupStep(state, dt) {
  const p = state.player;
  for (let i = state.pickups.length - 1; i >= 0; i -= 1) {
    const pk = state.pickups[i];
    pk.bob += dt * 3;
    if (dist2(pk.x, pk.y, p.x, p.y) > 34 * 34) continue;
    if (pk.kind === 'cash') {
      state.money += pk.amount;
      floatText(p.x, p.y - 30, `+$${pk.amount}`, '#4ade80');
      sfx.cash();
      state.pickups.splice(i, 1);
    } else if (pk.kind === 'health' && p.health < PLAYER.maxHealth) {
      p.health = Math.min(PLAYER.maxHealth, p.health + pk.amount);
      floatText(p.x, p.y - 30, '+HEALTH', '#f87171');
      sfx.pickup();
      state.pickups.splice(i, 1);
    } else if (pk.kind === 'armour' && p.armour < PLAYER.maxArmour) {
      p.armour = Math.min(PLAYER.maxArmour, p.armour + pk.amount);
      floatText(p.x, p.y - 30, '+ARMOUR', '#7dd3fc');
      sfx.pickup();
      state.pickups.splice(i, 1);
    }
  }
}

// ---------------------------------------------------------------- master update
export function updateEntities(state, dt, input) {
  const p = state.player;
  p.fireCd = Math.max(0, p.fireCd - dt);

  if (p.car) driveStep(state, dt, input);
  else footStep(state, dt, input);

  // Ambient population control.
  const trafficCount = state.cars.filter(c => c.ai).length;
  if (trafficCount < TRAFFIC_TARGET && state.rng() < 0.1) spawnTrafficCar(state);
  if (state.peds.length < PED_TARGET && state.rng() < 0.12) spawnPed(state);

  for (const car of state.cars) {
    if (car.ai) trafficStep(state, car, dt);
    // Cull traffic that wandered far away; never cull the player's ride.
    if (car.ai && dist2(car.x, car.y, p.x, p.y) > 1500 * 1500) car.health = -999;
  }
  // Culled traffic (health set to -999 above) is removed; wrecked cars stay
  // where they died as obstacles and set dressing.
  state.cars = state.cars.filter(c => c.health > -100);
  for (const ped of state.peds) pedStep(state, ped, dt);
  state.peds = state.peds.filter(ped => dist2(ped.x, ped.y, p.x, p.y) < 1600 * 1600 || ped.dead === false);
  if (state.peds.length > 46) state.peds.splice(0, state.peds.length - 46);

  // Wanted: spawn/despawn police, decay heat while unseen.
  const want = desiredCops(state);
  if (state.cops.length < want && state.rng() < 0.06 + wantedStars(state) * 0.02) spawnCop(state);
  if (state.cops.length > want) {
    const far = state.cops[state.cops.length - 1];
    if (far && dist2(far.car.x, far.car.y, p.x, p.y) > 500 * 500) removeCop(state, far);
  }
  for (const cop of [...state.cops]) copStep(state, cop, dt);
  if (!policeCanSee(state) && wantedStars(state) > 0) {
    state.heat = Math.max(0, state.heat - HEAT.decayPerSec * dt * (wantedStars(state) >= 4 ? 0.55 : 1));
    if (state.heat < 0.02) state.heat = 0;
  }

  for (const r of state.rivals) rivalStep(state, r, dt);
  pickupStep(state, dt);
}

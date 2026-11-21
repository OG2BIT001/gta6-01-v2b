// Particles, floating text, screen shake and weather. One pooled particle
// list the world updates and the renderer draws; effects are spawned with
// the helpers at the bottom so gameplay code never touches the pool.

export const fx = {
  parts: [],
  texts: [],
  shake: 0,
  flashes: [],
};

export function resetFx() {
  fx.parts.length = 0;
  fx.texts.length = 0;
  fx.flashes.length = 0;
  fx.shake = 0;
}

function spawn(x, y, vx, vy, life, size, colour, drag, grav, shrink) {
  if (fx.parts.length > 900) return;
  fx.parts.push({ x, y, vx, vy, life, maxLife: life, size, colour, drag, grav, shrink });
}

export function sparks(x, y, n = 10, colour = '#ffd34d') {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 260;
    spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.25 + Math.random() * 0.3, 2.4, colour, 3, 0, true);
  }
}

export function smoke(x, y, n = 6, dark = false) {
  for (let i = 0; i < n; i += 1) {
    spawn(x + (Math.random() - 0.5) * 8, y + (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 30, -20 - Math.random() * 40,
      0.7 + Math.random() * 0.8, 6 + Math.random() * 8, dark ? 'rgba(40,40,44,0.5)' : 'rgba(200,200,205,0.45)', 1.2, -30, false);
  }
}

export function muzzle(x, y, angle) {
  spawn(x, y, Math.cos(angle) * 60, Math.sin(angle) * 60, 0.06, 7, '#ffe9a3', 0, 0, true);
  fx.flashes.push({ x, y, r: 26, life: 0.06 });
}

export function blood(x, y, n = 6) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 30 + Math.random() * 130;
    spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3 + Math.random() * 0.25, 3, '#b3273a', 4, 0, true);
  }
}

export function splash(x, y, n = 8) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 40 + Math.random() * 120;
    spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.3, 2.4, '#7fd4f2', 2, 300, true);
  }
}

export function confetti(x, y, n = 40) {
  const colours = ['#ff4fa3', '#22d3ee', '#facc15', '#4ade80', '#a78bfa'];
  for (let i = 0; i < n; i += 1) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
    const s = 180 + Math.random() * 320;
    spawn(x, y, Math.cos(a) * s, Math.sin(a) * s, 1 + Math.random() * 0.9, 3.4,
      colours[i % colours.length], 1.4, 420, false);
  }
}

export function floatText(x, y, text, colour = '#ffffff') {
  fx.texts.push({ x, y, text, colour, life: 1.4 });
}

export function addShake(amount) {
  fx.shake = Math.min(16, fx.shake + amount);
}

// Weather state machine: clear spells and rain spells alternate; rain also
// feeds the renderer's streaks and the audio's rain loop.
export const weather = {
  raining: false,
  timer: 40,
  wetness: 0,
};

export function updateWeather(dt) {
  weather.timer -= dt;
  if (weather.timer <= 0) {
    weather.raining = !weather.raining;
    weather.timer = weather.raining ? 35 + Math.random() * 40 : 55 + Math.random() * 60;
  }
  const target = weather.raining ? 1 : 0;
  weather.wetness += (target - weather.wetness) * Math.min(1, dt * 0.4);
}

export function updateFx(dt) {
  const parts = fx.parts;
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    p.vx -= p.vx * p.drag * dt;
    p.vy -= p.vy * p.drag * dt;
    p.vy += p.grav * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  for (let i = fx.texts.length - 1; i >= 0; i -= 1) {
    const t = fx.texts[i];
    t.life -= dt;
    t.y -= 34 * dt;
    if (t.life <= 0) fx.texts.splice(i, 1);
  }
  for (let i = fx.flashes.length - 1; i >= 0; i -= 1) {
    fx.flashes[i].life -= dt;
    if (fx.flashes[i].life <= 0) fx.flashes.splice(i, 1);
  }
  fx.shake = Math.max(0, fx.shake - dt * 26);
}

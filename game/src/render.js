// Drawing: the city from above, then the HUD, then the screens. The world
// is drawn around a camera that follows the player with a little look-ahead
// toward the direction of travel; a day/night tint and rain sit on top.
// Everything is plain canvas paths — no images, no assets.
import { WORLD, ROAD_W, AVENUES_X, STREETS_Y, BAY, PALETTE, DISTRICT_STYLE } from './config.js';
import { districtAt } from './city.js';
import { fx, weather } from './fx.js';
import { wantedStars } from './entities.js';
import { currentObjective } from './missions.js';

export const SCREEN = { TITLE: 'title', PLAY: 'play', PAUSE: 'pause', OVER: 'over', VICTORY: 'victory' };

// 0 at midnight, 0.25 at dawn, 0.5 at noon, 0.75 at dusk.
export function daylight(dayT) {
  const sun = Math.sin((dayT - 0.25) * Math.PI * 2);
  return Math.max(0, Math.min(1, sun * 1.6 + 0.35));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, t) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  const L = 40;
  const W = 20;
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  roundRect(ctx, -L / 2 + 3, -W / 2 + 4, L, W, 6);
  ctx.fill();
  // Body
  ctx.fillStyle = car.health <= 0 ? '#26262a' : car.colour;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  if (car.kind === 'cop') {
    ctx.fillStyle = '#15181d';
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
    ctx.fillStyle = '#e8ecf2';
    roundRect(ctx, -L / 2 + 6, -W / 2 + 2, L - 12, W - 4, 4);
    ctx.fill();
  }
  if (car.kind === 'target') {
    ctx.fillStyle = '#596068';
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
    ctx.fillStyle = '#31363d';
    roundRect(ctx, -6, -W / 2 + 3, 16, W - 6, 3);
    ctx.fill();
  }
  // Cabin + windows
  ctx.fillStyle = 'rgba(16,22,32,0.9)';
  roundRect(ctx, -8, -W / 2 + 3.5, 17, W - 7, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(140,200,235,0.5)';
  roundRect(ctx, -6, -W / 2 + 4.5, 4, W - 9, 2);
  ctx.fill();
  // Headlights / tail lights
  ctx.fillStyle = '#fff6c9';
  ctx.fillRect(L / 2 - 2, -W / 2 + 2, 2.5, 4);
  ctx.fillRect(L / 2 - 2, W / 2 - 6, 2.5, 4);
  ctx.fillStyle = '#e33';
  ctx.fillRect(-L / 2 - 0.5, -W / 2 + 2, 2.5, 4);
  ctx.fillRect(-L / 2 - 0.5, W / 2 - 6, 2.5, 4);
  if (car.kind === 'cop') {
    const phase = Math.floor(t * 6 + car.sirenPhase) % 2;
    ctx.fillStyle = phase ? '#ff3b30' : '#3b82f6';
    roundRect(ctx, -4, -4, 9, 8, 2);
    ctx.fill();
  }
  // Damage smoke is handled by particles; a scorched tint shows heavy damage.
  if (car.health < 30 && car.health > 0) {
    ctx.fillStyle = 'rgba(20,20,20,0.35)';
    roundRect(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
  }
  ctx.restore();
}

function drawPerson(ctx, x, y, angle, colour, skin, walk, opts = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(1.5, 2.5, 10, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  const stride = Math.sin(walk * 6) * 3.4;
  ctx.strokeStyle = '#26221f';
  ctx.lineWidth = 4.4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(angle + 2.6) * 8 + Math.cos(angle) * stride * 0.4, Math.sin(angle + 2.6) * 8 + Math.sin(angle) * stride * 0.4);
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(angle - 2.6) * 8 - Math.cos(angle) * stride * 0.4, Math.sin(angle - 2.6) * 8 - Math.sin(angle) * stride * 0.4);
  ctx.stroke();
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(0, 0, 8.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(Math.cos(angle) * 2.4, Math.sin(angle) * 2.4, 4.6, 0, Math.PI * 2);
  ctx.fill();
  if (opts.gun) {
    ctx.strokeStyle = '#151515';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
    ctx.lineTo(Math.cos(angle) * 17, Math.sin(angle) * 17);
    ctx.stroke();
  }
  if (opts.marker) {
    ctx.fillStyle = opts.marker;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(-6, -30);
    ctx.lineTo(6, -30);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawWorld(ctx, state, viewW, viewH) {
  const p = state.player;
  const t = state.time;
  const look = p.car ? Math.min(1, Math.abs(p.car.speed) / 500) : 0;
  const camX = p.x + (p.car ? Math.cos(p.car.angle) * 90 * look : 0);
  const camY = p.y + (p.car ? Math.sin(p.car.angle) * 90 * look : 0);
  const shX = (Math.random() - 0.5) * fx.shake;
  const shY = (Math.random() - 0.5) * fx.shake;
  const x0 = camX - viewW / 2 + shX;
  const y0 = camY - viewH / 2 + shY;
  const x1 = x0 + viewW;
  const y1 = y0 + viewH;
  const dl = daylight(state.dayT);
  const night = 1 - dl;

  ctx.save();
  ctx.translate(-x0, -y0);

  // District ground — big tinted slabs under everything.
  const slab = 800;
  for (let gx = Math.floor(x0 / slab) * slab; gx < x1; gx += slab) {
    for (let gy = Math.floor(y0 / slab) * slab; gy < y1; gy += slab) {
      const d = districtAt(gx + slab / 2, gy + slab / 2);
      ctx.fillStyle = DISTRICT_STYLE[d].ground;
      ctx.fillRect(gx, gy, slab, slab);
    }
  }

  // The bay.
  const grad = ctx.createLinearGradient(BAY.x, BAY.y, BAY.x + BAY.w, BAY.y + BAY.h);
  grad.addColorStop(0, PALETTE.water);
  grad.addColorStop(1, PALETTE.waterDeep);
  ctx.fillStyle = grad;
  ctx.fillRect(BAY.x, BAY.y, BAY.w, BAY.h);
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  const wob = Math.sin(t * 0.9) * 8;
  for (let i = 0; i < 7; i += 1) {
    const wy = BAY.y + 90 + i * 170 + wob;
    ctx.beginPath();
    for (let wx = BAY.x + 30; wx < BAY.x + BAY.w - 30; wx += 60) {
      ctx.lineTo(wx, wy + Math.sin(wx * 0.01 + t + i) * 5);
    }
    ctx.stroke();
  }
  // Beach rim along the bay's west and north shore.
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(BAY.x - 26, BAY.y - 26, BAY.w + 26, 26);
  ctx.fillRect(BAY.x - 26, BAY.y, 26, BAY.h);

  // Open lots: car parks, plazas, green patches.
  for (const lot of state.city.lots) {
    if (lot.x + lot.w < x0 || lot.x > x1 || lot.y + lot.h < y0 || lot.y > y1) continue;
    ctx.fillStyle = lot.kind === 'green' ? '#47824b' : lot.kind === 'plaza' ? '#8d8578' : '#4c4f55';
    ctx.fillRect(lot.x, lot.y, lot.w, lot.h);
    if (lot.kind === 'park') {
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 2;
      for (let lx = lot.x + 18; lx < lot.x + lot.w - 10; lx += 34) {
        ctx.strokeRect(lx, lot.y + 14, 24, lot.h - 28);
      }
    }
  }

  // Roads: asphalt, then centre dashes.
  ctx.fillStyle = PALETTE.asphalt;
  for (const rx of AVENUES_X) ctx.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.h);
  for (const ry of STREETS_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, ROAD_W);
  ctx.fillStyle = PALETTE.asphaltDark;
  for (const rx of AVENUES_X) ctx.fillRect(rx - ROAD_W / 2, 0, 7, WORLD.h), ctx.fillRect(rx + ROAD_W / 2 - 7, 0, 7, WORLD.h);
  for (const ry of STREETS_Y) ctx.fillRect(0, ry - ROAD_W / 2, WORLD.w, 7), ctx.fillRect(0, ry + ROAD_W / 2 - 7, WORLD.w, 7);
  ctx.fillStyle = PALETTE.lane;
  for (const rx of AVENUES_X) {
    for (let y = 12; y < WORLD.h; y += 46) if (y > y0 - 50 && y < y1 + 50) ctx.fillRect(rx - 2, y, 4, 26);
  }
  for (const ry of STREETS_Y) {
    for (let x = 12; x < WORLD.w; x += 46) if (x > x0 - 50 && x < x1 + 50) ctx.fillRect(x, ry - 2, 26, 4);
  }
  // Crosswalks at intersections.
  ctx.fillStyle = 'rgba(240,240,240,0.5)';
  for (const rx of AVENUES_X) {
    for (const ry of STREETS_Y) {
      if (rx < x0 - 120 || rx > x1 + 120 || ry < y0 - 120 || ry > y1 + 120) continue;
      for (let s = -3; s <= 3; s += 1) {
        ctx.fillRect(rx - ROAD_W / 2 - 14, ry + s * 22 - 5, 10, 11);
        ctx.fillRect(rx + ROAD_W / 2 + 4, ry + s * 22 - 5, 10, 11);
      }
    }
  }

  // Piers.
  ctx.fillStyle = '#7a6a52';
  for (const pier of state.city.piers) ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
  ctx.fillStyle = '#5d5040';
  for (const pier of state.city.piers) ctx.fillRect(pier.x, pier.y, pier.w, 6);

  // Palms (under buildings' shadows but above ground).
  ctx.strokeStyle = '#6b5136';
  ctx.lineWidth = 3.4;
  for (const palm of state.city.palms) {
    if (palm.x < x0 - 30 || palm.x > x1 + 30 || palm.y < y0 - 30 || palm.y > y1 + 30) continue;
    ctx.beginPath();
    ctx.moveTo(palm.x, palm.y);
    ctx.lineTo(palm.x + 3, palm.y - 4);
    ctx.stroke();
    ctx.strokeStyle = '#3f8f4f';
    ctx.lineWidth = 2.6;
    for (let f = 0; f < 6; f += 1) {
      const a = (f / 6) * Math.PI * 2 + palm.s;
      ctx.beginPath();
      ctx.moveTo(palm.x + 3, palm.y - 4);
      ctx.quadraticCurveTo(palm.x + 3 + Math.cos(a) * 13 * palm.s, palm.y - 4 + Math.sin(a) * 9 * palm.s - 4,
        palm.x + 3 + Math.cos(a) * 20 * palm.s, palm.y - 4 + Math.sin(a) * 13 * palm.s + 3);
      ctx.stroke();
    }
    ctx.strokeStyle = '#6b5136';
    ctx.lineWidth = 3.4;
  }

  // Buildings: shadow, walls, roof detail, lit windows at night.
  for (const b of state.city.buildings) {
    if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
    const lift = b.tier * 7;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(b.x + lift + 5, b.y + lift + 7, b.w, b.h);
    ctx.fillStyle = b.colour;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(b.x, b.y, b.w, 7);
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(b.x, b.y + b.h - 7, b.w, 7);
    // Window grid — golden at night, glassy by day.
    const cols = Math.max(2, Math.floor(b.w / 30));
    const rows = Math.max(2, Math.floor(b.h / 30));
    for (let i = 0; i < cols; i += 1) {
      for (let j = 0; j < rows; j += 1) {
        const lit = ((i * 7 + j * 13 + b.windows) % 5) < (night > 0.45 ? 3 : 1);
        ctx.fillStyle = lit && night > 0.45 ? 'rgba(255,205,110,0.85)' : 'rgba(170,210,235,0.28)';
        ctx.fillRect(b.x + 9 + i * ((b.w - 18) / cols), b.y + 9 + j * ((b.h - 18) / rows), 9, 6);
      }
    }
    if (b.neon && night > 0.3) {
      ctx.save();
      ctx.shadowColor = b.neon;
      ctx.shadowBlur = 16;
      ctx.fillStyle = b.neon;
      ctx.fillRect(b.x + 6, b.y + 6, Math.min(64, b.w - 12), 6);
      ctx.restore();
    }
  }

  // Lamps (glow added in the night pass).
  ctx.fillStyle = '#2c2f33';
  for (const lamp of state.city.lamps) {
    if (lamp.x < x0 - 10 || lamp.x > x1 + 10 || lamp.y < y0 - 10 || lamp.y > y1 + 10) continue;
    ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
  }

  // Place signs: respray garages and the hospital get a floating sign so
  // players can find them without the minimap.
  const signs = [
    { at: state.city.places.spray1, bg: '#ff4fa3', glyph: 'R' },
    { at: state.city.places.spray2, bg: '#ff4fa3', glyph: 'R' },
    { at: state.city.places.spray3, bg: '#ff4fa3', glyph: 'R' },
    { at: state.city.places.hospital, bg: '#f2f2f2', glyph: '+' },
  ];
  for (const sign of signs) {
    const { x: sx2, y: sy2 } = sign.at;
    if (sx2 < x0 - 40 || sx2 > x1 + 40 || sy2 < y0 - 40 || sy2 > y1 + 40) continue;
    ctx.save();
    ctx.translate(sx2, sy2 - 6 + Math.sin(t * 2.2) * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, -13, -11, 26, 26, 6);
    ctx.fill();
    ctx.fillStyle = sign.bg;
    roundRect(ctx, -14, -14, 26, 26, 6);
    ctx.fill();
    ctx.fillStyle = sign.glyph === '+' ? '#e33' : '#fff';
    ctx.font = '900 17px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(sign.glyph, -1, 5);
    ctx.restore();
  }

  // Pickups.
  for (const pk of state.pickups) {
    if (pk.x < x0 - 30 || pk.x > x1 + 30 || pk.y < y0 - 30 || pk.y > y1 + 30) continue;
    const bob = Math.sin(pk.bob) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2f9e4f';
      roundRect(ctx, -11, -7, 22, 14, 3);
      ctx.fill();
      ctx.fillStyle = '#d9f7df';
      ctx.font = 'bold 10px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 3.5);
    } else if (pk.kind === 'health') {
      ctx.fillStyle = '#f2f2f2';
      roundRect(ctx, -10, -10, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#e33';
      ctx.fillRect(-2.5, -7, 5, 14);
      ctx.fillRect(-7, -2.5, 14, 5);
    } else {
      ctx.fillStyle = '#3b82c4';
      roundRect(ctx, -10, -10, 20, 20, 4);
      ctx.fill();
      ctx.fillStyle = '#eaf6ff';
      ctx.font = 'bold 11px system-ui';
      ctx.textAlign = 'center';
      ctx.fillText('A', 0, 4);
    }
    ctx.restore();
  }

  // Objective beacon.
  const obj = currentObjective(state);
  if (obj) {
    const pulse = 14 + Math.sin(t * 5) * 4;
    ctx.strokeStyle = obj.giver ? '#ff4fa3' : '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(obj.x, obj.y, pulse + 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = obj.giver ? '#ff4fa3' : '#facc15';
    ctx.beginPath();
    ctx.moveTo(obj.x, obj.y - 44 - Math.sin(t * 5) * 4);
    ctx.lineTo(obj.x - 9, obj.y - 60 - Math.sin(t * 5) * 4);
    ctx.lineTo(obj.x + 9, obj.y - 60 - Math.sin(t * 5) * 4);
    ctx.closePath();
    ctx.fill();
  }

  // Cars, peds, rivals, player.
  for (const car of state.cars) {
    if (car.x < x0 - 60 || car.x > x1 + 60 || car.y < y0 - 60 || car.y > y1 + 60) continue;
    drawCarShape(ctx, car, t);
  }
  for (const ped of state.peds) {
    if (ped.dead) {
      ctx.fillStyle = 'rgba(120,20,30,0.55)';
      ctx.beginPath();
      ctx.ellipse(ped.x, ped.y, 13, 9, ped.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (ped.x < x0 - 30 || ped.x > x1 + 30 || ped.y < y0 - 30 || ped.y > y1 + 30) continue;
    drawPerson(ctx, ped.x, ped.y, ped.angle, ped.colour, ped.skin, ped.walk);
  }
  for (const r of state.rivals) {
    if (r.x < x0 - 30 || r.x > x1 + 30 || r.y < y0 - 30 || r.y > y1 + 30) continue;
    if (r.dead) {
      ctx.fillStyle = 'rgba(120,20,30,0.55)';
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 13, 9, r.angle, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    drawPerson(ctx, r.x, r.y, r.angle, '#7a1f2b', '#c68850', r.walk, { gun: true, marker: '#e33' });
  }
  if (!p.car) {
    drawPerson(ctx, p.x, p.y, state.aimAngle !== undefined ? state.aimAngle : p.angle, '#f2f2f2', '#c68850', p.walk, { gun: state.aiming });
  } else {
    // A small marker over the player's own car so it is never lost in traffic.
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.moveTo(p.x, p.y - 34 - Math.sin(t * 5) * 3);
    ctx.lineTo(p.x - 6, p.y - 44 - Math.sin(t * 5) * 3);
    ctx.lineTo(p.x + 6, p.y - 44 - Math.sin(t * 5) * 3);
    ctx.closePath();
    ctx.fill();
  }

  // Tracers and muzzle flashes (short-lived, pushed by the combat code).
  for (const s of state.shotFx) {
    if (s.tracer) {
      ctx.strokeStyle = s.hostile ? 'rgba(255,90,80,0.85)' : 'rgba(255,230,150,0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x2, s.y2);
      ctx.stroke();
    }
  }

  // Particles and floating texts.
  for (const part of fx.parts) {
    const a = Math.max(0, part.life / part.maxLife);
    ctx.globalAlpha = a;
    ctx.fillStyle = part.colour;
    const size = part.shrink ? part.size * a : part.size;
    ctx.fillRect(part.x - size / 2, part.y - size / 2, size, size);
  }
  ctx.globalAlpha = 1;
  for (const f of fx.flashes) {
    const g2 = ctx.createRadialGradient(f.x, f.y, 2, f.x, f.y, f.r);
    g2.addColorStop(0, 'rgba(255,240,190,0.9)');
    g2.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g2;
    ctx.beginPath();
    ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.font = 'bold 15px system-ui';
  ctx.textAlign = 'center';
  for (const ft of fx.texts) {
    ctx.globalAlpha = Math.min(1, ft.life);
    ctx.fillStyle = ft.colour;
    ctx.fillText(ft.text, ft.x, ft.y);
  }
  ctx.globalAlpha = 1;

  // Night: darken, then cut light pools around lamps, cars and the player.
  if (night > 0.04) {
    ctx.fillStyle = `rgba(7,10,34,${(night * 0.52).toFixed(3)})`;
    ctx.fillRect(x0, y0, viewW, viewH);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pool = (lx, ly, r, alpha) => {
      const g3 = ctx.createRadialGradient(lx, ly, 4, lx, ly, r);
      g3.addColorStop(0, `rgba(255,214,140,${alpha})`);
      g3.addColorStop(1, 'rgba(255,214,140,0)');
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(lx, ly, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const lamp of state.city.lamps) {
      if (lamp.x < x0 - 90 || lamp.x > x1 + 90 || lamp.y < y0 - 90 || lamp.y > y1 + 90) continue;
      pool(lamp.x, lamp.y, 74, 0.13 * night);
    }
    pool(p.x, p.y, 150, 0.12 * night);
    if (p.car) {
      pool(p.x + Math.cos(p.car.angle) * 66, p.y + Math.sin(p.car.angle) * 66, 120, 0.15 * night);
    }
    ctx.restore();
  }

  // Rain streaks in view space.
  if (weather.wetness > 0.05) {
    ctx.strokeStyle = `rgba(174,214,241,${0.35 * weather.wetness})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 70 * weather.wetness; i += 1) {
      const rx = x0 + ((i * 173 + t * 640) % viewW);
      const ry = y0 + ((i * 311 + t * 900) % viewH);
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 4, ry + 13);
    }
    ctx.stroke();
    ctx.fillStyle = `rgba(20,40,60,${0.12 * weather.wetness})`;
    ctx.fillRect(x0, y0, viewW, viewH);
  }

  ctx.restore();

  // Off-screen objective arrow at the view edge.
  if (obj) {
    const sx = obj.x - x0;
    const sy = obj.y - y0;
    if (sx < 0 || sy < 0 || sx > viewW || sy > viewH) {
      const cx = viewW / 2;
      const cy = viewH / 2;
      const a = Math.atan2(sy - cy, sx - cx);
      const ex = cx + Math.cos(a) * (Math.min(viewW, viewH) / 2 - 46);
      const ey = cy + Math.sin(a) * (Math.min(viewW, viewH) / 2 - 46);
      ctx.save();
      ctx.translate(ex, ey);
      ctx.rotate(a);
      ctx.fillStyle = obj.giver ? '#ff4fa3' : '#facc15';
      ctx.beginPath();
      ctx.moveTo(16, 0);
      ctx.lineTo(-10, -10);
      ctx.lineTo(-10, 10);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
  return { x0, y0 };
}

// ------------------------------------------------------------ HUD
export function drawHUD(ctx, state, viewW, viewH) {
  const p = state.player;
  // Top-left: health + armour bars.
  const bx = 18;
  const by = 16;
  ctx.fillStyle = 'rgba(10,12,18,0.55)';
  roundRect(ctx, bx - 6, by - 6, 236, 64, 8);
  ctx.fill();
  ctx.fillStyle = '#3a3f47';
  roundRect(ctx, bx, by, 220, 13, 6);
  ctx.fill();
  ctx.fillStyle = p.health > 30 ? '#4ade80' : '#f87171';
  roundRect(ctx, bx, by, 220 * Math.max(0, p.health / 100), 13, 6);
  ctx.fill();
  ctx.fillStyle = '#3a3f47';
  roundRect(ctx, bx, by + 19, 220, 9, 5);
  ctx.fill();
  ctx.fillStyle = '#7dd3fc';
  roundRect(ctx, bx, by + 19, 220 * Math.max(0, p.armour / 100), 9, 5);
  ctx.fill();
  if (p.car) {
    ctx.fillStyle = '#3a3f47';
    roundRect(ctx, bx, by + 34, 220, 7, 4);
    ctx.fill();
    ctx.fillStyle = '#fbbf24';
    roundRect(ctx, bx, by + 34, 220 * Math.max(0, p.car.health / 100), 7, 4);
    ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(p.car ? 'HEALTH / ARMOUR / CAR' : 'HEALTH / ARMOUR', bx + 2, by + 55);

  // Top-right: money, clock, stars.
  ctx.textAlign = 'right';
  ctx.fillStyle = '#4ade80';
  ctx.font = 'bold 26px system-ui';
  ctx.fillText(`$${state.money.toLocaleString('en-US')}`, viewW - 20, 40);
  const mins = Math.floor(state.dayT * 24 * 60);
  const hh = String(Math.floor(mins / 60)).padStart(2, '0');
  const mm = String(mins % 60).padStart(2, '0');
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '15px system-ui';
  ctx.fillText(`${hh}:${mm}  ·  ${districtName(state)}`, viewW - 20, 62);
  const stars = wantedStars(state);
  ctx.font = '24px system-ui';
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#ffd34d' : 'rgba(255,255,255,0.22)';
    ctx.fillText('★', viewW - 24 - (4 - i) * 26, 92);
  }
  if (state.bustProgress > 0.02 && !state.over) {
    ctx.fillStyle = 'rgba(10,12,18,0.6)';
    roundRect(ctx, viewW - 190, 104, 170, 16, 8);
    ctx.fill();
    ctx.fillStyle = '#f87171';
    roundRect(ctx, viewW - 188, 106, 166 * Math.min(1, state.bustProgress), 12, 6);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui';
    ctx.fillText('BUSTED?', viewW - 105, 116);
  }

  // Speed, bottom-right.
  if (p.car) {
    const mph = Math.round(Math.abs(p.car.speed) * 0.22);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 30px system-ui';
    ctx.textAlign = 'right';
    ctx.fillText(`${mph}`, viewW - 52, viewH - 24);
    ctx.font = '12px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('mph', viewW - 20, viewH - 24);
  }

  // Objective line, top-centre.
  const obj = currentObjective(state);
  if (obj) {
    ctx.font = 'bold 16px system-ui';
    const w = ctx.measureText(obj.label).width + 30;
    ctx.fillStyle = 'rgba(10,12,18,0.55)';
    roundRect(ctx, viewW / 2 - w / 2, 14, w, 30, 8);
    ctx.fill();
    ctx.fillStyle = obj.giver ? '#ff8fc7' : '#fde68a';
    ctx.textAlign = 'center';
    ctx.fillText(obj.label, viewW / 2, 35);
  }
  if (state.mission) {
    ctx.font = '13px system-ui';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.fillText(state.mission.def.title, viewW / 2, 60);
  }
  if (state.hint) {
    ctx.font = 'bold 15px system-ui';
    ctx.fillStyle = '#fda4af';
    ctx.textAlign = 'center';
    ctx.fillText(state.hint, viewW / 2, viewH - 110);
  }
  drawMinimap(ctx, state, viewW, viewH);
}

function districtName(state) {
  return districtAt(state.player.x, state.player.y);
}

function drawMinimap(ctx, state, viewW, viewH) {
  const mw = 196;
  const mh = 147;
  const mx = viewW - mw - 16;
  const my = viewH - mh - 46;
  const sx = mw / WORLD.w;
  const sy = mh / WORLD.h;
  ctx.save();
  ctx.fillStyle = 'rgba(12,16,22,0.78)';
  roundRect(ctx, mx - 3, my - 3, mw + 6, mh + 6, 8);
  ctx.fill();
  ctx.beginPath();
  roundRect(ctx, mx, my, mw, mh, 6);
  ctx.clip();
  ctx.fillStyle = '#2e4630';
  ctx.fillRect(mx, my, mw, mh);
  ctx.fillStyle = PALETTE.waterDeep;
  ctx.fillRect(mx + BAY.x * sx, my + BAY.y * sy, BAY.w * sx, BAY.h * sy);
  ctx.strokeStyle = 'rgba(230,230,230,0.5)';
  ctx.lineWidth = 2;
  for (const rx of AVENUES_X) {
    ctx.beginPath(); ctx.moveTo(mx + rx * sx, my); ctx.lineTo(mx + rx * sx, my + mh); ctx.stroke();
  }
  for (const ry of STREETS_Y) {
    ctx.beginPath(); ctx.moveTo(mx, my + ry * sy); ctx.lineTo(mx + mw, my + ry * sy); ctx.stroke();
  }
  // Police blips.
  const blink = Math.floor(state.time * 3) % 2;
  for (const cop of state.cops) {
    ctx.fillStyle = blink ? '#ff3b30' : '#3b82f6';
    ctx.fillRect(mx + cop.car.x * sx - 2, my + cop.car.y * sy - 2, 4, 4);
  }
  const obj = currentObjective(state);
  if (obj) {
    ctx.fillStyle = obj.giver ? '#ff4fa3' : '#facc15';
    ctx.beginPath();
    ctx.arc(mx + obj.x * sx, my + obj.y * sy, 4.4, 0, Math.PI * 2);
    ctx.fill();
  }
  // Player arrow.
  const p = state.player;
  ctx.save();
  ctx.translate(mx + p.x * sx, my + p.y * sy);
  ctx.rotate(p.car ? p.car.angle : p.angle);
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(-4.4, -4);
  ctx.lineTo(-4.4, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.font = '10px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('CORAL BAY', mx + mw, my - 7);
}

// ------------------------------------------------------------ dialogue + screens
export function drawDialogue(ctx, state, viewW, viewH) {
  const line = state.dialogue && state.dialogue[0];
  if (!line) return;
  const w = Math.min(680, viewW - 60);
  const x = viewW / 2 - w / 2;
  const y = viewH - 118;
  ctx.fillStyle = 'rgba(8,10,16,0.82)';
  roundRect(ctx, x, y, w, 74, 10);
  ctx.fill();
  ctx.strokeStyle = line.who === 'Selene' ? '#ff4fa3' : '#22d3ee';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, 74, 10);
  ctx.stroke();
  ctx.fillStyle = line.who === 'Selene' ? '#ff8fc7' : '#7dd3fc';
  ctx.font = 'bold 13px system-ui';
  ctx.textAlign = 'left';
  ctx.fillText(line.who.toUpperCase(), x + 16, y + 22);
  ctx.fillStyle = '#f4f4f5';
  ctx.font = '15.5px system-ui';
  wrapText(ctx, line.text, x + 16, y + 44, w - 32, 19);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = '11px system-ui';
  ctx.textAlign = 'right';
  ctx.fillText('E ▸', x + w - 12, y + 66);
}

function wrapText(ctx, text, x, y, maxW, lh) {
  const words = text.split(' ');
  let line = '';
  let yy = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, yy);
      line = word;
      yy += lh;
    } else line = test;
  }
  if (line) ctx.fillText(line, x, yy);
}

function titleBackdrop(ctx, state, viewW, viewH) {
  // A slow pan across the Neon Mile at dusk for the menu background.
  const saved = { x: state.player.x, y: state.player.y, car: state.player.car };
  state.player.x = 4300 + Math.sin(state.time * 0.05) * 500;
  state.player.y = 2100 + Math.cos(state.time * 0.037) * 260;
  state.player.car = null;
  const savedDay = state.dayT;
  state.dayT = 0.79;
  drawWorld(ctx, state, viewW, viewH);
  state.dayT = savedDay;
  state.player.x = saved.x;
  state.player.y = saved.y;
  state.player.car = saved.car;
  ctx.fillStyle = 'rgba(10,6,24,0.42)';
  ctx.fillRect(0, 0, viewW, viewH);
}

export function drawTitle(ctx, state, viewW, viewH, hasSave) {
  titleBackdrop(ctx, state, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#ff4fa3';
  ctx.shadowBlur = 34;
  ctx.fillStyle = '#ff4fa3';
  ctx.font = '900 84px system-ui';
  ctx.fillText('NEON TIDE', viewW / 2, viewH * 0.3);
  ctx.restore();
  ctx.save();
  ctx.shadowColor = '#22d3ee';
  ctx.shadowBlur = 26;
  ctx.fillStyle = '#a5f3fc';
  ctx.font = '700 40px system-ui';
  ctx.fillText('C O R A L   B A Y', viewW / 2, viewH * 0.3 + 52);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '16px system-ui';
  ctx.fillText('An open-world crime story in a city of palms, neon and other people\u2019s cars.', viewW / 2, viewH * 0.3 + 86);
  const items = hasSave ? ['ENTER — Continue', 'N — New game', 'H — How to play'] : ['ENTER — New game', 'H — How to play'];
  ctx.font = 'bold 19px system-ui';
  items.forEach((item, i) => {
    ctx.fillStyle = i === 0 ? '#facc15' : 'rgba(255,255,255,0.8)';
    ctx.fillText(item, viewW / 2, viewH * 0.52 + i * 32);
  });
  if (state.showHelp) {
    const w = 620;
    const x = viewW / 2 - w / 2;
    const y = viewH * 0.62;
    ctx.fillStyle = 'rgba(8,10,16,0.88)';
    roundRect(ctx, x, y, w, 168, 10);
    ctx.fill();
    ctx.fillStyle = '#f4f4f5';
    ctx.font = '14.5px system-ui';
    ctx.textAlign = 'left';
    const lines = [
      'WASD / arrows — move & drive      SHIFT — sprint',
      'F — get in / out of a car          MOUSE — aim, CLICK — shoot',
      'E — talk / take a job / advance dialogue',
      'P or ESC — pause      M — mute',
      'Steal cars, run Selene\u2019s nine jobs, mind the stars.',
      'Respray garages (pink R signs) clear your heat for $200.',
    ];
    lines.forEach((ln, i) => ctx.fillText(ln, x + 22, y + 30 + i * 23));
    ctx.textAlign = 'center';
  }
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.font = '12px system-ui';
  ctx.fillText('Everything on screen and every sound is generated by the game itself. No assets, no network.', viewW / 2, viewH - 22);
}

export function drawPause(ctx, state, viewW, viewH) {
  ctx.fillStyle = 'rgba(5,6,12,0.66)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = '900 46px system-ui';
  ctx.fillText('PAUSED', viewW / 2, viewH * 0.38);
  ctx.font = '17px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText(`Jobs done: ${state.progress} / 9   ·   Money: $${state.money.toLocaleString('en-US')}`, viewW / 2, viewH * 0.38 + 42);
  ctx.fillText('P / ESC — resume      S — save now      Q — quit to title', viewW / 2, viewH * 0.38 + 76);
}

export function drawOver(ctx, state, viewW, viewH) {
  ctx.fillStyle = state.over === 'busted' ? 'rgba(10,16,40,0.62)' : 'rgba(40,4,8,0.62)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = state.over === 'busted' ? '#3b82f6' : '#e33';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#fff';
  ctx.font = '900 74px system-ui';
  ctx.fillText(state.over === 'busted' ? 'BUSTED' : 'WASTED', viewW / 2, viewH * 0.42);
  ctx.restore();
  ctx.font = '17px system-ui';
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  const sub = state.over === 'busted'
    ? 'The CBPD kept the car and $150 of your money. Selene pretends not to know you.'
    : 'Coral Bay General patched you up and billed you $150.';
  ctx.fillText(sub, viewW / 2, viewH * 0.42 + 44);
  ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = '#facc15';
  ctx.fillText('ENTER — back on the street', viewW / 2, viewH * 0.42 + 84);
}

export function drawVictory(ctx, state, viewW, viewH) {
  ctx.fillStyle = 'rgba(16,8,30,0.6)';
  ctx.fillRect(0, 0, viewW, viewH);
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#facc15';
  ctx.shadowBlur = 32;
  ctx.fillStyle = '#fde68a';
  ctx.font = '900 62px system-ui';
  ctx.fillText('CORAL BAY IS YOURS', viewW / 2, viewH * 0.4);
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.font = '17px system-ui';
  ctx.fillText('All nine jobs done. The ledger is at the bottom of the bay, and so is the old order.', viewW / 2, viewH * 0.4 + 42);
  ctx.fillText(`Final balance: $${state.money.toLocaleString('en-US')} — Selene still has courier work whenever you want it.`, viewW / 2, viewH * 0.4 + 68);
  ctx.font = 'bold 18px system-ui';
  ctx.fillStyle = '#4ade80';
  ctx.fillText('ENTER — keep driving', viewW / 2, viewH * 0.4 + 108);
}

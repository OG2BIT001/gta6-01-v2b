// Coral Bay's layout: districts, buildings, palms, lamps, docks and the
// garages. Pure data — buildCity(seed) returns everything the renderer and
// the physics need, and the same seed always builds the same city.
import { AVENUES_X, STREETS_Y, ROAD_W, WORLD, BAY, DISTRICT_STYLE } from './config.js';
import { makeRng, range, pick, chance } from './rng.js';

// Which district owns a point, by rough geography. The bay and its shore
// are handled first so nothing builds in the water.
export function districtAt(x, y) {
  if (x > BAY.x - 60 && y > BAY.y - 60) return 'The Docks';
  if (y > 3760) return x < 3000 ? 'Mercado' : 'South Beach';
  if (y < 1150) {
    if (x < 2100) return 'Old Town';
    if (x < 4300) return 'Coral Heights';
    return 'North Works';
  }
  if (x > 4400) return 'Neon Mile';
  if (x > 2100 && x < 4400 && y > 1150 && y < 2900) return 'Downtown';
  if (x < 2100) return 'Palm Gardens';
  return 'Mercado';
}

function onRoad(x, y, pad) {
  for (const rx of AVENUES_X) if (Math.abs(x - rx) < ROAD_W / 2 + pad) return true;
  for (const ry of STREETS_Y) if (Math.abs(y - ry) < ROAD_W / 2 + pad) return true;
  return false;
}

function inBay(x, y, pad) {
  return x > BAY.x - pad && y > BAY.y - pad;
}

// Buildings fill each block between roads: a grid of lots, each either a
// building (with a height tier for its shading) or, now and then, an open
// lot — a car park, a plaza, a patch of green.
export function buildCity(seed) {
  const rng = makeRng(seed * 7919 + 13);
  const buildings = [];
  const palms = [];
  const lamps = [];
  const lots = [];

  const xs = [-80, ...AVENUES_X, WORLD.w + 80];
  const ys = [-80, ...STREETS_Y, WORLD.h + 80];
  for (let i = 0; i + 1 < xs.length; i += 1) {
    for (let j = 0; j + 1 < ys.length; j += 1) {
      const x0 = xs[i] + ROAD_W / 2 + 26;
      const x1 = xs[i + 1] - ROAD_W / 2 - 26;
      const y0 = ys[j] + ROAD_W / 2 + 26;
      const y1 = ys[j + 1] - ROAD_W / 2 - 26;
      if (x1 - x0 < 200 || y1 - y0 < 200) continue;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;
      if (inBay(cx, cy, 40)) continue;
      const district = districtAt(cx, cy);
      const style = DISTRICT_STYLE[district];
      const cols = 2;
      const rows = 2;
      const cw = (x1 - x0) / cols;
      const ch = (y1 - y0) / rows;
      for (let a = 0; a < cols; a += 1) {
        for (let b = 0; b < rows; b += 1) {
          const bx = x0 + a * cw + 16;
          const by = y0 + b * ch + 16;
          const bw = cw - 32;
          const bh = ch - 32;
          const bcx = bx + bw / 2;
          const bcy = by + bh / 2;
          if (inBay(bcx, bcy, 30)) continue;
          if (chance(rng, 0.14)) {
            lots.push({ x: bx, y: by, w: bw, h: bh, kind: pick(rng, ['park', 'plaza', 'green']) });
            continue;
          }
          const tier = style.tall && chance(rng, 0.55) ? 3 : chance(rng, 0.4) ? 2 : 1;
          buildings.push({
            x: bx, y: by, w: bw, h: bh, tier,
            colour: pick(rng, style.roof),
            district,
            neon: district === 'Neon Mile' || district === 'Downtown'
              ? pick(rng, ['#ff4fa3', '#22d3ee', '#facc15', '#a78bfa', null, null])
              : null,
            windows: Math.floor(range(rng, 4, 14)),
          });
          if (district === 'Palm Gardens' || district === 'South Beach' || district === 'Coral Heights') {
            const n = Math.floor(range(rng, 1, 4));
            for (let k = 0; k < n; k += 1) {
              palms.push({ x: bx + range(rng, -14, bw + 14), y: by + range(rng, -10, bh + 10), s: range(rng, 0.8, 1.3) });
            }
          }
        }
      }
    }
  }

  // Street lamps along every avenue and street, both sides.
  for (const rx of AVENUES_X) {
    for (let y = 140; y < WORLD.h; y += 300) {
      if (inBay(rx, y, 0)) continue;
      lamps.push({ x: rx - ROAD_W / 2 - 8, y }, { x: rx + ROAD_W / 2 + 8, y: y + 150 });
    }
  }
  for (const ry of STREETS_Y) {
    for (let x = 140; x < WORLD.w; x += 300) {
      if (inBay(x, ry, 0)) continue;
      lamps.push({ x, y: ry - ROAD_W / 2 - 8 }, { x: x + 150, y: ry + ROAD_W / 2 + 8 });
    }
  }

  // Dock piers jutting into the bay from its west shore.
  const piers = [];
  for (let k = 0; k < 4; k += 1) {
    piers.push({ x: BAY.x, y: BAY.y + 180 + k * 260, w: 330, h: 44 });
  }

  // Named places the story uses. Coordinates sit on roads or open ground.
  const places = {
    selene:   { x: 2880, y: 2130, label: "Selene's Overlook" },
    safehouse:{ x: 1240, y: 520, label: 'Harbourview Safehouse' },
    hospital: { x: 2060, y: 1150, label: 'Coral Bay General' },
    spray1:   { x: 1240, y: 2960, label: "Rico's Respray" },
    spray2:   { x: 4520, y: 1150, label: "Rico's Respray — North" },
    spray3:   { x: 3700, y: 3780, label: "Rico's Respray — South" },
    docks:    { x: 4560, y: 3740, label: 'Pier 9, The Docks' },
    warehouse:{ x: 5340, y: 1150, label: 'North Works Warehouse 6' },
    club:     { x: 4520, y: 2130, label: 'Club Sirena, Neon Mile' },
    airstrip: { x: 6100, y: 520, label: 'Coral Bay Airstrip' },
    mercado:  { x: 2060, y: 3780, label: 'Mercado Central' },
    beach:    { x: 3700, y: 4540, label: 'South Beach Boardwalk' },
  };

  return { buildings, palms, lamps, lots, piers, places, seed };
}

// Solid rectangles the physics collides with (buildings + piers).
export function colliders(city) {
  return city.buildings.concat(city.piers);
}

// Snap a point to the nearest road centre — used to place traffic, parked
// cars and police spawns sensibly.
export function nearestRoadPoint(x, y) {
  let bestX = AVENUES_X[0];
  for (const rx of AVENUES_X) if (Math.abs(rx - x) < Math.abs(bestX - x)) bestX = rx;
  let bestY = STREETS_Y[0];
  for (const ry of STREETS_Y) if (Math.abs(ry - y) < Math.abs(bestY - y)) bestY = ry;
  return Math.abs(bestX - x) < Math.abs(bestY - y) ? { x: bestX, y } : { x, y: bestY };
}

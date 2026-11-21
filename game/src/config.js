// Neon Tide: Coral Bay — shared constants.
// One place for the world's size, the road grid, the palette and the tuning
// numbers every other module reads. Nothing here touches the DOM.

export const WORLD = { w: 6400, h: 4800 };

// Roads are full-length avenues and streets; the blocks between them hold
// the buildings. Lane offset is measured from a road's centre line.
export const ROAD_W = 168;
export const AVENUES_X = [420, 1240, 2060, 2880, 3700, 4520, 5340, 6100];
export const STREETS_Y = [420, 1240, 2060, 2880, 3700, 4460];

// The bay eats the south-east corner; the docks sit on its west shore.
export const BAY = { x: 4700, y: 3560, w: 1700, h: 1240 };

export const STEP = 1 / 60;

export const PLAYER = {
  footSpeed: 218,
  sprintSpeed: 330,
  radius: 13,
  maxHealth: 100,
  maxArmour: 100,
};

export const CAR = {
  accel: 340,
  brake: 520,
  reverse: 150,
  drag: 0.62,
  grip: 3.4,
  radius: 17,
};

// Wanted tuning: heat is a float, stars are its floor. Heat fades only while
// no police unit can see the player.
export const HEAT = {
  theft: 1.0,
  hitPed: 1.6,
  hitCar: 0.35,
  shot: 0.8,
  killRival: 0.7,
  missionCrime: 1.0,
  decayPerSec: 0.055,
  max: 5,
};

export const PALETTE = {
  asphalt: '#33373f',
  asphaltDark: '#2b2f36',
  lane: '#d8c26a',
  kerb: '#9aa0a8',
  sidewalk: '#565b63',
  grass: '#3f7a44',
  sand: '#d9bd7f',
  water: '#14506e',
  waterDeep: '#0d3d57',
  night: 'rgba(8,12,38,0.55)',
};

// District ground tints, keyed by the names city.js assigns to each block.
export const DISTRICT_STYLE = {
  'Old Town':     { ground: '#6d5a49', roof: ['#8a4f3a', '#96604a', '#7c4634', '#a06a4e'], tall: 0 },
  'Coral Heights':{ ground: '#4c7350', roof: ['#b8b0a0', '#c4bba8', '#a89f8d', '#cfc5b2'], tall: 0 },
  'Downtown':     { ground: '#4a4d55', roof: ['#3d4454', '#46506a', '#37404f', '#525f78'], tall: 1 },
  'Palm Gardens': { ground: '#527a4c', roof: ['#c9a86a', '#d4ba7d', '#bb9c5f', '#e0c88f'], tall: 0 },
  'North Works':  { ground: '#5d5d58', roof: ['#7a7d78', '#6b6e68', '#83867f', '#5f625c'], tall: 0 },
  'Neon Mile':    { ground: '#4e4258', roof: ['#5a3d5e', '#68486a', '#4c3554', '#75527a'], tall: 0 },
  'Mercado':      { ground: '#7a5c40', roof: ['#c25e3a', '#d18a3c', '#b84f5a', '#cfb13f'], tall: 0 },
  'South Beach':  { ground: '#c9ab72', roof: ['#e6ddc8', '#efe6d2', '#dcd0b4', '#f4ecd9'], tall: 0 },
  'The Docks':    { ground: '#5a5e5c', roof: ['#6e7276', '#5f6462', '#7d7a6e', '#686c66'], tall: 0 },
};

export const SAVE_KEY = 'neontide-coralbay-save-v1';

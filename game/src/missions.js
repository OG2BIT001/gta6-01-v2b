// The story: nine jobs for fixer Selene Ward, told through short dialogue
// exchanges and run by a small stage machine. Each mission is data — a
// list of stages — and updateMissions() walks the player through them,
// watching state.events for kills and crimes, and state positions for
// arrivals. After the finale, Selene keeps offering repeatable courier
// runs so the city stays worth driving in.
import { wantedStars, spawnRival, makeCar, CAR_COLOURS } from './entities.js';
import { addHeat } from './entities.js';
import { sfx } from './audio.js';
import { confetti, floatText } from './fx.js';

const P = (state, key) => state.city.places[key];

// Stage kinds:
//   goto    {at, r?, label, timer?}          arrive (any way) inside r
//   pickup  {at, label}                      arrive ON FOOT (a door, a hand-off)
//   kill    {count, spots:[[x,y],...]}       rivals spawn; drop `count` of them
//   destroy {spots:[[x,y],...]}              armoured target cars to wreck
//   escape  {at, label}                      arrive with at most 1 star
//   race    {points:[[x,y],...], timer}      checkpoints in order, against the clock
//   survive {seconds, spots}                 stay alive while rivals hunt you
export const MISSIONS = [
  {
    id: 'first-night', title: 'First Night in Coral Bay', reward: 300,
    intro: [
      ['Selene', 'Nix. You made it off the boat in one piece. Good — I only hire drivers who arrive.'],
      ['Nix', 'You said there was work. Real work.'],
      ['Selene', 'A package is waiting behind Club Sirena. Pick it up on foot, bring it to the safehouse. And Nix — the car you arrive in does not have to be yours.'],
    ],
    outro: [
      ['Selene', 'Clean and quick. The Bay might suit you.'],
      ['Nix', 'Keep the jobs coming.'],
    ],
    stages: [
      { kind: 'pickup', at: 'club', label: 'Pick up the package behind Club Sirena' },
      { kind: 'goto', at: 'safehouse', label: 'Deliver the package to the safehouse' },
    ],
  },
  {
    id: 'hot-merchandise', title: 'Hot Merchandise', reward: 500,
    intro: [
      ['Selene', 'The Vultures — a two-bit crew out of North Works — lifted a shipment of mine from Warehouse 6.'],
      ['Nix', 'You want it back, or you want them sorry?'],
      ['Selene', 'Both. Clear the yard, then take the goods to Pier 9.'],
    ],
    outro: [['Selene', 'The Vultures send their regards, I hear. Word travels. So will you.']],
    stages: [
      { kind: 'goto', at: 'warehouse', label: 'Go to Warehouse 6, North Works' },
      { kind: 'kill', count: 3, label: 'Clear the Vulture guards', spots: 'warehouse' },
      { kind: 'goto', at: 'docks', label: 'Take the shipment to Pier 9' },
    ],
  },
  {
    id: 'two-minute', title: 'Two-Minute Warning', reward: 450,
    intro: [
      ['Selene', 'A surgeon at Coral Bay General needs a donor cooler from Mercado Central. It does not keep.'],
      ['Nix', 'Two minutes across the whole city?'],
      ['Selene', 'Then I suggest you drive like the city owes you money.'],
    ],
    outro: [['Selene', 'The patient lived. The surgeon sends a bonus and a blessing.']],
    stages: [
      { kind: 'pickup', at: 'mercado', label: 'Collect the cooler at Mercado Central' },
      { kind: 'goto', at: 'hospital', label: 'Deliver it to Coral Bay General — fast', timer: 125 },
    ],
  },
  {
    id: 'sirena-nights', title: 'Sirena Nights', reward: 600,
    intro: [
      ['Selene', 'Club Sirena is hosting a street run tonight. Four gates, Neon Mile to Downtown and back.'],
      ['Nix', 'And you have money on me.'],
      ['Selene', 'I have money on the other three. Prove me happily wrong.'],
    ],
    outro: [['Selene', 'First place. The bookies are furious. I am not.']],
    stages: [
      { kind: 'goto', at: 'club', label: 'Reach the start at Club Sirena' },
      { kind: 'race', label: 'Run the gates', timer: 110, points: [[3700, 1240], [2880, 1240], [2880, 2880], [4520, 2880]] },
    ],
  },
  {
    id: 'dockyard-dogs', title: 'Dockyard Dogs', reward: 800,
    intro: [
      ['Selene', 'The Vultures moved on Pier 9 last night. My people are pinned down and the tide is coming in.'],
      ['Nix', 'How many?'],
      ['Selene', 'Four shooters. Make it zero, then get home.'],
    ],
    outro: [['Selene', 'Pier 9 is ours again. The Vultures are running out of dogs.']],
    stages: [
      { kind: 'goto', at: 'docks', label: 'Get to Pier 9' },
      { kind: 'kill', count: 4, label: 'Drive off the Vultures', spots: 'docks' },
      { kind: 'escape', at: 'safehouse', label: 'Get back to the safehouse' },
    ],
  },
  {
    id: 'warehouse-job', title: 'The Warehouse Job', reward: 1100,
    intro: [
      ['Selene', 'Warehouse 6 again — but tonight you go in on foot and come out rich. The strongbox by the east wall.'],
      ['Nix', 'Alarms?'],
      ['Selene', 'Loud ones. The whole CBPD will hear. Lose them, or paint the car — Rico owes me favours.'],
    ],
    outro: [['Selene', 'That strongbox was the Vultures’ whole war chest. Was.']],
    stages: [
      { kind: 'pickup', at: 'warehouse', label: 'Take the strongbox from Warehouse 6', alarm: true },
      { kind: 'escape', at: 'selene', label: "Bring it to Selene's Overlook — cool your heat first" },
    ],
  },
  {
    id: 'armoured-convoy', title: 'Armoured Convoy', reward: 1200,
    intro: [
      ['Selene', 'What is left of the Vultures is leaving town in two armoured wagons — North Works and Downtown.'],
      ['Nix', 'You want the wagons stopped.'],
      ['Selene', 'I want them scrap. Shoot them, ram them, I am not sentimental.'],
    ],
    outro: [['Selene', 'Two wagons of scrap. The Vultures are a story people tell now.']],
    stages: [
      { kind: 'destroy', label: 'Wreck both armoured wagons', spots: [[5340, 1330], [2880, 2240]] },
    ],
  },
  {
    id: 'bay-run', title: 'The Bay Run', reward: 1000,
    intro: [
      ['Selene', 'A collector is timing a run around the whole bay. Six gates. He pays for under two minutes.'],
      ['Nix', 'And if I am over?'],
      ['Selene', 'Then he pays the Vultures’ ghosts instead. Drive.'],
    ],
    outro: [['Selene', 'Under the time, with room to spare. The collector wants your name. I gave him a fake one.']],
    stages: [
      { kind: 'race', label: 'Run all six gates', timer: 150, points: [[1240, 1240], [3700, 420], [6100, 1240], [6100, 3700], [3700, 4460], [1240, 3700]] },
    ],
  },
  {
    id: 'neon-requiem', title: 'Neon Requiem', reward: 2500,
    intro: [
      ['Selene', 'Last job, Nix. The Vultures’ ledger — every bribe, every name — is at the airstrip, guarded by what is left of them.'],
      ['Selene', 'Take it to the boat at the end of Pier 9. After tonight, Coral Bay is ours — and you are free.'],
      ['Nix', 'Then let us finish it.'],
    ],
    outro: [
      ['Selene', 'The boat is away, the ledger is gone, and the Bay is quiet.'],
      ['Nix', 'What now?'],
      ['Selene', 'Now? Now you own a piece of this city. Drive it like you do.'],
    ],
    stages: [
      { kind: 'goto', at: 'airstrip', label: 'Go to Coral Bay Airstrip' },
      { kind: 'kill', count: 5, label: 'Take the ledger from its guards', spots: 'airstrip' },
      { kind: 'pickup', at: 'airstrip', label: 'Pick up the ledger' },
      { kind: 'escape', at: 'docks', label: 'Get the ledger to the boat at Pier 9' },
    ],
  },
];

// ------------------------------------------------------------ engine
export function missionOffer(state) {
  if (state.mission) return null;
  if (state.progress < MISSIONS.length) return MISSIONS[state.progress];
  return courierJob(state);
}

// A small endless job once the story is done.
function courierJob(state) {
  const keys = ['club', 'mercado', 'hospital', 'beach', 'airstrip', 'warehouse', 'docks'];
  const at = keys[Math.floor(state.rng() * keys.length)];
  return {
    id: 'courier', title: 'Courier Run', reward: 175, repeatable: true,
    intro: [['Selene', 'A little errand, if you are restless. No questions, quick wheels.']],
    outro: [['Selene', 'Neatly done. The Bay provides.']],
    stages: [
      { kind: 'pickup', at, label: `Pick up at ${P(state, at).label}` },
      { kind: 'goto', at: 'selene', label: "Bring it back to Selene's Overlook", timer: 150 },
    ],
  };
}

export function startMission(state, def) {
  state.mission = { def, stage: 0, data: {}, timer: null, killsAtStart: 0 };
  state.dialogue = def.intro.map(([who, text]) => ({ who, text }));
  sfx.missionStart();
  sfx.phone();
  setupStage(state);
}

function setupStage(state) {
  const m = state.mission;
  if (!m) return;
  const st = m.def.stages[m.stage];
  m.data = { kills: 0, wrecked: 0, point: 0, left: 0 };
  m.timer = st.timer || null;
  if (st.kind === 'kill') {
    const base = P(state, st.spots);
    state.rivalsHostile = true;
    for (let i = 0; i < st.count + 1; i += 1) {
      const a = (i / (st.count + 1)) * Math.PI * 2;
      spawnRival(state, base.x + Math.cos(a) * 120, base.y + Math.sin(a) * 90, { guard: { x: base.x, y: base.y } });
    }
    state.events.push('alarm');
  }
  if (st.kind === 'destroy') {
    m.data.targets = [];
    for (const [x, y] of st.spots) {
      const car = makeCar(x, y, Math.PI / 2, '#4a4f57', 'target');
      car.health = 260;
      car.parked = true;
      state.cars.push(car);
      m.data.targets.push(car);
      spawnRival(state, x + 60, y + 30, { guard: { x, y } });
      spawnRival(state, x - 60, y - 30, { guard: { x, y } });
    }
    state.rivalsHostile = true;
  }
  if (st.kind === 'survive') {
    state.rivalsHostile = true;
    m.data.left = st.seconds;
  }
  if (st.kind === 'pickup' && st.alarm) m.data.alarmed = false;
}

export function currentObjective(state) {
  const m = state.mission;
  if (!m) {
    const offer = missionOffer(state);
    if (!offer) return null;
    const s = P(state, 'selene');
    return { x: s.x, y: s.y, label: `See Selene — ${offer.title}`, giver: true };
  }
  const st = m.def.stages[m.stage];
  let at = null;
  if (st.at) at = P(state, st.at);
  else if (st.kind === 'kill') at = P(state, st.spots);
  else if (st.kind === 'race') {
    const [x, y] = st.points[m.data.point];
    at = { x, y };
  } else if (st.kind === 'destroy' && m.data.targets) {
    const alive = m.data.targets.find(t => t.health > 0);
    if (alive) at = { x: alive.x, y: alive.y };
  }
  if (!at) return null;
  let label = st.label;
  if (st.kind === 'kill') label += ` (${m.data.kills}/${st.count})`;
  if (st.kind === 'destroy') label += ` (${m.data.wrecked}/${st.spots.length})`;
  if (st.kind === 'race') label += ` — gate ${m.data.point + 1}/${st.points.length}`;
  if (m.timer !== null && m.timer !== undefined) label += ` — ${Math.max(0, Math.ceil(m.timer))}s`;
  if (st.kind === 'escape' && wantedStars(state) > 1) label += ' — lose the heat first (or respray)';
  return { x: at.x, y: at.y, label };
}

function stageDone(state) {
  const m = state.mission;
  m.stage += 1;
  if (m.stage >= m.def.stages.length) {
    completeMission(state);
  } else {
    sfx.pickup();
    setupStage(state);
  }
}

function completeMission(state) {
  const m = state.mission;
  state.money += m.def.reward;
  state.dialogue = m.def.outro.map(([who, text]) => ({ who, text }));
  floatText(state.player.x, state.player.y - 44, `${m.def.title} — $${m.def.reward}`, '#facc15');
  sfx.missionDone();
  confetti(state.player.x, state.player.y - 10, 36);
  if (!m.def.repeatable) {
    state.progress += 1;
    if (state.progress >= MISSIONS.length) state.events.push('storyComplete');
  }
  state.mission = null;
  state.rivalsHostile = false;
  state.saveDirty = true;
}

export function failMission(state, why) {
  if (!state.mission) return;
  state.dialogue = [{ who: 'Selene', text: why }];
  sfx.fail();
  // Clean up mission-spawned targets so a retry starts fresh.
  if (state.mission.data.targets) {
    for (const t of state.mission.data.targets) {
      state.cars = state.cars.filter(c => c !== t);
    }
  }
  state.rivals = state.rivals.filter(r => false);
  state.mission = null;
  state.rivalsHostile = false;
}

export function updateMissions(state, dt) {
  const m = state.mission;
  if (!m) return;
  const st = m.def.stages[m.stage];
  const p = state.player;

  if (m.timer !== null && m.timer !== undefined) {
    m.timer -= dt;
    if (m.timer <= 0) {
      failMission(state, 'Out of time. The job is off — come back and we will run it again.');
      return;
    }
  }

  // Count events the stage cares about.
  for (const ev of state.events) {
    if (ev === 'rivalDown') m.data.kills += 1;
  }

  if (st.kind === 'goto' || st.kind === 'pickup' || st.kind === 'escape') {
    const at = P(state, st.at);
    const d = Math.hypot(p.x - at.x, p.y - at.y);
    const r = st.kind === 'pickup' ? 62 : 96;
    if (d < r) {
      if (st.kind === 'pickup' && p.car) {
        state.hint = 'On foot — get out of the car (F)';
        return;
      }
      if (st.kind === 'escape' && wantedStars(state) > 1) {
        state.hint = 'Too hot — lose the police or visit a respray';
        return;
      }
      if (st.kind === 'pickup' && st.alarm && !m.data.alarmed) {
        m.data.alarmed = true;
        state.events.push('alarm');
        addHeat(state, 2.2, null);
        state.dialogue = [{ who: 'Nix', text: 'Alarm. Of course there is an alarm.' }];
      }
      sfx.pickup();
      stageDone(state);
    }
    return;
  }
  if (st.kind === 'kill') {
    if (m.data.kills >= st.count) stageDone(state);
    return;
  }
  if (st.kind === 'destroy') {
    for (const t of m.data.targets) {
      if (t.health <= 0 && !t.counted) {
        t.counted = true;
        m.data.wrecked += 1;
        state.events.push('targetDown');
      }
    }
    if (m.data.wrecked >= st.spots.length) stageDone(state);
    return;
  }
  if (st.kind === 'race') {
    const [x, y] = st.points[m.data.point];
    if (Math.hypot(p.x - x, p.y - y) < 120) {
      m.data.point += 1;
      sfx.cash();
      if (m.data.point >= st.points.length) stageDone(state);
    }
    return;
  }
  if (st.kind === 'survive') {
    m.data.left -= dt;
    if (m.data.left <= 0) stageDone(state);
  }
}

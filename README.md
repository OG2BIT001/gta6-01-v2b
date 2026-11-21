[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/OG2BIT001/gta6-01-v2b/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/OG2BIT001/gta6-01-v2b/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

# Neon Tide: Coral Bay

An original top-down open-world crime game that runs in the browser — no build
step, no libraries, no network requests, and every sound synthesised live with
WebAudio. You are Nix Alvarez, a wheelman fresh off the boat in Coral Bay, a
sun-and-neon bay city of palms, docks and other people's cars. Fixer Selene
Ward has **nine jobs** for you — package runs, a street race, a warehouse
strongbox, an armoured convoy, and a finale at the airstrip. The Coral Bay PD
has opinions about all of it.

This is the second, much larger entry from the same author as *Port Solana:
Neon Heat*: a bigger hand-planned city, a longer story, and a lot more juice.

## How to play

Open `game/index.html` in a desktop browser, or serve the folder:

```
node serve.ts            # → http://localhost:8080
```

| Input | Action |
| --- | --- |
| WASD / arrows | Walk and drive |
| Shift | Sprint |
| F | Get in / out of a car (any car — the owner may object) |
| Mouse + click | Aim and shoot (on foot or drive-by) |
| E | Talk, take a job, advance dialogue, respray (in a car at a garage) |
| H | Horn (while driving) |
| P / Esc | Pause · S saves · Q quits to title |
| M | Mute |

## What's in the city

- **Nine districts** with their own ground, roofs and mood — Downtown towers,
  the Neon Mile's glowing signs, Palm Gardens, the Mercado, South Beach,
  North Works warehouses, the Docks and the bay itself.
- **Driving and on foot**, seamlessly: steal parked or moving cars, run
  people down (the stars notice), wreck cars, get wrecked.
- **Traffic and pedestrians** with their own routines — traffic queues,
  turns at intersections, brakes for jaywalkers; pedestrians flee gunfire
  and fast cars.
- **A five-star wanted system**: police spawn, pursue, ram, and shoot from
  three stars; a bust meter fills if they pin you. Heat cools while you're
  unseen, or instantly at a Rico's Respray (pink **R** signs) for $200.
- **Combat**: hitscan pistol with tracers, muzzle flash and drive-by fire;
  the rival Vultures crew guard their turf, strafe, and shoot back.
- **Nine story missions** with dialogue — pickups, timed deliveries, two
  checkpoint races, guard clear-outs, a loot-and-escape warehouse job,
  armoured-car wrecks and a five-guard finale — plus endless courier runs
  after the story ends.
- **A living clock and sky**: a full day/night cycle (lit windows, street
  lamps, headlights), passing rain with wet streets, and a synthwave pad
  that drifts under everything.
- **Juice**: particles for sparks, smoke, blood, splashes and confetti,
  screen shake, floating cash text, and a speedometer.
- **HUD and minimap** with objective beacon and edge arrow, police blips,
  health/armour/car bars, clock and district name.
- **Screens for everything**: animated title menu, help card, pause,
  WASTED and BUSTED (with a $150 fine and a hospital/police-station
  respawn), and a victory screen when the story is done.
- **Saving**: progress, money, position and time of day persist in
  `localStorage`; Continue picks up where you left off.

## Layout

- `main.ts` — the hand-in program: copies `game/` and `screenshots/` to the
  output directory and writes `dossier.json` via the vendored library.
- `game/` — the game itself: `index.html` plus ES modules under `src/`
  (`city`, `entities`, `missions`, `render`, `audio`, `fx`, …).
- `screenshots/` — four screens of the game (see `SESSION.md` for how they
  were made).
- `tools/` — the headless smoke test (`node tools/smoke.mjs`) and the
  screenshot generator.
- `vendor/makefun-game.ts` — the kit's dossier library, byte-identical to
  the kit's copy.

Everything — city, characters, vehicles, names, story, art and sound — is
original to this entry and MIT-licensed (see `LICENSE`).

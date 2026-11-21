# Build session log — gta6-01 "Make GTA 6", entry v2

Game: **Neon Tide: Coral Bay** — an original top-down open-world crime game
(own city, characters, vehicles, names, story, art and sound; nothing from
any commercial game). Built as a deliberate step up from the author's v1
entry (Port Solana: Neon Heat): roughly double the mission count, a larger
district-driven city, day/night and weather, and a fuller wanted/combat
model.

## 2026-11-21 (build session)

- Read the kit's `competition.yaml`, `kit.json`, the starter's `main.ts`,
  `serve.ts`, `shots.json`, `game/index.html` and `game/src/shots.js` to
  learn the conventions: ES modules under `game/src/`, `?shot=<scene>&seed=N`
  staging with `window.__shotReady`, fixed 1/60 s steps, and a `main.ts`
  that copies `game/` + `screenshots/` to the output dir and writes
  `dossier.json` with `buildDossier` from `vendor/makefun-game.ts`.
- There is no local grade for this competition (the scorer stays on the
  server), so verification here is by syntax checks, a headless run of the
  game's own code (see below), and a local `main.ts` run whose dossier is
  produced by the verified vendor library.

## Vendor file

`vendor/makefun-game.ts` was copied byte-identical from the kit's starter
(sha256 `dc67187521b24025ff952f8c231485a6eb92d6d71d29edd2a08154ffb4376129`,
56,282 bytes — matches the hash recorded for the file in the kit manifest
and the copy the v1 entry shipped).

## What was built

- `game/src/config.js` — world size, road grid, bay, tuning, palette,
  per-district styles.
- `game/src/city.js` — seeded city generation: nine districts, ~180
  buildings with tiers and neon, palms, ~380 street lamps, open lots,
  dock piers, and the named places the story uses.
- `game/src/entities.js` — the player (foot + driving), traffic AI with
  lanes, queues and intersection turns, pedestrians that flee danger,
  police pursuit with a bust meter and return fire, rival gunmen, pickups,
  building collision, car-to-car bumps, and the heat (wanted) system.
- `game/src/missions.js` — nine story missions with intro/outro dialogue,
  run by a stage machine (goto / pickup / kill / destroy / escape / race /
  survive), plus endless courier jobs after the finale.
- `game/src/render.js` — the top-down renderer (district ground, roads and
  crosswalks, lit windows, neon, lamp glow and headlight pools at night,
  rain), the HUD, the live minimap, dialogue boxes, and the title, pause,
  wasted/busted and victory screens.
- `game/src/audio.js` — all-synthesised WebAudio: engine, siren and rain
  loops, a drifting synth pad, and ~20 one-shot effects. No audio files.
- `game/src/fx.js` — pooled particles (sparks, smoke, blood, splashes,
  confetti), floating text, muzzle flashes, screen shake, and the weather
  state machine.
- `game/src/main.js` — state, input, the fixed-step loop, the screen
  machine, respray garages, saving to `localStorage`, and `?shot=` staging
  for the screenshot scenes (`title`, `drive`, `chase`, `foot`).
- `main.ts` (hand-in program, written for this entry with its own sanity
  checks), `serve.ts` (local play), `shots.json`.

## Verification

- `node --check` passes on every game module.
- `tools/smoke.mjs` stubs the DOM, canvas and storage, loads the real game,
  and plays it: all four `?shot=` scenes stage; the title starts a game;
  dialogue advances; the player walks; mission 1 starts at Selene, its
  pickup and delivery stages complete, it pays out and writes a save;
  three stars bring police; shooting, pause and resume all work.
  Result: **SMOKE OK** (26 checks).
- `MAKEFUN_OUTPUT_DIR=out node main.ts` runs clean and produces
  `out/dossier.json` via the vendor library (see the run output in this
  session's transcript).

## Screenshots — how they were made

The four files in `screenshots/` are **PIL rasterisations, not browser
captures**. `tools/make_screenshots.py` takes the real seed-7 city from the
game's own generator (`tools/dump_city.mjs` prints `buildCity(7)` as JSON),
stages actors on it (player car, traffic, police, rivals), and draws the
HUD, minimap, dialogue box and title screen in the game's own style and
palette. The game's `?shot=` staging produces the same scenes live in a
browser. No screenshot shows anything the game does not contain.

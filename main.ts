// Neon Tide: Coral Bay — the hand-in program for gta6-01 (Node 22, standard
// library only). The game itself is the static site under game/ (open
// game/index.html in a desktop browser; it runs fully offline). This program
// copies game/ and screenshots/ into the output directory and writes
// dossier.json there with the kit's vendored buildDossier library, after a
// few sanity checks of its own so a broken entry fails loudly here rather
// than quietly at the gate.
//
// Run it the way the grader does, or locally with an output override:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

function listFiles(dir, base = dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...listFiles(full, base));
    else found.push(full.slice(base.length + 1));
  }
  return found;
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
if (!existsSync(join(gameDir, 'index.html'))) {
  throw new Error('game/index.html is missing — the entry has no game to hand in');
}
const gameFiles = listFiles(gameDir);
const shotFiles = existsSync(shotsDir) ? readdirSync(shotsDir).filter(f => /\.(png|jpe?g)$/i.test(f)) : [];
if (shotFiles.length < 3 || shotFiles.length > 4) {
  throw new Error(`expected 3 or 4 screenshots, found ${shotFiles.length}`);
}
for (const shot of shotFiles) {
  const size = statSync(join(shotsDir, shot)).size;
  if (size > 262144) throw new Error(`screenshot ${shot} is ${size} bytes — over the 256 KiB cap`);
}

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });

// The caps below are the scorer's own (reference/gate.json), passed through
// to the vendored library exactly as the kit prescribes.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`neon-tide: handed in ${gameFiles.length} game files and ${shotFiles.length} screenshots to ${out}`);

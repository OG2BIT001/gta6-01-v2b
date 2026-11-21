// Prints the seed-7 city (the same Coral Bay the game builds) as JSON on
// stdout, for tools/make_screenshots.py to rasterise.
import { buildCity } from '../game/src/city.js';

const city = buildCity(7);
process.stdout.write(JSON.stringify(city));

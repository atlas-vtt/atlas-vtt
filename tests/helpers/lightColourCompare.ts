import { migrateMapFile } from '../../src/app/services/MapPersistence';
import { isHexColor } from '../../src/app/utils/hexColor';
import { current } from './sceneModelCurrent';
import { frozen } from './sceneModelFrozen';
import { seededColour } from './sceneModelSteps';
import { seededRandom } from './sightScenes';

const SCALE = { unitDistance: 5, cellSize: 70 };

type Colour = readonly [number, number, number];

/** A light's colour as the engine gets it, from the code under test and from the frozen copy. */
export function coloursOf(hex: string): { now: Colour; before: Colour } {
  const light = { key: 'light:a', x: 0, y: 0, emission: { bright: 10, dim: 20, color: hex, intensity: 1, animation: 'none' as const } };
  return { now: current.engineLight(light, SCALE).color, before: frozen.engineLight(light, SCALE).color };
}

/** Every value of each channel in both letter cases, then seeded colours in mixed case. */
export function comparedColours(seeded = 5000): string[] {
  const colours = new Set<string>();
  for (let value = 0; value < 256; value++) {
    const digits = value.toString(16).padStart(2, '0');
    for (const text of [digits, digits.toUpperCase()]) for (const colour of [`#${text}0000`, `#00${text}00`, `#0000${text}`]) colours.add(colour);
  }
  const rng = seededRandom(20261007);
  for (let n = 0; n < seeded; n++) colours.add(seededColour(rng));
  return [...colours];
}

/** The colours whose channels are not the very same numbers in both, compared as they are and never rounded. */
export function colourMismatches(colours: readonly string[] = comparedColours()): string[] {
  return colours.filter((hex) => {
    const { now, before } = coloursOf(hex);
    return now.length !== before.length || now.some((channel, i) => !Object.is(channel, before[i]));
  });
}

/** Colours a hand-edited map file may hold in place of `#rrggbb`. */
const MALFORMED: readonly unknown[] = ['#fff', 'red', 0xff8800, undefined, null, '#ff8800cc', 'rgb(1,2,3)', '', '#GGGGGG', ' #ff8800', '#ff8800\n', [255, 136, 0], { r: 255 }];

/**
 * Placed and carried lights with such colours, read as a load brings them into the store: every
 * light that then shines must have a colour of the form the engine reads, in both versions.
 */
export function malformedColourProblems(count = 200): string[] {
  const rng = seededRandom(271828);
  const lights: Record<string, unknown> = {};
  const tokens: Record<string, unknown> = {};
  for (let n = 0; n < count; n++) {
    const color = MALFORMED[Math.floor(rng() * MALFORMED.length)];
    const emission = { bright: 10, dim: 20, intensity: 1, animation: 'none', ...(n % 7 !== 0 && { color }) };
    if (n % 2 === 0) lights[`l${n}`] = { id: `l${n}`, kind: 'light', x: n, y: n, emission };
    else tokens[`t${n}`] = { id: `t${n}`, kind: 'token', imagePath: '', x: n, y: n, light: emission };
  }
  const objects = migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens, lights } }).objects;
  const problems: string[] = [];
  for (const [name, version] of [['now', current], ['before', frozen]] as const) {
    const shining = version.activeLights(objects.lights, objects.tokens);
    if (shining.length !== count) problems.push(`${name}: ${shining.length} lights shine, ${count} expected`);
    for (const light of shining) if (!isHexColor(light.emission.color)) problems.push(`${name}: ${light.key} shines with ${String(light.emission.color)}`);
  }
  return problems;
}

import { createViewAtlasStore, type ViewAtlasState } from '../../src/app/storeFactory';
import { resolveMeasurementSettings, type MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { BUILT_IN_SENSES } from '../../src/app/gameSystems/senses';
import { GENERIC_SENSES } from '../../src/app/gameSystems/senses/generic';
import { showsMap } from '../../src/app/gameSystems/senseRules';
import type { TokenEntity } from '../../src/app/types';
import type { ConditionDefinition } from '../../src/app/types/collectionSettingsTypes';
import type { LightEmission, LightSource, LightZone, SceneLighting, TokenVision } from '../../src/app/types/lightingTypes';
import type { SenseDefinition, TokenSense } from '../../src/app/types/senseTypes';
import type { HeldTokens } from '../../src/app/types/viewUIState';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { SightRules, TokenSight } from '../../src/app/vision/sightRules';
import { tokenSenses } from '../../src/app/vision/tokenSenses';
import type { MapBounds } from '../../src/app/vision/visibility';
import { createInMemoryApp } from '../mocks/inMemoryVault';

export type Rng = () => number;

/** The same numbers for the same seed, so a failing scene can be built again from its seed alone. */
export function seededRandom(seed: number): Rng {
  let state = seed;
  return (): number => { state = Math.imul(state, 1664525) + 1013904223 | 0; return (state >>> 0) / 4294967296; };
}

/** Every scene offers the senses of three systems together: their ids never collide. */
export const SCENE_SENSES: readonly SenseDefinition[] = [...GENERIC_SENSES, ...BUILT_IN_SENSES['builtin:dnd5e']!, ...BUILT_IN_SENSES['builtin:pathfinder2e']!];

export const SCENE_CONDITIONS: readonly ConditionDefinition[] = [
  { id: 'blind', name: 'Blinded', color: '#000000', effect: 'blinded' },
  { id: 'unseen', name: 'Invisible', color: '#ffffff', effect: 'invisible' },
  { id: 'flying', name: 'Flying', color: '#88ccff', effect: 'airborne' },
  { id: 'gone', name: 'Undetected', color: '#444444', effect: 'undetected' },
  { id: 'prone', name: 'Prone', color: '#aa8844' },
];

export interface SightScene {
  seed: number;
  state: ViewAtlasState;
  bounds: MapBounds;
  rules: SightRules;
  measurement: () => MeasurementSettings;
  /** Some token is kept under a record key that is not its id, or has no id, as a hand-edited map file may hold it. */
  malformed: boolean;
}

/** The kinds of sense a scene's list must offer, so that every way of perceiving is exercised. */
export function senseKinds(definitions: readonly SenseDefinition[]): Record<'map' | 'preciseCreatures' | 'imprecise' | 'seesInvisible' | 'magicalDark', boolean> {
  const senses = definitions.filter((sense) => !sense.grants);
  return {
    map: senses.some(showsMap),
    preciseCreatures: senses.some((sense) => sense.precise && !showsMap(sense)),
    imprecise: senses.some((sense) => !sense.precise),
    seesInvisible: definitions.some((sense) => sense.seesInvisible || sense.grants === 'see-invisible'),
    magicalDark: senses.some((sense) => sense.sees.magicalDark !== 'none'),
  };
}

const MEASUREMENT = resolveMeasurementSettings(undefined, null);
let initial: ViewAtlasState | null = null;

function initialState(): ViewAtlasState {
  initial ??= createViewAtlasStore(createInMemoryApp().app, 'sight-scenes').getState();
  return initial;
}

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const between = (rng: Rng, low: number, high: number): number => low + rng() * (high - low);

/** Who is hidden: by chance, nobody, every vision token (and others by chance), or by chance only tokens without vision. */
type HiddenMode = 'random' | 'none' | 'every-vision' | 'without-vision';

interface Layout {
  bounds: MapBounds;
  centre: { x: number; y: number };
  spread: number;
}

function near(rng: Rng, { bounds, centre, spread }: Layout): { x: number; y: number } {
  const clamp = (value: number, size: number): number => Math.min(size - 10, Math.max(10, value));
  return { x: clamp(centre.x + between(rng, -spread, spread), bounds.width), y: clamp(centre.y + between(rng, -spread, spread), bounds.height) };
}

function distance(rng: Rng): number | undefined {
  const roll = rng();
  return roll < 0.3 ? undefined : roll < 0.4 ? 0 : 5 + Math.floor(rng() * 56);
}

function vision(rng: Rng): TokenVision | undefined {
  const roll = rng();
  if (roll < 0.25) return undefined;
  const range = distance(rng);
  const result: TokenVision = { enabled: roll >= 0.4, ...(range !== undefined && { range }) };
  if (rng() < 0.3) result.angle = pick(rng, [45, 90, 120, 200, 300]);
  const kind = rng();
  if (kind < 0.15) {
    result.darkvision = pick(rng, [30, 60]);
    if (rng() < 0.4) result.tremorsense = 30;
  } else if (kind < 0.25) {
    result.senses = [];
  } else {
    const senses: TokenSense[] = [];
    for (let n = Math.floor(rng() * 4); n > 0; n--) {
      const reach = distance(rng);
      senses.push({ id: pick(rng, SCENE_SENSES).id, ...(reach !== undefined && reach > 0 && { range: reach }) });
    }
    result.senses = senses;
  }
  return result;
}

function emission(rng: Rng): LightEmission {
  const bright = Math.floor(rng() * 20);
  const light: LightEmission = { bright, dim: bright + 5 + Math.floor(rng() * 35), color: '#ffffff', intensity: 1, animation: 'none' };
  if (rng() < 0.3) light.darkness = true;
  if (rng() < 0.3) light.priority = pick(rng, [0, 1, 2]);
  if (rng() < 0.15) light.angle = pick(rng, [53, 90, 180]);
  return light;
}

function token(rng: Rng, index: number, layout: Layout, mode: HiddenMode): TokenEntity {
  const at = near(rng, layout);
  const sees = vision(rng);
  const conditions = SCENE_CONDITIONS.filter(() => rng() < 0.12).map((condition) => condition.id);
  const chance = rng() < 0.4;
  const hidden = mode === 'every-vision' && sees?.enabled ? true : mode === 'none' || (mode === 'without-vision' && sees?.enabled) ? false : chance;
  return {
    id: `t${index}`, kind: 'token', imagePath: `t${index}.png`, ...at,
    ...(rng() < 0.8 && { size: pick(rng, [1, 2, 4]) }),
    ...(rng() < 0.5 && { rotation: Math.floor(rng() * 360) }),
    ...(hidden && { isHidden: true }),
    ...(sees && { vision: sees }),
    ...(conditions.length > 0 && { conditions }),
    ...(rng() < 0.15 && { light: emission(rng) }),
  };
}

function wall(rng: Rng, index: number, layout: Layout, from?: { x: number; y: number }): WallSegment {
  const p1 = from ?? near(rng, layout);
  const angle = rng() * Math.PI * 2;
  const length = between(rng, 50, 400);
  const p2 = { x: p1.x + Math.cos(angle) * length, y: p1.y + Math.sin(angle) * length };
  const roll = rng();
  const type = roll < 0.75 ? 'solid' : roll < 0.92 ? 'door' : 'secret-door';
  return {
    id: `w${index}`, kind: 'wall', type, p1, p2,
    ...(type !== 'solid' && { closed: rng() < 0.6 }),
    ...(rng() < 0.1 && { direction: pick(rng, ['left', 'right'] as const) }),
    ...(rng() < 0.1 && { blocks: pick(rng, ['sight', 'light'] as const) }),
  };
}

function walls(rng: Rng, layout: Layout): Record<string, WallSegment> {
  const result: Record<string, WallSegment> = {};
  let last: WallSegment | undefined;
  for (let n = 0, count = Math.floor(rng() * 31); n < count; n++) {
    last = wall(rng, n, layout, last && rng() < 0.3 ? last.p2 : undefined);
    result[last.id] = last;
  }
  return result;
}

function lights(rng: Rng, layout: Layout): Record<string, LightSource> {
  const result: Record<string, LightSource> = {};
  for (let n = 0, count = Math.floor(rng() * 6); n < count; n++) {
    const id = `l${n}`;
    result[id] = {
      id, kind: 'light', ...near(rng, layout), emission: emission(rng),
      ...(rng() < 0.1 && { hidden: true }),
      ...(rng() < 0.3 && { rotation: Math.floor(rng() * 360) }),
      ...(rng() < 0.1 && { activeBelowAmbient: 0.3 }),
    };
  }
  return result;
}

function zones(rng: Rng, layout: Layout): Record<string, LightZone> {
  const result: Record<string, LightZone> = {};
  if (rng() >= 0.15) return result;
  for (let n = 0, count = 1 + Math.floor(rng() * 2); n < count; n++) {
    const { x, y } = near(rng, layout);
    const size = between(rng, 100, 500);
    result[`z${n}`] = { id: `z${n}`, kind: 'light-zone', ambient: pick(rng, [0, 0.3, 1]), polygon: [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }] };
  }
  return result;
}

/** Moves one or two tokens away from where the pointer took them, vision tokens first. */
function hold(rng: Rng, tokens: Record<string, TokenEntity>): HeldTokens {
  const held: Record<string, { x: number; y: number }> = {};
  const candidates = Object.entries(tokens).sort(([, a], [, b]) => Number(!!b.vision?.enabled) - Number(!!a.vision?.enabled));
  for (const [key, entry] of candidates.slice(0, 1 + Math.floor(rng() * 2))) {
    held[entry.id] = { x: entry.x, y: entry.y };
    tokens[key] = { ...entry, x: entry.x + between(rng, -400, 400), y: entry.y + between(rng, -400, 400) };
  }
  return held;
}

/** Keeps one or two vision tokens under keys that are not their ids, and now and then drops an id. */
function misfile(rng: Rng, tokens: Record<string, TokenEntity>): void {
  const seeing = Object.keys(tokens).filter((key) => tokens[key]!.vision?.enabled);
  for (const key of seeing.slice(0, 1 + Math.floor(rng() * 2))) {
    const entry = tokens[key]!;
    tokens[key] = { ...entry, id: `stray-${key}`, vision: { ...entry.vision!, range: 5 + Math.floor(rng() * 40) } };
  }
  const victim = Object.keys(tokens).find((key) => key !== seeing[0]);
  if (victim && rng() < 0.35) Reflect.deleteProperty(tokens[victim]!, 'id');
}

function visionOf(rng: Rng, definitions: readonly SenseDefinition[]): SightRules['visionOf'] {
  if (rng() < 0.5) return undefined;
  const pending = new Set(['t0', 't3', 't7', 't11']);
  return (entry: TokenEntity): TokenSight => (pending.has(entry.id)
    ? { senses: [], pending: true }
    : { senses: tokenSenses(entry.vision, definitions), ...(entry.vision?.range !== undefined && { sightRange: entry.vision.range }) });
}

/** One seeded scene: tokens, walls, lights, zones, held tokens and the scene's options. */
export function sightScene(seed: number): SightScene {
  const rng = seededRandom(seed * 7919 + 17);
  const kinds = senseKinds(SCENE_SENSES);
  for (const [kind, present] of Object.entries(kinds)) if (!present) throw new Error(`Scene ${seed}: no ${kind} sense`);
  const bounds = { width: Math.round(between(rng, 600, 3000)), height: Math.round(between(rng, 600, 3000)) };
  const layout: Layout = { bounds, centre: { x: between(rng, 100, bounds.width - 100), y: between(rng, 100, bounds.height - 100) }, spread: between(rng, 150, 600) };
  const malformed = rng() < 1 / 6;
  const modeRoll = rng();
  const mode: HiddenMode = malformed ? (modeRoll < 0.5 ? 'none' : 'every-vision')
    : modeRoll < 0.15 ? 'none' : modeRoll < 0.35 ? 'every-vision' : modeRoll < 0.55 ? 'without-vision' : 'random';
  const tokens: Record<string, TokenEntity> = {};
  for (let n = 0, count = Math.floor(rng() * 15); n < count; n++) tokens[`t${n}`] = token(rng, n, layout, mode);
  // Now and then nobody sees at all, or the first two tokens stand side by side, where footprints and perception
  // meet: sometimes a blinded party token in the dark beside a hidden token that sees there (the GM's footprints differ).
  const variant = rng();
  const watched = mode === 'random' && variant >= 0.08 && variant < 0.3 && !!tokens.t0 && !!tokens.t1;
  if (variant < 0.08 && !malformed && mode !== 'every-vision') {
    for (const [key, entry] of Object.entries(tokens)) if (entry.vision) tokens[key] = { ...entry, vision: { ...entry.vision, enabled: false } };
  } else if (variant < 0.3 && tokens.t0 && tokens.t1) {
    tokens.t1 = { ...tokens.t1, x: Math.min(bounds.width - 10, tokens.t0.x + 40), y: tokens.t0.y };
  }
  if (watched) {
    const party: TokenEntity = { ...tokens.t0!, vision: { enabled: true, range: 30, senses: [] }, conditions: ['blind'] };
    delete party.isHidden;
    tokens.t0 = party;
    const watcher: TokenEntity = { ...tokens.t1!, isHidden: true, vision: { enabled: true, range: 30, senses: [{ id: 'darkvision', range: 60 }] } };
    delete watcher.conditions;
    tokens.t1 = watcher;
  }
  // A scene that hides every vision token needs one; a misfiled scene needs two that see in any light.
  const needed = malformed ? 2 : mode === 'every-vision' && !Object.values(tokens).some((entry) => entry.vision?.enabled) ? 1 : 0;
  for (let n = 0; n < needed; n++) {
    const plain = { ...(tokens[`t${n}`] ?? token(rng, n, layout, mode)) };
    delete plain.conditions;
    const sees: TokenVision = { enabled: true, range: 30, ...(malformed && { senses: [{ id: 'blindsight', range: 30 }] }) };
    tokens[`t${n}`] = { ...plain, vision: sees, ...(mode === 'every-vision' && { isHidden: true }) };
  }
  const holdRoll = rng();
  const sightOnDrop = holdRoll < 0.2;
  const heldTokens = holdRoll < 0.25 ? hold(rng, tokens) : {};
  if (malformed) misfile(rng, tokens);
  const lighting: SceneLighting = {
    enabled: true, ambient: pick(rng, watched ? [0, 0.2] : [0, 0.2, 0.5, 1]),
    ...(rng() < 0.1 && { tokenVision: false }),
    ...(rng() < 0.2 && { exploredMemory: false }),
    ...(sightOnDrop && { sightOnDrop: true }),
    ...(rng() < 0.1 && { litThreshold: pick(rng, [0.1, 0.4]) }),
  };
  const base = initialState();
  if (!base.grid) throw new Error('A new store has a grid');
  const state: ViewAtlasState = {
    ...base,
    grid: { ...base.grid, size: pick(rng, [50, 70, 100]) },
    objects: { ...base.objects, tokens, walls: walls(rng, layout), lights: lights(rng, layout), lightZones: zones(rng, layout) },
    lighting,
    heldTokens,
  };
  const how = visionOf(rng, SCENE_SENSES);
  const rules: SightRules = { definitions: SCENE_SENSES, conditions: SCENE_CONDITIONS, ...(how && { visionOf: how }) };
  return { seed, state, bounds, rules, measurement: () => MEASUREMENT, malformed };
}

/** How many scenes the differentials run; the ship stage raises it. */
export function sceneTrials(fallback = 300): number {
  const value = Number(import.meta.env.VITE_SIGHT_TRIALS);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Consecutive seeds in blocks, one test per block, so that no test runs long whatever the trial count. */
export function seedBlocks(trials: number, size: number): number[][] {
  const blocks: number[][] = [];
  for (let start = 1; start <= trials; start += size) blocks.push(Array.from({ length: Math.min(size, trials - start + 1) }, (_, i) => start + i));
  return blocks;
}

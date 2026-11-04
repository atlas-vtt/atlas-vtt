import type { MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { ambientGate } from '../../src/app/lighting/lightActivity';
import type { ViewAtlasState } from '../../src/app/storeFactory';
import type { TokenEntity } from '../../src/app/types';
import type { LightEmission, LightSource, LightZone, SceneLighting } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import type { SightRules } from '../../src/app/vision/sightRules';
import type { MapBounds } from '../../src/app/vision/visibility';
import { seededRandom, sightScene, type Rng, type SightScene } from './sightScenes';

export const FIRST_BUILD = 'the first build';

/** Every way a scene changes between two updates of its model. */
export const STEP_KINDS = [
  'the same state again',
  'a new state object with the same records',
  'a vision token moved',
  'a held token moved while sight waits for the drop',
  'a held token moved while sight follows it',
  'the held tokens released',
  'a placed light moved',
  'a placed light\'s bright radius changed',
  'a placed light\'s colour changed',
  'a placed light made a darkness or a light again',
  'a placed light\'s priority changed',
  'a placed light\'s beam changed',
  'a placed light turned',
  'a carried light added',
  'a carried light removed',
  'a token hidden or shown',
  'a token\'s vision switched',
  'the ambient light changed',
  'the ambient light crossing a lamp\'s level',
  'a sight option changed',
  'a wall added',
  'a wall removed',
  'a door toggled',
  'a zone\'s level changed',
  'a zone\'s outline changed',
  'the grid size changed',
  'the rules replaced by an equal object',
  'the builder reset',
] as const;

export type StepKind = typeof STEP_KINDS[number];
type State = ViewAtlasState;

/** One update of a scene's model: the state it is given, its rules, and whether the builder is reset first. */
export interface SceneStep {
  kind: StepKind | typeof FIRST_BUILD;
  state: State;
  rules: SightRules;
  /** The builder is reset before this update, as when the map's size changed. */
  reset: boolean;
}

/** A scene and the states that follow it, each made from the one before so that untouched records stay the same objects. */
export interface SceneSequence {
  seed: number;
  bounds: MapBounds;
  measurement: () => MeasurementSettings;
  steps: SceneStep[];
}

type Change = Partial<Pick<SceneStep, 'state' | 'rules' | 'reset'>> | null;
type Changer = (rng: Rng, at: SceneStep, bounds: MapBounds, index: number) => Change;

const STEPS = 10;
const HEX_DIGITS = '0123456789abcdefABCDEF';

const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)]!;
const another = <T>(rng: Rng, items: readonly T[], now: T): T => pick(rng, items.filter((item) => item !== now));
const between = (rng: Rng, low: number, high: number): number => low + rng() * (high - low);

/** A `#rrggbb` colour in mixed case. */
export function seededColour(rng: Rng): string {
  return `#${Array.from({ length: 6 }, () => pick(rng, [...HEX_DIGITS])).join('')}`;
}

/** `record` with `key` set, or without it where `value` is undefined. */
function withField<T extends object, K extends keyof T>(record: T, key: K, value: T[K] | undefined): T {
  const next = { ...record };
  if (value === undefined) Reflect.deleteProperty(next, key);
  else next[key] = value;
  return next;
}

function withObjects(state: State, objects: Partial<State['objects']>): State {
  return { ...state, objects: { ...state.objects, ...objects } };
}

const withToken = (state: State, key: string, token: TokenEntity): State => withObjects(state, { tokens: { ...state.objects.tokens, [key]: token } });
const withLight = (state: State, light: LightSource): State => withObjects(state, { lights: { ...state.objects.lights, [light.id]: light } });
const withWall = (state: State, wall: WallSegment): State => withObjects(state, { walls: { ...state.objects.walls, [wall.id]: wall } });
const withZone = (state: State, zone: LightZone): State => withObjects(state, { lightZones: { ...state.objects.lightZones, [zone.id]: zone } });

function keyOf<T>(rng: Rng, record: Record<string, T> | undefined, accept: (entry: T) => boolean = () => true): string | undefined {
  const keys = Object.keys(record ?? {}).filter((key) => accept(record![key]!));
  return keys.length > 0 ? pick(rng, keys) : undefined;
}

function moved<T extends { x: number; y: number }>(rng: Rng, entry: T, bounds: MapBounds): T {
  const clamp = (value: number, size: number): number => Math.min(size - 10, Math.max(10, value));
  return { ...entry, x: clamp(entry.x + between(rng, -300, 300), bounds.width), y: clamp(entry.y + between(rng, -300, 300), bounds.height) };
}

/** A light's emission with a colour, strength and flicker of its own. */
function lit(rng: Rng, emission: LightEmission): LightEmission {
  return {
    ...emission, color: seededColour(rng), intensity: pick(rng, [0.5, 1, 1.5]), animation: pick(rng, ['none', 'torch', 'candle', 'pulse', 'magic'] as const),
    ...(rng() < 0.3 && { sourceRadius: pick(rng, [0.5, 2, 5]) }),
  };
}

function square(rng: Rng, bounds: MapBounds): LightZone['polygon'] {
  const size = between(rng, 150, 500);
  const x = between(rng, 0, bounds.width - size / 2);
  const y = between(rng, 0, bounds.height - size / 2);
  return [{ x, y }, { x: x + size, y }, { x: x + size, y: y + size }, { x, y: y + size }];
}

/** The generated scene with coloured lights, more lamps that follow the ambient light and more zones. */
function decorated(rng: Rng, { state, bounds }: SightScene): State {
  const lights: Record<string, LightSource> = {};
  for (const [id, light] of Object.entries(state.objects.lights)) {
    lights[id] = { ...light, emission: lit(rng, light.emission), ...(light.activeBelowAmbient === undefined && rng() < 0.15 && { activeBelowAmbient: pick(rng, [0.3, 0.6]) }) };
  }
  const tokens: Record<string, TokenEntity> = {};
  for (const [key, token] of Object.entries(state.objects.tokens)) tokens[key] = token.light ? { ...token, light: lit(rng, token.light) } : token;
  const lightZones: Record<string, LightZone> = {};
  for (const [id, zone] of Object.entries(state.objects.lightZones ?? {})) lightZones[id] = rng() < 0.5 ? { ...zone, ambientColor: seededColour(rng) } : zone;
  if (Object.keys(lightZones).length === 0 && rng() < 0.3) lightZones.added = { id: 'added', kind: 'light-zone', ambient: pick(rng, [0, 0.3, 1]), polygon: square(rng, bounds) };
  return withObjects(state, { lights, tokens, lightZones });
}

/** A change to one placed light, by choice one that `prefer` takes; none where no light is placed. */
function lightChange(change: (rng: Rng, light: LightSource, bounds: MapBounds) => LightSource, prefer: (light: LightSource) => boolean = () => true): Changer {
  return (rng, { state }, bounds) => {
    const id = keyOf(rng, state.objects.lights, prefer) ?? keyOf(rng, state.objects.lights);
    return id === undefined ? null : { state: withLight(state, change(rng, state.objects.lights[id]!, bounds)) };
  };
}

const emissionChange = (change: (rng: Rng, emission: LightEmission) => LightEmission): Changer =>
  lightChange((rng, light) => ({ ...light, emission: change(rng, light.emission) }));

/** A change to one token among those `accept` takes; none where no token is taken. */
function tokenChange(accept: (token: TokenEntity) => boolean, change: (rng: Rng, token: TokenEntity, bounds: MapBounds) => TokenEntity): Changer {
  return (rng, { state }, bounds) => {
    const key = keyOf(rng, state.objects.tokens, accept);
    return key === undefined ? null : { state: withToken(state, key, change(rng, state.objects.tokens[key]!, bounds)) };
  };
}

/** Moves a token the pointer holds, taking one first where none is held, with the scene's sight waiting for the drop or following. */
function drag(waits: boolean): Changer {
  return (rng, { state }, bounds) => {
    const { tokens } = state.objects;
    const named = (token: TokenEntity): boolean => typeof token.id === 'string';
    const key = keyOf(rng, tokens, (token) => named(token) && !!state.heldTokens[token.id])
      ?? keyOf(rng, tokens, (token) => named(token) && !!token.vision?.enabled) ?? keyOf(rng, tokens, named);
    if (key === undefined) return null;
    const token = tokens[key]!;
    const heldTokens = state.heldTokens[token.id] ? state.heldTokens : { ...state.heldTokens, [token.id]: { x: token.x, y: token.y } };
    const lighting = !!state.lighting.sightOnDrop === waits ? state.lighting : withField(state.lighting, 'sightOnDrop', waits || undefined);
    return { state: { ...withToken(state, key, moved(rng, token, bounds)), heldTokens, lighting } };
  };
}

/** A change to one light zone; none where the scene has no zone. */
function zoneChange(change: (rng: Rng, zone: LightZone, bounds: MapBounds) => LightZone): Changer {
  return (rng, { state }, bounds) => {
    const id = keyOf(rng, state.objects.lightZones);
    return id === undefined ? null : { state: withZone(state, change(rng, state.objects.lightZones![id]!, bounds)) };
  };
}

/** A change to the scene's lighting; none where `change` gives none. */
function lightingChange(change: (rng: Rng, now: SceneLighting, state: State) => SceneLighting | null): Changer {
  return (rng, { state }) => {
    const next = change(rng, state.lighting, state);
    return next && { state: { ...state, lighting: next } };
  };
}

const SIGHT_OPTIONS = [
  (rng: Rng, now: SceneLighting): SceneLighting => withField(now, 'tokenVision', now.tokenVision === false ? undefined : false),
  (rng: Rng, now: SceneLighting): SceneLighting => withField(now, 'exploredMemory', now.exploredMemory === false ? undefined : false),
  (rng: Rng, now: SceneLighting): SceneLighting => withField(now, 'litThreshold', another(rng, [undefined, 0.1, 0.4], now.litThreshold)),
  (rng: Rng, now: SceneLighting): SceneLighting => withField(now, 'brightThreshold', another(rng, [undefined, 0.6, 0.9], now.brightThreshold)),
];

function crossingALamp(rng: Rng, now: SceneLighting, state: State): SceneLighting | null {
  const id = keyOf(rng, state.objects.lights, (light) => !light.hidden && ambientGate(light) !== undefined);
  if (id === undefined) return null;
  const gate = ambientGate(state.objects.lights[id]!)!;
  // Just past the lamp's level, so that the lamp is often all that changes: the scene stays as dark, dim or bright as it was.
  return { ...now, ambient: now.ambient > gate ? Math.max(0, gate - 0.02) : Math.min(1, gate + 0.02) };
}

const CHANGES: Record<StepKind, Changer> = {
  'the same state again': () => ({}),
  'a new state object with the same records': (rng, { state }) => ({ state: { ...state } }),
  'a vision token moved': tokenChange((token) => !!token.vision?.enabled, moved),
  'a held token moved while sight waits for the drop': drag(true),
  'a held token moved while sight follows it': drag(false),
  'the held tokens released': (rng, { state }) => (Object.keys(state.heldTokens).length > 0 ? { state: { ...state, heldTokens: {} } } : null),
  'a placed light moved': lightChange(moved),
  'a placed light\'s bright radius changed': emissionChange((rng, emission) => ({ ...emission, bright: (emission.bright + 1 + Math.floor(rng() * 3)) % (Math.floor(emission.dim) + 1) })),
  'a placed light\'s colour changed': emissionChange((rng, emission) => ({ ...emission, color: seededColour(rng) })),
  'a placed light made a darkness or a light again': emissionChange((rng, emission) => withField(emission, 'darkness', emission.darkness ? undefined : true)),
  'a placed light\'s priority changed': emissionChange((rng, emission) => withField(emission, 'priority', another(rng, [undefined, 0, 1, 2], emission.priority))),
  'a placed light\'s beam changed': emissionChange((rng, emission) => withField(emission, 'angle', another(rng, [undefined, 53, 90, 180], emission.angle))),
  'a placed light turned': lightChange((rng, light) => ({ ...light, rotation: ((light.rotation ?? 0) + 15 + Math.floor(rng() * 300)) % 360 }), (light) => light.emission.angle !== undefined),
  'a carried light added': tokenChange((token) => !token.light, (rng, token) => ({ ...token, light: lit(rng, { bright: 10, dim: 15 + Math.floor(rng() * 30), color: '#ffffff', intensity: 1, animation: 'none' }) })),
  'a carried light removed': tokenChange((token) => !!token.light, (rng, token) => withField(token, 'light', undefined)),
  'a token hidden or shown': tokenChange(() => true, (rng, token) => withField(token, 'isHidden', token.isHidden ? undefined : true)),
  'a token\'s vision switched': tokenChange(() => true, (rng, token) => ({ ...token, vision: token.vision ? { ...token.vision, enabled: !token.vision.enabled } : { enabled: true, range: 30 } })),
  'the ambient light changed': lightingChange((rng, now) => ({ ...now, ambient: another(rng, [0, 0.1, 0.2, 0.5, 0.8, 1], now.ambient) })),
  'the ambient light crossing a lamp\'s level': lightingChange(crossingALamp),
  'a sight option changed': lightingChange((rng, now) => pick(rng, SIGHT_OPTIONS)(rng, now)),
  'a wall added': (rng, { state }, bounds, index) => {
    const p1 = { x: between(rng, 0, bounds.width), y: between(rng, 0, bounds.height) };
    const angle = rng() * Math.PI * 2;
    const length = between(rng, 50, 400);
    return { state: withWall(state, { id: `added-${index}`, kind: 'wall', type: 'solid', p1, p2: { x: p1.x + Math.cos(angle) * length, y: p1.y + Math.sin(angle) * length } }) };
  },
  'a wall removed': (rng, { state }) => {
    const key = keyOf(rng, state.objects.walls);
    return key === undefined ? null : { state: withObjects(state, { walls: withField(state.objects.walls, key, undefined) }) };
  },
  'a door toggled': (rng, { state }) => {
    const key = keyOf(rng, state.objects.walls, (wall) => wall.type !== 'solid');
    if (key === undefined) return null;
    const door = state.objects.walls[key]!;
    return { state: withWall(state, { ...door, closed: !door.closed }) };
  },
  'a zone\'s level changed': zoneChange((rng, zone) => ({ ...zone, ambient: another(rng, [0, 0.3, 1], zone.ambient) })),
  'a zone\'s outline changed': zoneChange((rng, zone, bounds) => ({ ...zone, polygon: square(rng, bounds) })),
  'the grid size changed': (rng, { state }) => (state.grid ? { state: { ...state, grid: { ...state.grid, size: another(rng, [50, 70, 100], state.grid.size) } } } : null),
  'the rules replaced by an equal object': (rng, { rules }) => ({ rules: { ...rules } }),
  'the builder reset': () => ({ reset: true }),
};

/** One seeded scene and ten changes to it, each of a kind the scene has something for. */
export function sceneSequence(seed: number): SceneSequence {
  const scene = sightScene(seed);
  const rng = seededRandom(seed * 104729 + 71);
  const steps: SceneStep[] = [{ kind: FIRST_BUILD, state: decorated(rng, scene), rules: scene.rules, reset: false }];
  while (steps.length <= STEPS) {
    const last = steps[steps.length - 1]!;
    const kind = pick(rng, STEP_KINDS);
    const change = CHANGES[kind](rng, last, scene.bounds, steps.length);
    if (change) steps.push({ state: last.state, rules: last.rules, reset: false, ...change, kind });
  }
  return { seed, bounds: scene.bounds, measurement: scene.measurement, steps };
}

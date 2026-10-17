import { isRecord } from './shape.ts';
import { MAX_COORDINATE, MAX_TOKEN_SIZE, TOKEN_ID_PATTERN } from './tokens.ts';

/** Walls one `lighting` message may carry (a Universal VTT import's limit). */
export const MAX_WALLS = 20_000;
/** Placed lights one `sight` message may carry. */
export const MAX_LIGHTS = 2_000;
/** Light zones, and corners of one zone (Atlas reads no more). */
export const MAX_ZONES = 64;
export const MAX_ZONE_CORNERS = 64;
/** Sense definitions of the scene's collection. */
export const MAX_SENSES = 64;
/** Tokens sight and light are worked out from: those the players see and those that only see or shine. */
export const MAX_SIGHT_TOKENS = 1_000;

/** What a condition does to sight (Atlas's `ConditionEffect`). */
export const CONDITION_EFFECTS = ['blinded', 'no-vision', 'invisible', 'airborne', 'undetected'] as const;
export type SharedEffect = (typeof CONDITION_EFFECTS)[number];

/** A JSON object the client reads further with Atlas's own readers (a light's emission, the lighting options, a sense). */
export type JsonRecord = Readonly<Record<string, unknown>>;

/** A wall as light and sight read it. A closed secret door is a plain wall; nothing says a door is locked. */
export interface SharedWall {
  /** The ends: `[x1, y1, x2, y2]` in world pixels. */
  readonly p: readonly [number, number, number, number];
  readonly door?: 'open' | 'closed';
  readonly direction?: 'left' | 'right';
  readonly blocks?: 'sight' | 'light';
  readonly limited?: true;
}

/** A light zone: its corners flat `[x0, y0, …]`, its ambient light and its own tint. */
export interface SharedZone {
  readonly polygon: readonly number[];
  readonly ambient: number;
  readonly colour?: string;
}

export interface SharedLight {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly emission: JsonRecord;
  readonly rotation?: number;
  readonly activeBelowAmbient?: number;
}

/** How a vision token perceives, worked out by the GM (statblock senses included). Ranges in game units. */
export interface SharedVision {
  readonly angle?: number;
  readonly senses: readonly { readonly id: string; readonly range?: number }[];
  readonly sightRange?: number;
  readonly pending?: true;
}

/** A token as sight and light read it: one the players see, or one that sees or shines unseen (position only). */
export interface SightToken {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  /** In grid cells, as the token's own `size`. */
  readonly size: number;
  readonly rotation?: number;
  readonly vision?: SharedVision;
  readonly light?: JsonRecord;
  readonly effects?: readonly SharedEffect[];
}

/** The parts of a lit scene that change seldom: walls, zones, scale and senses. */
export interface SharedLightingScene {
  readonly cellSize: number;
  readonly unitDistance: number;
  readonly walls: readonly SharedWall[];
  readonly zones: readonly SharedZone[];
  readonly senses: readonly JsonRecord[];
}

/** The parts of a lit scene that change while it is played: its lighting, its lights and its tokens. */
export interface SharedSight {
  readonly lighting: JsonRecord;
  readonly lights: readonly SharedLight[];
  readonly tokens: readonly SightToken[];
  /** Where the tokens the GM holds were taken from, while sight waits for the drop. */
  readonly held: readonly { readonly id: string; readonly x: number; readonly y: number }[];
  /**
   * Players have no sight although no token they get sees: every vision token is hidden. Without
   * a vision token, Atlas's players would otherwise see everything the light shows.
   */
  readonly blind?: true;
}

const isFiniteIn = (value: unknown, min: number, max: number): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
const isCoordinate = (value: unknown): value is number => isFiniteIn(value, -MAX_COORDINATE, MAX_COORDINATE);
const isDistance = (value: unknown): value is number => isFiniteIn(value, 0, MAX_COORDINATE);
const isId = (value: unknown): value is string => typeof value === 'string' && TOKEN_ID_PATTERN.test(value);
const isAngle = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isShortText = (value: unknown): value is string => typeof value === 'string' && value.length <= 64;

/** The elements of an array of at most `max`, each read by `read`; null when one is malformed. */
function listOf<T>(value: unknown, max: number, read: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const list: T[] = [];
  for (const entry of value) {
    const item = read(entry);
    if (item === null) return null;
    list.push(item);
  }
  return list;
}

function parseWall(value: unknown): SharedWall | null {
  if (!isRecord(value) || !Array.isArray(value.p) || value.p.length !== 4 || !value.p.every(isCoordinate)) return null;
  const [x1, y1, x2, y2] = value.p as [number, number, number, number];
  const { door, direction, blocks, limited } = value;
  if (door !== undefined && door !== 'open' && door !== 'closed') return null;
  if (direction !== undefined && direction !== 'left' && direction !== 'right') return null;
  if (blocks !== undefined && blocks !== 'sight' && blocks !== 'light') return null;
  if (limited !== undefined && limited !== true) return null;
  return { p: [x1, y1, x2, y2], ...(door && { door }), ...(direction && { direction }), ...(blocks && { blocks }), ...(limited && { limited }) };
}

function parseZone(value: unknown): SharedZone | null {
  if (!isRecord(value) || !Array.isArray(value.polygon) || value.polygon.length % 2 !== 0 || value.polygon.length > MAX_ZONE_CORNERS * 2) return null;
  if (!value.polygon.every(isCoordinate) || !isFiniteIn(value.ambient, 0, 1)) return null;
  if (value.colour !== undefined && !isShortText(value.colour)) return null;
  return { polygon: value.polygon, ambient: value.ambient, ...(value.colour !== undefined && { colour: value.colour }) };
}

function parseLight(value: unknown): SharedLight | null {
  if (!isRecord(value) || !isId(value.id) || !isCoordinate(value.x) || !isCoordinate(value.y) || !isRecord(value.emission)) return null;
  if (value.rotation !== undefined && !isAngle(value.rotation)) return null;
  if (value.activeBelowAmbient !== undefined && !isFiniteIn(value.activeBelowAmbient, 0, 1)) return null;
  return {
    id: value.id, x: value.x, y: value.y, emission: value.emission,
    ...(value.rotation !== undefined && { rotation: value.rotation }),
    ...(value.activeBelowAmbient !== undefined && { activeBelowAmbient: value.activeBelowAmbient }),
  };
}

function parseSense(value: unknown): SharedVision['senses'][number] | null {
  if (!isRecord(value) || !isShortText(value.id)) return null;
  if (value.range !== undefined && !isDistance(value.range)) return null;
  return { id: value.id, ...(value.range !== undefined && { range: value.range }) };
}

function parseVision(value: unknown): SharedVision | null {
  if (!isRecord(value)) return null;
  const senses = listOf(value.senses, MAX_SENSES, parseSense);
  if (senses === null || (value.angle !== undefined && !isFiniteIn(value.angle, 0, 360))) return null;
  if ((value.sightRange !== undefined && !isDistance(value.sightRange)) || (value.pending !== undefined && value.pending !== true)) return null;
  return {
    senses, ...(value.angle !== undefined && { angle: value.angle }), ...(value.sightRange !== undefined && { sightRange: value.sightRange }),
    ...(value.pending === true && { pending: true }),
  };
}

const isEffect = (value: unknown): value is SharedEffect => (CONDITION_EFFECTS as readonly unknown[]).includes(value);

function parseSightToken(value: unknown): SightToken | null {
  if (!isRecord(value) || !isId(value.id) || !isCoordinate(value.x) || !isCoordinate(value.y) || !isFiniteIn(value.size, 0, MAX_TOKEN_SIZE)) return null;
  if (value.rotation !== undefined && !isAngle(value.rotation)) return null;
  const vision = value.vision === undefined ? undefined : parseVision(value.vision);
  if (vision === null || (value.light !== undefined && !isRecord(value.light))) return null;
  const effects = value.effects === undefined ? undefined : listOf(value.effects, CONDITION_EFFECTS.length, (entry) => (isEffect(entry) ? entry : null));
  if (effects === null) return null;
  return {
    id: value.id, x: value.x, y: value.y, size: value.size,
    ...(value.rotation !== undefined && { rotation: value.rotation }), ...(vision && { vision }),
    ...(isRecord(value.light) && { light: value.light }), ...(effects && { effects }),
  };
}

function parseHeld(value: unknown): SharedSight['held'][number] | null {
  return isRecord(value) && isId(value.id) && isCoordinate(value.x) && isCoordinate(value.y) ? { id: value.id, x: value.x, y: value.y } : null;
}

/** The fields of a `lighting` message, or null for anything malformed. */
export function parseLightingScene(value: Record<string, unknown>): SharedLightingScene | null {
  if (!isFiniteIn(value.cellSize, Number.MIN_VALUE, MAX_TOKEN_SIZE) || !isFiniteIn(value.unitDistance, Number.MIN_VALUE, MAX_COORDINATE)) return null;
  const walls = listOf(value.walls, MAX_WALLS, parseWall);
  const zones = listOf(value.zones, MAX_ZONES, parseZone);
  const senses = listOf(value.senses, MAX_SENSES, (entry) => (isRecord(entry) ? entry : null));
  if (walls === null || zones === null || senses === null) return null;
  return { cellSize: value.cellSize, unitDistance: value.unitDistance, walls, zones, senses };
}

/** The fields of a `sight` message, or null for anything malformed. */
export function parseSight(value: Record<string, unknown>): SharedSight | null {
  if (!isRecord(value.lighting)) return null;
  const lights = listOf(value.lights, MAX_LIGHTS, parseLight);
  const tokens = listOf(value.tokens, MAX_SIGHT_TOKENS, parseSightToken);
  const held = listOf(value.held, MAX_SIGHT_TOKENS, parseHeld);
  if (lights === null || tokens === null || held === null || (value.blind !== undefined && value.blind !== true)) return null;
  return { lighting: value.lighting, lights, tokens, held, ...(value.blind === true && { blind: true as const }) };
}

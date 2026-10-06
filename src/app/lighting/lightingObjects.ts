import { LIMITED_WALLS } from '../featureFlags';
import { isRecord } from '../utils/guards';
import type { LightEmission, LightSource } from '../types/lightingTypes';
import type { WallSegment } from '../types/wallTypes';
import { isHexColor } from '../utils/hexColor';

/**
 * Lights and walls as lighting and sight read them. A map file arrives unchecked (a hand edit,
 * a sync conflict, a newer Atlas, another program) and the store keeps what it holds, so that
 * the next save writes it back: what cannot be read is passed over here, at reading, and
 * nothing is removed from the file. An object that is no light or wall at all (no place, no
 * radius) reads as none; a field of the wrong type reads as unset.
 *
 * An object with nothing wrong is read as itself, and one that needed mending as the same view
 * every time, so whoever compares lights or walls finds unchanged ones unchanged.
 */

const emissions = new WeakMap<object, LightEmission | null>();
const lights = new WeakMap<object, LightSource | null>();
const walls = new WeakMap<object, WallSegment | null>();
const lists = new WeakMap<object, readonly LightSource[]>();

const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** A light's emission, a placed light's or one a token carries: none without a bright and a dim radius. */
export function readEmission(value: unknown): LightEmission | null {
  if (!isRecord(value)) return null;
  if (!emissions.has(value)) emissions.set(value, emissionOf(value));
  return emissions.get(value) ?? null;
}

function emissionOf(value: Record<string, unknown>): LightEmission | null {
  if (!finite(value.bright) || !finite(value.dim)) return null;
  const { color, intensity, animation, priority, darkness, sourceRadius, ...rest } = value;
  const sound = isHexColor(color) && finite(intensity) && typeof animation === 'string'
    && (priority === undefined || finite(priority)) && (darkness === undefined || darkness === true) && (sourceRadius === undefined || finite(sourceRadius));
  if (sound) return value as unknown as LightEmission;
  return {
    ...rest,
    color: isHexColor(color) ? color : '#ffffff',
    intensity: finite(intensity) ? intensity : 1,
    animation: typeof animation === 'string' ? animation : 'none',
    ...(finite(priority) && { priority }),
    ...(darkness === true && { darkness }),
    ...(finite(sourceRadius) && { sourceRadius }),
  } as unknown as LightEmission;
}

/** A placed light: none without a place and an emission; a rotation that is no number reads as unset. */
export function readLight(value: unknown): LightSource | null {
  if (!isRecord(value)) return null;
  if (!lights.has(value)) lights.set(value, lightOf(value));
  return lights.get(value) ?? null;
}

function lightOf(value: Record<string, unknown>): LightSource | null {
  const emission = readEmission(value.emission);
  if (typeof value.id !== 'string' || !finite(value.x) || !finite(value.y) || !emission) return null;
  const { rotation, ...rest } = value;
  if (emission === value.emission && (rotation === undefined || finite(rotation))) return value as unknown as LightSource;
  return { ...rest, ...(finite(rotation) && { rotation }), emission } as unknown as LightSource;
}

/** The lights of a store's `objects.lights` that can be read, the same list for as long as the record is unchanged. */
export function lightList(record: Record<string, LightSource> | undefined): readonly LightSource[] {
  if (!isRecord(record)) return NO_LIGHTS;
  let list = lists.get(record);
  if (!list) {
    list = Object.values(record).flatMap((value) => readLight(value) ?? []);
    lists.set(record, list);
  }
  return list;
}

const NO_LIGHTS: readonly LightSource[] = [];

/**
 * A wall: none without two ends that are numbers; a door is locked only where its `locked` is
 * `true`, a wall blocks one thing only where `blocks` names sight or light (anything else
 * reads as a wall for both), and it is limited only where `limited` is `true` and limited
 * walls are switched on (`LIMITED_WALLS`): this is the one place that decides it, for sight,
 * light, the sealing, the engine's fields and masks, the wall editor's look and its menu.
 */
export function readWall(value: unknown): WallSegment | null {
  if (!isRecord(value)) return null;
  if (!walls.has(value)) walls.set(value, wallOf(value));
  return walls.get(value) ?? null;
}

function wallOf(value: Record<string, unknown>): WallSegment | null {
  const isEnd = (end: unknown): boolean => isRecord(end) && finite(end.x) && finite(end.y);
  if (typeof value.id !== 'string' || !isEnd(value.p1) || !isEnd(value.p2)) return null;
  const { locked, blocks, limited, ...rest } = value;
  const flag = (it: unknown): boolean => it === undefined || it === true;
  // With limited walls switched off, a wall that says it is limited reads as a wall like any other: it blocks.
  const isLimited = LIMITED_WALLS && limited === true;
  if (flag(locked) && (limited === undefined || isLimited) && (blocks === undefined || blocks === 'sight' || blocks === 'light')) return value as unknown as WallSegment;
  return { ...rest, ...(locked === true && { locked }), ...(isLimited ? { limited: true } : {}), ...((blocks === 'sight' || blocks === 'light') && { blocks }) } as unknown as WallSegment;
}

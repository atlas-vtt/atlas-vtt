import { isPersistedMapEnvelope, type PersistedMapEnvelope } from '../services/MapPersistence';
import { isRecord } from '../utils/guards';

/** Bumped when the layout of a snapshot file changes. */
export const SNAPSHOT_FORMAT = 1;

type MapState = NonNullable<PersistedMapEnvelope['state']>;

/**
 * Saved map state that belongs to the session rather than to the scene. A
 * snapshot leaves it out, and restoring one keeps what the map has now: the
 * file a map lives in, the camera, the dice rolled at the table and the loot
 * roller with the loot it rolled.
 */
const SESSION_KEYS = ['mapPath', 'camera', 'diceLog', 'lootRoller'] as const;

/**
 * One named state of a scene. It is the scene's persisted map envelope
 * (`{ state, version }`) plus a name, so every reader and migration of map
 * files understands it as well.
 */
export interface SceneSnapshot {
  format: number;
  id: string;
  name: string;
  /** Unix time in milliseconds. */
  createdAt: number;
  /** When the snapshot was last overwritten with the map's state, in Unix milliseconds. */
  updatedAt?: number;
  version?: number;
  state: MapState;
}

/** Trust boundary for a parsed snapshot file. */
export function isSceneSnapshot(value: unknown): value is SceneSnapshot {
  return isRecord(value)
    && typeof value.format === 'number'
    && typeof value.id === 'string'
    && typeof value.name === 'string'
    && typeof value.createdAt === 'number'
    && (value.updatedAt === undefined || typeof value.updatedAt === 'number')
    && isRecord(value.state)
    && isPersistedMapEnvelope(value);
}

/** The scene part of a map envelope, as a snapshot stores it. */
export function createSnapshot(envelope: PersistedMapEnvelope, id: string, name: string, createdAt: number): SceneSnapshot {
  const state: MapState = { ...envelope.state };
  for (const key of SESSION_KEYS) Reflect.deleteProperty(state, key);
  return {
    format: SNAPSHOT_FORMAT,
    id,
    name,
    createdAt,
    ...(envelope.version !== undefined ? { version: envelope.version } : {}),
    state,
  };
}

/**
 * The map envelope after restoring `snapshot` over `current`: everything the
 * snapshot holds replaces the map's state, the session keys stay as they are.
 */
export function restoreSnapshot(current: PersistedMapEnvelope, snapshot: SceneSnapshot, mapPath: string): PersistedMapEnvelope {
  const version = snapshot.version ?? current.version;
  return {
    ...(version !== undefined ? { version } : {}),
    state: { ...current.state, ...snapshot.state, mapPath },
  };
}

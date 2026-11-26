import { MAX_SCENE_ID } from './moves.ts';
import { MAX_COORDINATE, TOKEN_ID_PATTERN } from './tokens.ts';

/** A door as players name it: its ends `[x1, y1, x2, y2]` in world pixels, as its badge (`SharedDoor.p`) gives them. */
export type DoorEnds = readonly [number, number, number, number];

/**
 * A player asks the GM to open a closed door their token `id` stands at (added later). The GM is
 * asked only where the rules allow it (`SharedRules.doors`), and answers with `door-answer`.
 */
export interface PlayerDoorAsk {
  readonly t: 'door-ask';
  readonly scene: string;
  readonly id: string;
  readonly door: DoorEnds;
}

/** The GM's answer to a player's `door-ask`: the door opened (`open`), or it stays shut. */
export interface DoorAnswer {
  readonly t: 'door-answer';
  readonly scene: string;
  readonly door: DoorEnds;
  readonly open: boolean;
}

/**
 * A player's token `id` met a wall or a closed door on a step towards `dx`, `dy` (a direction, each
 * part within -1 and 1) and stayed where it was (added later): the GM's map shows it bump there, so a
 * shared screen shows it as the player's own map does.
 */
export interface PlayerBump {
  readonly t: 'bump';
  readonly scene: string;
  readonly id: string;
  readonly dx: number;
  readonly dy: number;
}

const isSceneId = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_SCENE_ID;
const isTokenId = (value: unknown): value is string => typeof value === 'string' && TOKEN_ID_PATTERN.test(value);
const isPart = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= 1;

/** A door's ends, or null for anything malformed. */
export function parseDoorEnds(value: unknown): DoorEnds | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const ends = value as unknown[];
  if (!ends.every((part) => typeof part === 'number' && Number.isFinite(part) && Math.abs(part) <= MAX_COORDINATE)) return null;
  const [x1, y1, x2, y2] = ends as [number, number, number, number];
  return [x1, y1, x2, y2];
}

/** A door ask as the GM reads it, or null for anything malformed. */
export function parseDoorAsk(value: Record<string, unknown>): PlayerDoorAsk | null {
  const { scene, id } = value;
  const door = parseDoorEnds(value.door);
  return isSceneId(scene) && isTokenId(id) && door !== null ? { t: 'door-ask', scene, id, door } : null;
}

/** A door answer as the client reads it, or null for anything malformed. */
export function parseDoorAnswer(value: Record<string, unknown>): DoorAnswer | null {
  const { scene, open } = value;
  const door = parseDoorEnds(value.door);
  return isSceneId(scene) && door !== null && typeof open === 'boolean' ? { t: 'door-answer', scene, door, open } : null;
}

/** A bump as the GM reads it, or null for anything malformed or without a direction. */
export function parseBump(value: Record<string, unknown>): PlayerBump | null {
  const { scene, id, dx, dy } = value;
  if (!isSceneId(scene) || !isTokenId(id) || !isPart(dx) || !isPart(dy) || (dx === 0 && dy === 0)) return null;
  return { t: 'bump', scene, id, dx, dy };
}

/** Whether two doors' ends name the same door: the same ends, either way round. */
export function sameDoor(a: DoorEnds, b: DoorEnds): boolean {
  return (a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3]) || (a[0] === b[2] && a[1] === b[3] && a[2] === b[0] && a[3] === b[1]);
}

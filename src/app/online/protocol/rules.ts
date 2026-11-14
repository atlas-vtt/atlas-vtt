import { parseRollDice, type SharedRollDice } from './dice.ts';
import { isRecord } from './shape.ts';
import { MAX_SCENE_ID, parseSnapGrid, type SnapGrid } from './moves.ts';
import { MAX_COORDINATE } from './tokens.ts';

/** The most range bands a measurement names. */
export const MAX_RANGE_BANDS = 32;
/** The longest name of a range band. */
export const MAX_BAND_NAME = 64;
/** The longest name of a unit. */
export const MAX_UNIT_NAME = 12;
/** The most movement steps a map names, the longest name of one and the largest multiple of a speed one reaches. */
export const MAX_MOVE_STEPS = 4;
export const MAX_MOVE_STEP_NAME = 24;
export const MAX_MOVE_MULTIPLE = 100;

/**
 * How the GM's Atlas labels a measured distance and shapes a measured area: the map's collection
 * settings, as its own ruler reads them. `manhattan`, `coneEnd`, `cellRule` and `unitName` were added
 * later: an older GM tells none of them, and an older page reads the measurement without them, by
 * the fields that were there before, which say the nearest thing it knows.
 */
export interface SharedMeasurement {
  readonly mode: 'metric' | 'abstract';
  readonly unitType: 'feet' | 'yards' | 'meters' | 'units' | 'custom';
  /** Game units one cell of this map spans. */
  readonly unitDistance: number;
  /** Game units one rules square spans. */
  readonly ruleDistance: number;
  readonly diagonalRule: 'equidistant' | 'alternating' | 'euclidean';
  readonly rangeBands: readonly { readonly name: string; readonly maxSquares: number }[];
  /** Full opening of a cone, in degrees. */
  readonly coneAngle: number;
  /** Every diagonal step costs two. `diagonalRule` then says `alternating`. */
  readonly manhattan?: true;
  /** A cone ends on a straight side across its length; unset, on an arc. */
  readonly coneEnd?: 'flat';
  /** An area covers a cell whose centre lies in it, or one any part of which does; unset, one at least half of which does. */
  readonly cellRule?: 'centre' | 'any';
  /** The unit's name as the GM typed it, written after a distance as text. `unitType` then says `custom`. */
  readonly unitName?: string;
}

/** One step of movement: every distance up to `multiple` times a token's speed, past the step before, drawn in `colour` (`#rrggbb`). */
export interface SharedMoveStep {
  readonly name: string;
  readonly multiple: number;
  readonly colour: string;
}

/**
 * What a player's own tools work by in the shared scene: its grid, whether measurements snap to cell
 * centres, how distances are labelled, and the GM's accent colour (`#rrggbb`, null when it cannot be read).
 * `cursors` is set while the GM lets everyone see each other's cursor: only then does a player send theirs.
 * `dice` are the map's dice a roll naming no token of the player's own set is made with (added later:
 * an older GM sends none, and a page offers no advantage then).
 * `draw` is set while the GM lets players draw on the map (added later): `cell` is the side of the
 * cell the Draw tool's named sizes are shares of there, in world pixels. Without it the GM takes no
 * drawing from a player.
 * `moveSteps` are the steps a token's move falls into on this map, in rising order (added later): a
 * drag of a token that tells its speed (`SharedToken.move`) takes its step's colour and reads
 * against how far that step reaches. Without them a drag reads as its distance alone.
 */
export interface SharedRules {
  readonly grid: SnapGrid;
  readonly snap: boolean;
  readonly measurement: SharedMeasurement;
  readonly accent: string | null;
  readonly cursors?: true;
  readonly dice?: SharedRollDice;
  readonly draw?: { readonly cell: number };
  readonly moveSteps?: readonly SharedMoveStep[];
}

export type RulesMessage = { readonly t: 'rules'; readonly scene: string } & SharedRules;

const MODES: readonly string[] = ['metric', 'abstract'];
const UNIT_TYPES: readonly string[] = ['feet', 'yards', 'meters', 'units', 'custom'];
const DIAGONAL_RULES: readonly string[] = ['equidistant', 'alternating', 'euclidean'];
const CELL_RULES: readonly string[] = ['centre', 'any'];
const ACCENT = /^#[0-9a-f]{6}$/i;

const isDistance = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= MAX_COORDINATE;
const isOneOf = <T extends string>(value: unknown, list: readonly string[]): value is T => typeof value === 'string' && list.includes(value);

function parseBands(value: unknown): SharedMeasurement['rangeBands'] | null {
  if (!Array.isArray(value) || value.length > MAX_RANGE_BANDS) return null;
  const bands = value.flatMap((band: unknown) => {
    if (!isRecord(band) || typeof band.name !== 'string' || band.name.length > MAX_BAND_NAME) return [];
    const { maxSquares } = band;
    return typeof maxSquares === 'number' && Number.isFinite(maxSquares) && maxSquares >= 0 && maxSquares <= MAX_COORDINATE ? [{ name: band.name, maxSquares }] : [];
  });
  return bands.length === value.length ? bands : null;
}

/**
 * A measurement as the client reads it, or null for anything malformed. A field added later that
 * is malformed is left out, as the map's dice are: a GM newer than this reader may say a value it
 * does not know, and the measurement then reads by the older fields.
 */
export function parseMeasurement(value: unknown): SharedMeasurement | null {
  if (!isRecord(value)) return null;
  const { mode, unitType, unitDistance, ruleDistance, diagonalRule, coneAngle, manhattan, coneEnd, cellRule, unitName } = value;
  const rangeBands = parseBands(value.rangeBands);
  if (!isOneOf<SharedMeasurement['mode']>(mode, MODES) || !isOneOf<SharedMeasurement['unitType']>(unitType, UNIT_TYPES)
    || !isOneOf<SharedMeasurement['diagonalRule']>(diagonalRule, DIAGONAL_RULES) || rangeBands === null
    || !isDistance(unitDistance) || !isDistance(ruleDistance) || !isDistance(coneAngle) || coneAngle > 360) return null;
  return {
    mode, unitType, unitDistance, ruleDistance, diagonalRule, rangeBands, coneAngle,
    ...(manhattan === true && { manhattan }),
    ...(coneEnd === 'flat' && { coneEnd }),
    ...(isOneOf<NonNullable<SharedMeasurement['cellRule']>>(cellRule, CELL_RULES) && { cellRule }),
    ...(typeof unitName === 'string' && unitName.length > 0 && unitName.length <= MAX_UNIT_NAME && { unitName }),
  };
}

/** The movement steps of a `rules` message, or undefined for none and for any that cannot be read: a drag then reads as its distance alone. */
function parseMoveSteps(value: unknown): SharedMoveStep[] | undefined {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MOVE_STEPS) return undefined;
  const steps: SharedMoveStep[] = [];
  for (const step of value as unknown[]) {
    if (!isRecord(step)) return undefined;
    const { name, multiple, colour } = step;
    if (typeof name !== 'string' || name.length > MAX_MOVE_STEP_NAME || typeof colour !== 'string' || !ACCENT.test(colour)) return undefined;
    if (typeof multiple !== 'number' || !(multiple > (steps.at(-1)?.multiple ?? 0)) || multiple > MAX_MOVE_MULTIPLE) return undefined;
    steps.push({ name, multiple, colour });
  }
  return steps;
}

/** A `rules` message as the client reads it, or null for anything malformed; malformed dice are left out. */
export function parseRules(value: Record<string, unknown>): RulesMessage | null {
  const { scene, snap, accent, cursors } = value;
  const grid = parseSnapGrid(value.grid);
  const measurement = parseMeasurement(value.measurement);
  if (typeof scene !== 'string' || scene.length > MAX_SCENE_ID || typeof snap !== 'boolean' || grid === null || grid === undefined || measurement === null) return null;
  if (accent !== null && (typeof accent !== 'string' || !ACCENT.test(accent))) return null;
  if (cursors !== undefined && cursors !== true) return null;
  const dice = parseRollDice(value.dice);
  // A word about drawing that cannot be read is left out: players then do not draw.
  const draw = isRecord(value.draw) && isDistance(value.draw.cell) ? { cell: value.draw.cell } : undefined;
  const moveSteps = parseMoveSteps(value.moveSteps);
  return { t: 'rules', scene, grid, snap, measurement, accent, ...(cursors === true && { cursors }), ...(dice !== undefined && { dice }), ...(draw !== undefined && { draw }), ...(moveSteps !== undefined && { moveSteps }) };
}

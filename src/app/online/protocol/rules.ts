import { parseRollDice, type SharedRollDice } from './dice.ts';
import { isRecord } from './shape.ts';
import { MAX_SCENE_ID, parseSnapGrid, type SnapGrid } from './moves.ts';
import { MAX_COORDINATE } from './tokens.ts';

/** The most range bands a measurement names. */
export const MAX_RANGE_BANDS = 32;
/** The longest name of a range band. */
export const MAX_BAND_NAME = 64;

/** How the GM's Atlas labels a measured distance: the map's collection settings, as its own ruler reads them. */
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
}

/**
 * What a player's own tools work by in the shared scene: its grid, whether measurements snap to cell
 * centres, how distances are labelled, and the GM's accent colour (`#rrggbb`, null when it cannot be read).
 * `cursors` is set while the GM lets everyone see each other's cursor: only then does a player send theirs.
 * `dice` are the map's dice a roll naming no token of the player's own set is made with (added later:
 * an older GM sends none, and a page offers no advantage then).
 */
export interface SharedRules {
  readonly grid: SnapGrid;
  readonly snap: boolean;
  readonly measurement: SharedMeasurement;
  readonly accent: string | null;
  readonly cursors?: true;
  readonly dice?: SharedRollDice;
}

export type RulesMessage = { readonly t: 'rules'; readonly scene: string } & SharedRules;

const MODES: readonly string[] = ['metric', 'abstract'];
const UNIT_TYPES: readonly string[] = ['feet', 'yards', 'meters', 'units', 'custom'];
const DIAGONAL_RULES: readonly string[] = ['equidistant', 'alternating', 'euclidean'];
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

/** A measurement as the client reads it, or null for anything malformed. */
export function parseMeasurement(value: unknown): SharedMeasurement | null {
  if (!isRecord(value)) return null;
  const { mode, unitType, unitDistance, ruleDistance, diagonalRule, coneAngle } = value;
  const rangeBands = parseBands(value.rangeBands);
  if (!isOneOf<SharedMeasurement['mode']>(mode, MODES) || !isOneOf<SharedMeasurement['unitType']>(unitType, UNIT_TYPES)
    || !isOneOf<SharedMeasurement['diagonalRule']>(diagonalRule, DIAGONAL_RULES) || rangeBands === null
    || !isDistance(unitDistance) || !isDistance(ruleDistance) || !isDistance(coneAngle) || coneAngle > 360) return null;
  return { mode, unitType, unitDistance, ruleDistance, diagonalRule, rangeBands, coneAngle };
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
  return { t: 'rules', scene, grid, snap, measurement, accent, ...(cursors === true && { cursors }), ...(dice !== undefined && { dice }) };
}

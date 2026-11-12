/**
 * Turns a distance in grid cells into the label the ruler and the token drag
 * ruler show, using the collection's measurement settings or, for maps outside
 * a collection, the map's own grid units.
 */

import { DEFAULT_AREA_CELL_RULE, DEFAULT_CONE_END, type AreaCellRule, type ConeEnd } from '../measure/areaRules';
import type { GridState } from '../types/gridTypes';
import type {
  CollectionGridDefaults,
  DiagonalRule,
  DifficultTerrainRule,
  GridUnitType,
  MeasurementMode,
  RangeBand,
} from '../types/collectionSettingsTypes';

export interface MeasurementSettings {
  mode: MeasurementMode;
  unitType: GridUnitType;
  /** Game units one cell of this map spans: the scene's own distance per cell where it sets one. */
  unitDistance: number;
  /**
   * Game units one rules square spans: the collection's distance per cell, whatever the scene
   * sets. Distances written in squares (presets, statblocks) are converted with this one.
   */
  ruleDistance: number;
  /**
   * The unit's name as the GM typed it ("mi", "ly"), shown in place of the unit type's own: the
   * scene's where it names one, else the collection's for a custom unit. Unset: the unit type's.
   */
  unitName?: string;
  diagonalRule: DiagonalRule;
  /** What a cell of difficult terrain costs a token's movement (`movementCostInCells`); unset is nothing extra. Plain distances never pay it. */
  difficultTerrain?: DifficultTerrainRule;
  rangeBands: readonly RangeBand[];
  /** Full opening of the cone measurement in degrees. */
  coneAngle: number;
  /** When a measured area covers a cell; unset is `DEFAULT_AREA_CELL_RULE`. Read with `areaRulesOf`. */
  areaCellRule?: AreaCellRule;
  /** How a measured cone ends; unset is `DEFAULT_CONE_END`. Read with `areaRulesOf`. */
  coneEnd?: ConeEnd;
}

/** The rules that shape a map's measured areas, with the defaults where the settings name none. */
export function areaRulesOf(settings: Pick<MeasurementSettings, 'areaCellRule' | 'coneEnd'> | null | undefined): { cellRule: AreaCellRule; coneEnd: ConeEnd } {
  return { cellRule: settings?.areaCellRule ?? DEFAULT_AREA_CELL_RULE, coneEnd: settings?.coneEnd ?? DEFAULT_CONE_END };
}

/** Cone of a collection that never set one: a quarter circle. */
export const DEFAULT_CONE_ANGLE = 90;

/** Whether `angle` can open a cone: more than 0 and at most a full turn, in degrees. */
export function isValidConeAngle(angle: unknown): angle is number {
  return typeof angle === 'number' && angle > 0 && angle <= 360;
}

/** The distance a scene's cells span by its own choice (`GridState.unitDistanceOverride`); a value that is no positive number is none. */
export function sceneUnitDistance(grid: Pick<GridState, 'unitDistanceOverride'> | null | undefined): number | undefined {
  const distance = grid?.unitDistanceOverride;
  return typeof distance === 'number' && Number.isFinite(distance) && distance > 0 ? distance : undefined;
}

/** The longest name a unit keeps; a longer one is cut there. */
export const MAX_UNIT_NAME = 12;

/** A unit's name as typed: trimmed and at most `MAX_UNIT_NAME` long; text that names nothing, or no text, is none. */
export function readUnitName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const name = value.trim().slice(0, MAX_UNIT_NAME).trim();
  return name === '' ? undefined : name;
}

/** The unit a scene names for its own distances (`GridState.unitNameOverride`), a galaxy map's "ly"; none where it names none. */
export function sceneUnitName(grid: Pick<GridState, 'unitNameOverride'> | null | undefined): string | undefined {
  return readUnitName(grid?.unitNameOverride);
}

/**
 * What a map measures in. Collection grid defaults win; a map without a collection falls back to
 * its grid state. A scene's own distance per cell changes only `unitDistance` and its own unit
 * name only `unitName`, and only where distances are measured: range bands have no distance per
 * cell, so there both are kept but unused.
 */
export function resolveMeasurementSettings(
  collection: CollectionGridDefaults | undefined,
  grid: GridState | null | undefined,
): MeasurementSettings {
  const { unitName: ruleName, ...rules } = collection ? collectionMeasurement(collection) : gridMeasurement(grid);
  const metric = rules.mode !== 'abstract';
  const override = metric ? sceneUnitDistance(grid) : undefined;
  const unitName = (metric ? sceneUnitName(grid) : undefined) ?? ruleName;
  return { ...rules, unitDistance: override ?? rules.ruleDistance, ...(unitName !== undefined && { unitName }) };
}

/** The name a collection's unit shows: the one typed for a `custom` unit; none for the units that have their own. */
export function collectionUnitName(collection: Pick<CollectionGridDefaults, 'unitType' | 'unitName'> | undefined): string | undefined {
  return collection?.unitType === 'custom' ? readUnitName(collection.unitName) : undefined;
}

function collectionMeasurement(collection: CollectionGridDefaults): Omit<MeasurementSettings, 'unitDistance'> {
  const unitName = collectionUnitName(collection);
  return {
    mode: collection.measurementMode,
    unitType: collection.unitType,
    ...(unitName !== undefined && { unitName }),
    ruleDistance: collection.unitDistance,
    diagonalRule: collection.diagonalRule ?? 'equidistant',
    difficultTerrain: collection.difficultTerrain ?? 'none',
    rangeBands: collection.abstractRangeBands ?? [],
    coneAngle: collection.coneAngle ?? DEFAULT_CONE_ANGLE,
    areaCellRule: collection.areaCellRule ?? DEFAULT_AREA_CELL_RULE,
    coneEnd: collection.coneEnd ?? DEFAULT_CONE_END,
  };
}

function gridMeasurement(grid: GridState | null | undefined): Omit<MeasurementSettings, 'unitDistance'> {
  return {
    // Older maps may store 'daggerheart' or nothing; both measure in range bands.
    mode: grid?.measurementType === 'units' ? 'metric' : 'abstract',
    unitType: grid?.unitType ?? 'feet',
    ruleDistance: grid?.unitDistance ?? 5,
    diagonalRule: 'equidistant',
    difficultTerrain: 'none',
    rangeBands: [],
    coneAngle: DEFAULT_CONE_ANGLE,
    areaCellRule: DEFAULT_AREA_CELL_RULE,
    coneEnd: DEFAULT_CONE_END,
  };
}

const UNIT_SUFFIX: Record<GridUnitType, string> = { feet: 'ft', yards: 'yd', meters: 'm', units: 'u', custom: '' };
const tenths = (value: number): number => Math.round(value * 10) / 10;

/** Unit shown next to a distance input, e.g. "ft", or the name the GM gave it; none for generic units. Maps without a unit use feet. */
export function unitLabelFor(unitType: GridUnitType | undefined, unitName?: string): string {
  if (unitName) return unitName;
  if (unitType === 'units' || unitType === 'custom') return '';
  return UNIT_SUFFIX[unitType ?? 'feet'];
}

/** What follows a distance's number: the unit type's short form right after it ("30ft"), a typed name after a space ("30 mi"). */
function unitSuffix(settings: Pick<MeasurementSettings, 'unitType' | 'unitName'>): string {
  return settings.unitName ? ` ${settings.unitName}` : UNIT_SUFFIX[settings.unitType];
}

/** 
 *  Label for a distance of `cells` grid cells, e.g. "30ft" or a range band name,
 *  with one decimal where the distance has one, since 7.5 m is not 8 m.
 */
export function formatDistance(cells: number, settings: MeasurementSettings): string {
  if (settings.mode === 'abstract') return rangeBandName(cells, settings.rangeBands);
  return formatGameUnits(cells * settings.unitDistance, settings);
}

/** A distance's number as labels write it: one decimal where the distance has one. */
export function distanceNumber(units: number): string {
  return `${tenths(units)}`;
}

/** Label for a distance already in game units (a token's speed), e.g. "30ft" or "30 mi": what `formatDistance` writes for as many cells. */
export function formatGameUnits(units: number, settings: Pick<MeasurementSettings, 'unitType' | 'unitName'>): string {
  return `${distanceNumber(units)}${unitSuffix(settings)}`;
}

/**
 * Label for a distance that is set rather than measured (a sense's range): as `formatDistance`,
 * with one decimal where the distance has one, since 7.5 m is not 8 m.
 */
export function formatReach(cells: number, settings: MeasurementSettings): string {
  if (settings.mode === 'abstract') return settings.rangeBands.length > 0 ? rangeBandName(cells, settings.rangeBands) : `${tenths(cells)} sq`;
  return formatGameUnits(cells * settings.unitDistance, settings);
}

/** A band threshold must be a whole number of at least one square. */
export function isValidRangeBandThreshold(maxSquares: number): boolean {
  return Number.isInteger(maxSquares) && maxSquares >= 1;
}

export function areRangeBandsValid(bands: readonly RangeBand[] | undefined): boolean {
  return (bands ?? []).every(band => isValidRangeBandThreshold(band.maxSquares));
}

/** The first band whose threshold covers the distance; the last band beyond all of them. */
export function rangeBandName(cells: number, bands: readonly RangeBand[]): string {
  const squares = Math.round(cells);
  if (bands.length === 0) return `${squares} sq`;
  return (bands.find(band => squares <= band.maxSquares) ?? bands[bands.length - 1]!).name;
}

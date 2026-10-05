/**
 * Turns a distance in grid cells into the label the ruler and the token drag
 * ruler show, using the collection's measurement settings or, for maps outside
 * a collection, the map's own grid units.
 */

import type { GridState } from '../types/gridTypes';
import type {
  CollectionGridDefaults,
  DiagonalRule,
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
  diagonalRule: DiagonalRule;
  rangeBands: readonly RangeBand[];
  /** Full opening of the cone measurement in degrees. */
  coneAngle: number;
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

/**
 * What a map measures in. Collection grid defaults win; a map without a collection falls back to
 * its grid state. A scene's own distance per cell changes only `unitDistance`, and only where
 * distances are measured: range bands have no distance per cell, so there it is kept but unused.
 */
export function resolveMeasurementSettings(
  collection: CollectionGridDefaults | undefined,
  grid: GridState | null | undefined,
): MeasurementSettings {
  const rules = collection ? collectionMeasurement(collection) : gridMeasurement(grid);
  const override = rules.mode === 'abstract' ? undefined : sceneUnitDistance(grid);
  return { ...rules, unitDistance: override ?? rules.ruleDistance };
}

function collectionMeasurement(collection: CollectionGridDefaults): Omit<MeasurementSettings, 'unitDistance'> {
  return {
    mode: collection.measurementMode,
    unitType: collection.unitType,
    ruleDistance: collection.unitDistance,
    diagonalRule: collection.diagonalRule ?? 'equidistant',
    rangeBands: collection.abstractRangeBands ?? [],
    coneAngle: collection.coneAngle ?? DEFAULT_CONE_ANGLE,
  };
}

function gridMeasurement(grid: GridState | null | undefined): Omit<MeasurementSettings, 'unitDistance'> {
  return {
    // Older maps may store 'daggerheart' or nothing; both measure in range bands.
    mode: grid?.measurementType === 'units' ? 'metric' : 'abstract',
    unitType: grid?.unitType ?? 'feet',
    ruleDistance: grid?.unitDistance ?? 5,
    diagonalRule: 'equidistant',
    rangeBands: [],
    coneAngle: DEFAULT_CONE_ANGLE,
  };
}

const UNIT_SUFFIX: Record<GridUnitType, string> = { feet: 'ft', yards: 'yd', meters: 'm', units: 'u', custom: '' };

/** Unit shown next to a distance input, e.g. "ft"; none for generic units. Maps without a unit use feet. */
export function unitLabelFor(unitType: GridUnitType | undefined): string {
  if (unitType === 'units' || unitType === 'custom') return '';
  return UNIT_SUFFIX[unitType ?? 'feet'];
}

/** Label for a distance of `cells` grid cells, e.g. "30ft" or a range band name. */
export function formatDistance(cells: number, settings: MeasurementSettings): string {
  if (settings.mode === 'abstract') return rangeBandName(cells, settings.rangeBands);
  return `${Math.round(cells * settings.unitDistance)}${UNIT_SUFFIX[settings.unitType]}`;
}

/**
 * Label for a distance that is set rather than measured (a sense's range): as `formatDistance`,
 * with one decimal where the distance has one, since 7.5 m is not 8 m.
 */
export function formatReach(cells: number, settings: MeasurementSettings): string {
  const tenths = (value: number): number => Math.round(value * 10) / 10;
  if (settings.mode === 'abstract') return settings.rangeBands.length > 0 ? rangeBandName(cells, settings.rangeBands) : `${tenths(cells)} sq`;
  return `${tenths(cells * settings.unitDistance)}${UNIT_SUFFIX[settings.unitType]}`;
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

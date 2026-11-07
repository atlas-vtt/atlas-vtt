/**
 * Where a map's unit of measurement is set, and what setting another one writes there. Pure; the
 * app writes it with `services/mapUnits.ts`.
 */

import type { CollectionGridDefaults, GridUnitType } from '../types/collectionSettingsTypes';
import type { GridState } from '../types/gridTypes';
import { resolveMeasurementSettings } from '../grid/measurementFormat';
import type { MapRules, RulesSource } from './mapRules';

/** Where a map's unit is kept: the rules it plays by (the played campaign's system, else its collection's), or its own grid. */
export type UnitHolder = 'campaign' | 'collection' | 'grid';

/** What setting a map's unit writes: the measurement of the rules it plays by, or its own grid. */
export type UnitChange =
  | { readonly kind: 'rules'; readonly source: Exclude<RulesSource, { kind: 'none' }>; readonly gridDefaults: CollectionGridDefaults }
  | { readonly kind: 'grid'; readonly grid: GridState };

/** The units a map's own grid can hold; rules may also name a custom unit. */
export const GRID_UNIT_TYPES: readonly NonNullable<GridState['unitType']>[] = ['feet', 'yards', 'meters', 'units'];

const isGridUnit = (unitType: GridUnitType): unitType is NonNullable<GridState['unitType']> =>
  (GRID_UNIT_TYPES as readonly string[]).includes(unitType);

/**
 * Who keeps the unit of a map with these rules. A map outside every collection measures by its own
 * grid; one in a collection the index does not know yet has no holder (null) until it is read.
 */
export function unitHolder({ source }: MapRules): UnitHolder | null {
  if (source.kind !== 'none') return source.kind;
  return source.outsideCollections ? 'grid' : null;
}

/** The measurement rules hold: their own, else the one their map reads by then, its grid's. */
function rulesMeasurement(rules: MapRules, grid: GridState | null | undefined): CollectionGridDefaults {
  const own = rules.settings?.gridDefaults;
  if (own) return own;
  const read = resolveMeasurementSettings(undefined, grid);
  return { unitType: read.unitType, unitDistance: read.ruleDistance, measurementMode: read.mode, abstractRangeBands: [...read.rangeBands], diagonalRule: read.diagonalRule };
}

/**
 * What measuring a map in `unitType` changes: the unit of the rules it plays by, the rest of the
 * measurement it reads by kept, or, outside every collection, its grid's. Null where nothing can hold it.
 */
export function unitChange(rules: MapRules, grid: GridState | null | undefined, unitType: GridUnitType): UnitChange | null {
  const { source } = rules;
  if (source.kind !== 'none') return { kind: 'rules', source, gridDefaults: { ...rulesMeasurement(rules, grid), unitType } };
  if (unitHolder(rules) !== 'grid' || !grid || !isGridUnit(unitType)) return null;
  return { kind: 'grid', grid: { ...grid, unitType } };
}

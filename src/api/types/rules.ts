import type {
  CollectionGridDefaults, ConditionDefinition, DiceRules, InitiativeRules, MeasurementSettings, ResourceDefinition,
} from './records';

export interface MapRules {
  /** The collection holding the map; null outside a collection. */
  readonly collectionId: string | null;
  readonly gridDefaults: CollectionGridDefaults | null;
  /**
   * The measure tool's settings, with the cone angle the GM measures with in this collection.
   * Outside a collection these are the defaults; the map's own grid units then decide.
   * Combine with `resolveMeasurementSettings(null, snapshot.grid)` from `@atlas-vtt/shared/grid` and this `coneAngle`.
   * These are the collection's: a scene that sets its own distance per cell (`GridState.unitDistanceOverride`) measures
   * with `resolveMeasurementSettings(gridDefaults, snapshot.grid)`, which keeps the collection's as `ruleDistance`.
   */
  readonly measurement: MeasurementSettings;
  readonly resources: readonly ResourceDefinition[];
  readonly conditions: readonly ConditionDefinition[];
  readonly initiative: InitiativeRules;
  readonly dice: DiceRules;
}

export interface RulesApi {
  /** The rules of the collection holding `mapPath`; Atlas's defaults outside a collection. Changes: 'rules-changed'. */
  forMap(mapPath: string | null): MapRules;
}

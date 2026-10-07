/**
 * Turns a distance in grid cells into the label the ruler and the token drag
 * ruler show, using the collection's measurement settings or, for maps outside
 * a collection, the map's own grid units.
 */
import type { GridState } from '../types/gridTypes';
import type { CollectionGridDefaults, DiagonalRule, GridUnitType, MeasurementMode, RangeBand } from '../types/collectionSettingsTypes';
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
/** What a distance label reads: every measurement setting but the cone's opening. */
export type DistanceSettings = Omit<MeasurementSettings, 'coneAngle'>;
/** Cone of a collection that never set one: a quarter circle. */
export declare const DEFAULT_CONE_ANGLE = 90;
/** Whether `angle` can open a cone: more than 0 and at most a full turn, in degrees. */
export declare function isValidConeAngle(angle: unknown): angle is number;
/** The distance a scene's cells span by its own choice (`GridState.unitDistanceOverride`); a value that is no positive number is none. */
export declare function sceneUnitDistance(grid: Pick<GridState, 'unitDistanceOverride'> | null | undefined): number | undefined;
/**
 * What a map measures in. Collection grid defaults win; a map without a collection falls back to
 * its grid state. A scene's own distance per cell changes only `unitDistance`, and only where
 * distances are measured: range bands have no distance per cell, so there it is kept but unused.
 */
export declare function resolveMeasurementSettings(collection: CollectionGridDefaults | undefined, grid: GridState | null | undefined): MeasurementSettings;
/** Unit shown next to a distance input, e.g. "ft"; none for generic units. Maps without a unit use feet. */
export declare function unitLabelFor(unitType: GridUnitType | undefined): string;
/** Label for a distance of `cells` grid cells, e.g. "30ft" or a range band name. */
export declare function formatDistance(cells: number, settings: DistanceSettings): string;
/**
 * Label for a distance that is set rather than measured (a sense's range): as `formatDistance`,
 * with one decimal where the distance has one, since 7.5 m is not 8 m.
 */
export declare function formatReach(cells: number, settings: DistanceSettings): string;
/** A band threshold must be a whole number of at least one square. */
export declare function isValidRangeBandThreshold(maxSquares: number): boolean;
export declare function areRangeBandsValid(bands: readonly RangeBand[] | undefined): boolean;
/** The first band whose threshold covers the distance; the last band beyond all of them. */
export declare function rangeBandName(cells: number, bands: readonly RangeBand[]): string;

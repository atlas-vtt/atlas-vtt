/**
 * Collection Settings Types
 *
 * Per-collection configuration for game systems, measurement,
 * grid defaults, and token conditions.
 */
import type { ResourceDefinition } from '../resources/resourceTypes';
import type { CreatureFilterDefinition } from './creatureFilterTypes';
import type { DiceRules } from './diceRulesTypes';
import type { InitiativeRules } from './initiativeRulesTypes';
import type { LightPresetDefinition } from './lightPresetTypes';
import type { TokenVisionDefaults } from './lightingTypes';
import type { SenseDefinition } from './senseTypes';
import type { AnyWidget } from './widgetTypes';
import type { WidgetIcon } from './widgetIcons';
/** A user-defined abstract distance band for the measurement tool */
export interface RangeBand {
    name: string;
    maxSquares: number;
}
/** A user-defined token condition, shown as a coloured badge on the token */
export interface ConditionDefinition {
    id: string;
    name: string;
    color: string;
    /** Glyph on the badge; the badge shows the name's initial without one */
    icon?: WidgetIcon;
    /** The condition carries a number on each token, like Frightened 2 or Exhaustion 3. */
    valued?: boolean;
    /**
     * What the condition does to sight. `none` says it does nothing, which a built-in condition
     * that changes sight stores when the GM switches its effect off. Read with `conditionEffect`,
     * which also knows the built-in conditions that collections copied before effects existed.
     */
    effect?: ConditionEffect | 'none';
}
/**
 * How a condition changes what is seen:
 * - `blinded`: a token with vision keeps only its senses that work while blinded.
 * - `invisible`: only senses that see invisible tokens perceive the token.
 * - `airborne`: senses that ignore airborne tokens (tremorsense) do not perceive it.
 * - `undetected`: no sense perceives the token.
 *
 * A token with vision is shown to the players whatever its conditions.
 */
export type ConditionEffect = 'blinded' | 'invisible' | 'airborne' | 'undetected';
export declare const CONDITION_EFFECTS: readonly ConditionEffect[];
export type MeasurementMode = 'metric' | 'abstract';
export type GridUnitType = 'feet' | 'yards' | 'meters' | 'units' | 'custom';
/**
 * How diagonal steps count on square grids: `equidistant` counts each as 1 (D&D 5e),
 * `alternating` counts them 1, 2, 1, 2 (5-10-5), `euclidean` measures the straight line.
 */
export type DiagonalRule = 'equidistant' | 'alternating' | 'euclidean';
export interface CollectionGridDefaults {
    unitType: GridUnitType;
    unitDistance: number;
    measurementMode: MeasurementMode;
    abstractRangeBands?: RangeBand[];
    /** Unset means `equidistant`. */
    diagonalRule?: DiagonalRule;
    /** Full opening of the cone measurement in degrees. Unset means 90. */
    coneAngle?: number;
}
export interface CollectionSettings {
    defaultWidgets?: Record<string, boolean>;
    /** Widgets shown in every scene of the collection; each definition holds the current value. */
    widgets?: Record<string, AnyWidget>;
    gridDefaults?: CollectionGridDefaults;
    conditions: ConditionDefinition[];
    /** What new tokens placed from this collection's library start with; vision itself starts off. Unset: no vision on new tokens. */
    defaultTokenVision?: TokenVisionDefaults | undefined;
    /**
     * The senses tokens of the collection can have. Unset while the collection takes those of its
     * preset; read with `collectionSenses`.
     */
    senses?: readonly SenseDefinition[] | undefined;
    /**
     * The lights offered in the collection, stored only once the collection has its own. Unset
     * while it takes those of its preset; read with `collectionLightPresets`.
     */
    lightPresets?: readonly LightPresetDefinition[] | undefined;
    /** The game system preset the rules were last taken from or saved to; they may have been edited since. */
    systemPresetId?: string | undefined;
    /** Default roll and critical rule. Read with `collectionDiceRules`. */
    dice?: DiceRules;
    /**
     * How the initiative tracker runs a fight, stored only once the collection has rules of its
     * own. Unset while it takes those of its preset; read with `collectionInitiativeRules`.
     */
    initiative?: InitiativeRules | undefined;
    /** Expendable token resources, in token order. Unset in collections saved before resources existed. */
    resources?: ResourceDefinition[];
    /** Filters on statblock fields Atlas does not filter by on its own. Read with `collectionCreatureFilters`. */
    customCreatureFilters?: CreatureFilterDefinition[];
    /** Ids of Atlas' own creature filters (`CATALOG_CREATURE_FILTERS`) switched off for the collection. */
    hiddenCreatureFilters?: string[];
    /** Vault paths of the `.base` files whose views the loot roller rolls on. */
    lootBases?: string[];
    /** Named after plain-number item prices, e.g. "gold" or "thorns". */
    lootCurrency?: string | undefined;
}

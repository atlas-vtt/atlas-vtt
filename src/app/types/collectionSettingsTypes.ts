/**
 * Collection Settings Types
 *
 * Per-collection configuration for game systems, measurement,
 * grid defaults, and token conditions.
 */

import type { ResourceDefinition } from '../resources/resourceTypes';
import type { CreatureFilterDefinition } from './creatureFilterTypes';
import type { DiceRules } from './diceRulesTypes';
import type { RandomTableSource, RarityOption } from './randomTableTypes';
import type { InitiativeRules } from './initiativeRulesTypes';
import type { LightPresetDefinition } from './lightPresetTypes';
import type { TokenVisionDefaults } from './lightingTypes';
import type { SenseDefinition } from './senseTypes';
import type { StatblockRole, StatblockRoleFolders } from '../statblocks/model/roleTypes';
import type { AnyWidget } from './widgetTypes';
import type { WidgetIcon } from './widgetIcons';

/** A user-defined abstract distance band for the measurement tool */
export interface RangeBand {
  name: string;        // e.g. "Close"
  maxSquares: number;  // upper threshold in grid squares
}

/** A user-defined token condition, shown as a coloured badge on the token */
export interface ConditionDefinition {
  id: string;          // UUID v4
  name: string;        // e.g. "Poisoned"
  color: string;       // hex color like "#ff4444"
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
 * - `no-vision`: a token contributes no sight or senses, including its own footprint (Dead).
 * - `invisible`: only senses that see invisible tokens perceive the token.
 * - `airborne`: senses that ignore airborne tokens (tremorsense) do not perceive it.
 * - `undetected`: no sense perceives the token.
 *
 * A living token with vision is shown to the players whatever its other conditions.
 */
export type ConditionEffect = 'blinded' | 'no-vision' | 'invisible' | 'airborne' | 'undetected';

export const CONDITION_EFFECTS: readonly ConditionEffect[] = ['blinded', 'no-vision', 'invisible', 'airborne', 'undetected'];

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
  /**
   * Default roll and critical rule of a collection that picked no dice set, as versions before
   * dice sets wrote them. Removed once the collection picks a set (`diceSetId`), which is then
   * its dice. Read the collection's dice with `collectionDiceSet`.
   */
  dice?: DiceRules | undefined;
  /**
   * The dice set from the vault's library a bare bonus rolls with. Unset for a collection
   * saved before sets existed: it rolls `dice`, else its game system's.
   */
  diceSetId?: string | undefined;
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
  /**
   * The kinds of statblock the collection makes, stored only once the collection has its own.
   * Unset while it takes those of its preset; read with `collectionStatblockRoles`.
   */
  statblockRoles?: readonly StatblockRole[] | undefined;
  /**
   * Folder for new statblocks per role id; the collection's own, never a preset's, so choosing
   * one leaves the roles inherited. Unset: Obsidian's location for new notes. Read with `roleFolder`.
   */
  statblockRoleFolders?: StatblockRoleFolders | undefined;
  /** Vault paths of the `.base` files whose views the loot roller rolls on. */
  lootBases?: string[];
  /** Named after plain-number item prices, e.g. "gold" or "thorns". */
  lootCurrency?: string | undefined;
  /**
   * Tables in Markdown notes the collection rolls on, beside the bases of `lootBases`. Arrives
   * unchecked: read with `readRandomTables`, write with `withRandomTable`.
   */
  randomTables?: RandomTableSource[] | undefined;
  /**
   * The words items name their rarity with, stored only once the collection has its own. Unset while
   * it takes those of its preset; read with `collectionItemRarities`.
   */
  itemRarities?: readonly RarityOption[] | undefined;
}

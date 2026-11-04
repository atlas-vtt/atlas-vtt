/**
 * Game system presets: a named set of collection rules (measurement and
 * conditions) that can be applied to any collection.
 */

import type { ResourceDefinition } from '../resources/resourceTypes';
import type { CollectionGridDefaults, ConditionDefinition } from './collectionSettingsTypes';
import type { DiceRules } from './diceRulesTypes';
import type { InitiativeRules } from './initiativeRulesTypes';
import type { TokenVisionDefaults } from './lightingTypes';
import type { LightPresetDefinition } from './lightPresetTypes';
import type { RarityOption } from './randomTableTypes';
import type { SenseDefinition } from './senseTypes';
import type { StatblockRole } from '../statblocks/model/roleTypes';
import type { AnyWidget } from './widgetTypes';

/** The parts of a collection's settings that a game system defines. */
export interface SystemRules {
  gridDefaults: CollectionGridDefaults;
  conditions: ConditionDefinition[];
  /**
   * Collection-wide widgets the system adds, e.g. Shadowdark's torch timer. They
   * follow the preset: switching to another system removes them. Not part of
   * the rules compared by `sameSystemRules`, since the widgets run on their own.
   */
  widgets?: AnyWidget[];
  /**
   * What new scenes of the collection show and use, by key as in
   * `CollectionSettings.defaultWidgets` (e.g. `initiativeTracker`).
   */
  defaultWidgets?: Record<string, boolean>;
  /** Default roll and critical rule. Unset means `DEFAULT_DICE_RULES`. */
  dice?: DiceRules;
  /** The dice set the system rolls a bare bonus with; a preset without one keeps its rules in `dice`. */
  diceSetId?: string;
  /** How the initiative tracker runs a fight. Unset means `DEFAULT_INITIATIVE_RULES`: a d20 each, highest first. */
  initiative?: InitiativeRules;
  /** Token resources the system defines, copied on apply like conditions. */
  resources?: ResourceDefinition[];
  /**
   * What new tokens start with (sight range, senses, cone), for systems
   * where every character has a baseline. Unset: new tokens get no vision settings.
   */
  defaultTokenVision?: TokenVisionDefaults;
  /**
   * The senses the system's rules give creatures. Unset for a system whose rules have none:
   * its collections use the generic senses (`collectionSenses`).
   */
  senses?: readonly SenseDefinition[];
  /**
   * The lights the system's rules name. Unset for a system whose rules name none: its
   * collections offer the generic ones (`collectionLightPresets`).
   */
  lightPresets?: readonly LightPresetDefinition[];
  /**
   * The kinds of statblock the system's GMs make, each with the template it starts from. Unset
   * for a system that names none: its collections offer the generic roles (`collectionStatblockRoles`).
   */
  statblockRoles?: readonly StatblockRole[];
  /**
   * The words the system's items name their rarity with. Unset for a system without rarities:
   * its collections read the classic ladder (`collectionItemRarities`).
   */
  itemRarities?: readonly RarityOption[];
}

/** Built-in preset ids start with this; user presets never do. */
export const BUILT_IN_ID_PREFIX = 'builtin:';

export interface SystemPreset {
  id: string;
  name: string;
  /** Shipped with the plugin: read-only, with an id that stays the same across releases and vaults. */
  builtIn: boolean;
  rules: SystemRules;
}

/**
 * Pure operations on a collection's game system rules: reading them from the
 * settings, applying a preset, comparing and describing them.
 */

import type {
  CollectionGridDefaults,
  CollectionSettings,
  ConditionDefinition,
  GridUnitType,
} from '../types/collectionSettingsTypes';
import type { TokenVisionDefaults } from '../types/lightingTypes';
import type { SystemPreset, SystemRules } from '../types/systemPresetTypes';
import type { AnyWidget } from '../types/widgetTypes';
import { HP_RESOURCE, sameResourceDefinitions } from '../resources/resourceDefinitions';
import { barWidgets } from '../resources/sceneVisibility';
import { conditionEffect } from './conditionEffects';
import { DEAD_CONDITION, deadConditionId, withDeadCondition } from './deadCondition';
import { DEFAULT_DICE_RULES, sameDiceRules } from './diceRules';
import { sameInitiativeRules } from './initiativeRules';
import { sameLightPresets } from './lightPresetRules';
import { sameSenses } from './senseRules';
import { hasVisionDefaults, sameVisionDefaults } from './visionDefaults';
import { DEFAULT_CONE_ANGLE } from '../grid/measurementFormat';
import { sameStatblockRoles } from '../statblocks/roles/collectionStatblockRoles';
import { DEFAULT_ITEM_RARITIES, parseItemRarities, sameItemRarities } from './itemRarities';

/** Measurement of a collection that never set any: 5-foot squares, every diagonal counts 1. */
export const DEFAULT_GRID_DEFAULTS: Readonly<CollectionGridDefaults> = {
  unitType: 'feet',
  unitDistance: 5,
  measurementMode: 'metric',
  abstractRangeBands: [],
  diagonalRule: 'equidistant',
};

/** What a game system sets in a collection's settings. */
export type SystemSettings = Required<Pick<CollectionSettings, 'gridDefaults' | 'conditions' | 'defaultWidgets' | 'dice' | 'resources'>>
  & Pick<CollectionSettings, 'systemPresetId' | 'diceSetId' | 'defaultTokenVision' | 'senses' | 'lightPresets' | 'initiative' | 'statblockRoles' | 'itemRarities'>;

/**
 * A collection without a game system: default measurement and dice, HP as its only resource
 * (its bar on for new scenes), Dead, no default widgets, no default vision, and no
 * senses, light presets, initiative rules, statblock roles or item rarities of its own, so it uses
 * the generic ones. Role folders are the collection's own and stay.
 */
export function vanillaSystemSettings(): SystemSettings {
  return {
    gridDefaults: structuredClone(DEFAULT_GRID_DEFAULTS),
    conditions: [{ ...DEAD_CONDITION }],
    defaultWidgets: barWidgets([HP_RESOURCE]),
    dice: { ...DEFAULT_DICE_RULES },
    diceSetId: undefined,
    resources: [{ ...HP_RESOURCE }],
    systemPresetId: undefined,
    defaultTokenVision: undefined,
    senses: undefined,
    lightPresets: undefined,
    initiative: undefined,
    statblockRoles: undefined,
    itemRarities: undefined,
  };
}

/**
 * The rules a collection gets from a preset: a copy of its measurement and of its
 * conditions with their own ids, and of its default token vision when it sets one. Conditions
 * from the previous system never carry over; the ones tokens still have are removed when the
 * collection is saved. Senses are not copied: the collection reads its preset's
 * (`collectionSenses`) until the GM edits them, so a corrected built-in sense reaches it; its
 * light presets and initiative rules are read the same way (`collectionLightPresets`,
 * `collectionInitiativeRules`). The collection takes the preset's dice set, or its dice rules
 * where it names no set.
 */
export function rulesOfPreset(
  preset: SystemPreset,
): Required<Pick<SystemRules, 'gridDefaults' | 'conditions' | 'defaultWidgets' | 'resources'>> & Pick<SystemRules, 'defaultTokenVision' | 'dice'> & { diceSetId: string | undefined } {
  const vision: TokenVisionDefaults | undefined = preset.rules.defaultTokenVision;
  return {
    gridDefaults: structuredClone(preset.rules.gridDefaults),
    conditions: withDeadCondition(structuredClone(preset.rules.conditions), deadConditionId(preset.id)),
    // The bars new scenes show, which older versions of Atlas read too
    defaultWidgets: { ...barWidgets(preset.rules.resources ?? []), ...preset.rules.defaultWidgets },
    // A preset's set is the collection's dice; only a preset without one gives its dice rules
    ...(!preset.rules.diceSetId && { dice: { ...(preset.rules.dice ?? DEFAULT_DICE_RULES) } }),
    diceSetId: preset.rules.diceSetId,
    resources: structuredClone(preset.rules.resources ?? []),
    ...(hasVisionDefaults(vision) && { defaultTokenVision: structuredClone(vision) }),
  };
}

function sameGridDefaults(a: CollectionGridDefaults, b: CollectionGridDefaults): boolean {
  const bandsA = a.abstractRangeBands ?? [];
  const bandsB = b.abstractRangeBands ?? [];
  return a.unitType === b.unitType
    && a.unitDistance === b.unitDistance
    && a.measurementMode === b.measurementMode
    && (a.diagonalRule ?? 'equidistant') === (b.diagonalRule ?? 'equidistant')
    // Rules without a cone angle of their own measure with the preset's
    && (b.coneAngle === undefined || (a.coneAngle ?? DEFAULT_CONE_ANGLE) === b.coneAngle)
    && bandsA.length === bandsB.length
    && bandsA.every((band, i) => band.name === bandsB[i]!.name && band.maxSquares === bandsB[i]!.maxSquares);
}

function sameCondition(a: ConditionDefinition, b: ConditionDefinition): boolean {
  return a.name === b.name
    && a.color.toLowerCase() === b.color.toLowerCase()
    && a.icon === b.icon
    && (a.valued ?? false) === (b.valued ?? false)
    && conditionEffect(a) === conditionEffect(b);
}

/** The bar switches older versions kept among the default widgets; resources replaced them. */
const LEGACY_BAR_WIDGETS = new Set(['hpBar', 'stressBar']);

/** The default widgets that are on, as a comparable key. */
function enabledWidgets(defaultWidgets: Record<string, boolean> | undefined): string {
  return Object.keys(defaultWidgets ?? {}).filter((key) => defaultWidgets?.[key] && !LEGACY_BAR_WIDGETS.has(key)).sort().join();
}

/**
 * Whether two rules roll the same dice: the same set where both picked one, else the same
 * dice rules (a collection saved before sets kept its system's rules as they were).
 */
function sameDiceChoice(a: Pick<SystemRules, 'dice' | 'diceSetId'>, b: Pick<SystemRules, 'dice' | 'diceSetId'>): boolean {
  return a.diceSetId && b.diceSetId ? a.diceSetId === b.diceSetId : sameDiceRules(a.dice, b.dice);
}

/**
 * Whether a collection's `rules` play as `preset` does; condition ids do not matter. Rules
 * without senses, light presets, initiative rules, statblock roles or item rarities of their own
 * read the preset's, so they are the same in that. Role folders are no part of the rules.
 */
export function sameSystemRules(preset: SystemRules, rules: SystemRules): boolean {
  return sameGridDefaults(preset.gridDefaults, rules.gridDefaults)
    && sameDiceChoice(preset, rules)
    && sameResourceDefinitions(preset.resources, rules.resources)
    && enabledWidgets(preset.defaultWidgets) === enabledWidgets(rules.defaultWidgets)
    && sameVisionDefaults(preset.defaultTokenVision, rules.defaultTokenVision)
    && (rules.senses === undefined || sameSenses(preset.senses, rules.senses))
    && (rules.lightPresets === undefined || sameLightPresets(preset.lightPresets, rules.lightPresets))
    && (rules.initiative === undefined || sameInitiativeRules(preset.initiative, rules.initiative))
    && (!rules.statblockRoles?.length || sameStatblockRoles(preset.statblockRoles, rules.statblockRoles))
    && sameOwnRarities(preset, rules)
    && preset.conditions.length === rules.conditions.length
    && preset.conditions.every((condition, i) => sameCondition(condition, rules.conditions[i]!));
}

/** Whether rules with rarity words of their own name the preset's (else the ladder's). */
function sameOwnRarities(preset: SystemRules, rules: SystemRules): boolean {
  const own = parseItemRarities(rules.itemRarities);
  return own === undefined || sameItemRarities(preset.itemRarities ?? DEFAULT_ITEM_RARITIES, own);
}

const SQUARE_UNIT: Record<GridUnitType, string> = { feet: 'ft', yards: 'yd', meters: 'm', units: 'unit', custom: 'unit' };

function count(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/** One-line summary, e.g. "5 ft squares · 15 conditions · 5 senses · Default vision" or "4 range bands · 10 conditions · Torch timer". */
export function describeSystemRules(rules: SystemRules): string {
  const grid = rules.gridDefaults;
  const measurement = grid.measurementMode === 'abstract'
    ? count(grid.abstractRangeBands?.length ?? 0, 'range band')
    : `${grid.unitDistance} ${SQUARE_UNIT[grid.unitType]} squares`;
  const widgets = (rules.widgets ?? []).map((widget) => `${widget.label} ${widget.type}`);
  const senses = rules.senses?.length ? [count(rules.senses.length, 'sense')] : [];
  // HP alone is what every system tracks; only a system's further resources tell it apart.
  const names = (rules.resources ?? []).map((resource) => resource.name);
  const resources = names.length > 1 ? [names.join(', ')] : [];
  const vision = hasVisionDefaults(rules.defaultTokenVision) ? ['Default vision'] : [];
  return [measurement, count(rules.conditions.length, 'condition'), ...senses, ...resources, ...vision, ...widgets].join(' · ');
}

/**
 * The collection's widgets with exactly the widgets of its game system: widgets
 * any preset adds are removed unless the current preset has them, and the
 * current preset's are added after the others when missing (a running timer
 * keeps its time). Widgets the user made stay. Returns `current` when nothing
 * changes.
 */
export function withSystemWidgets(
  current: Record<string, AnyWidget>,
  presets: readonly SystemPreset[],
  presetId: string | undefined,
): Record<string, AnyWidget> {
  const wanted = presets.find((preset) => preset.id === presetId)?.rules.widgets ?? [];
  const wantedIds = new Set(wanted.map((widget) => widget.id));
  const presetIds = new Set(presets.flatMap((preset) => preset.rules.widgets ?? []).map((widget) => widget.id));
  const stale = Object.keys(current).filter((id) => presetIds.has(id) && !wantedIds.has(id));
  const missing = wanted.filter((widget) => !current[widget.id]);
  if (stale.length === 0 && missing.length === 0) return current;

  const result = { ...current };
  for (const id of stale) delete result[id];
  let order = Math.max(-1, ...Object.values(result).map((widget) => widget.order)) + 1;
  for (const widget of missing) result[widget.id] = { ...structuredClone(widget), scope: 'collection', order: order++ };
  return result;
}

/**
 * The preset the rules are set from: the recorded one while it exists (the rules
 * may have been edited since), otherwise the first whose rules they match.
 */
export function findActivePreset(
  presets: readonly SystemPreset[],
  presetId: string | undefined,
  rules: SystemRules,
): SystemPreset | undefined {
  return presets.find((preset) => preset.id === presetId)
    ?? presets.find((preset) => sameSystemRules(preset.rules, rules));
}

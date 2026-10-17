import type { RulesSettings } from '../gameSystems/mapRules';
import { parseSystemRules } from '../gameSystems/presetValidation';
import { rulesOfPreset } from '../gameSystems/systemRules';
import { withDeadConditionSettings } from '../gameSystems/deadCondition';
import { parseVisionDefaults } from '../gameSystems/visionDefaults';
import { parseResourceDefinitions } from '../resources/resourceDefinitions';
import type { SystemPreset } from '../types/systemPresetTypes';
import { isRecord } from './campaignValues';

/**
 * The game system a campaign plays by, stored as a collection's rules are: the preset it was taken
 * from, measurement, conditions, dice (a dice set of the library, or dice rules), resources and default vision, and senses, light presets and
 * initiative rules only once the GM edited them (until then the preset's are read). No default
 * widgets: a campaign makes no scenes.
 */
export type CampaignSystem = Omit<RulesSettings, 'defaultWidgets'>;

/** The longest preset id a campaign refers to. */
const MAX_PRESET_ID = 200;

/**
 * A campaign's system as Atlas reads its file, or undefined when it holds none that can be used
 * (no measurement or no list of conditions). Entries that cannot be used are left out. Default
 * vision keeps every sense it names: which of them the system knows is decided where it is read
 * (`mapVisionDefaults`), as for a collection.
 */
export function readCampaignSystem(raw: unknown): CampaignSystem | undefined {
  if (!isRecord(raw)) return undefined;
  const rules = parseSystemRules(raw);
  if (!rules) return undefined;
  const { systemPresetId } = raw;
  // An empty list is a system without resources, not one that reads its preset's.
  const resources = Array.isArray(raw.resources) ? parseResourceDefinitions(raw.resources) : undefined;
  const defaultTokenVision = parseVisionDefaults(raw.defaultTokenVision);
  return withDeadConditionSettings({
    gridDefaults: rules.gridDefaults,
    conditions: rules.conditions,
    ...(typeof systemPresetId === 'string' && systemPresetId !== '' && systemPresetId.length <= MAX_PRESET_ID && { systemPresetId }),
    ...(rules.dice && { dice: rules.dice }),
    ...(rules.diceSetId && { diceSetId: rules.diceSetId }),
    ...(resources && { resources }),
    ...(defaultTokenVision && { defaultTokenVision }),
    ...(rules.senses && { senses: rules.senses }),
    ...(rules.lightPresets && { lightPresets: rules.lightPresets }),
    ...(rules.initiative && { initiative: rules.initiative }),
  });
}

/**
 * The stored system `stored` with `changes` made field by field (a field given as undefined is
 * removed), so fields a newer Atlas added stay.
 */
export function withSystemChanges(stored: unknown, changes: Partial<CampaignSystem>): Record<string, unknown> {
  const next: Record<string, unknown> = isRecord(stored) ? { ...stored } : {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) delete next[key];
    else next[key] = structuredClone(value);
  }
  return next;
}

/**
 * A campaign's system as rules to edit and compare with the presets. A campaign makes no scenes,
 * so it keeps no default widgets: it takes its preset's, and reads as that preset where nothing
 * else was changed.
 */
export function campaignRules(system: CampaignSystem, presets: readonly SystemPreset[]): RulesSettings {
  const preset = presets.find((candidate) => candidate.id === system.systemPresetId);
  return { ...system, defaultWidgets: preset ? rulesOfPreset(preset).defaultWidgets : {} };
}

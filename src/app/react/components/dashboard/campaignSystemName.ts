import { campaignRules, type CampaignSystem } from '../../../campaigns/campaignSystem';
import { viewOfRules } from '../../../gameSystems/rulesView';
import { findActivePreset, sameSystemRules } from '../../../gameSystems/systemRules';
import type { DiceSet } from '../../../types/diceSetTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { t } from '../../../i18n';

/** What a campaign's game system is called: its preset's name, or Custom, and whether it was edited since. */
export function campaignSystemName(
  system: CampaignSystem, presets: readonly SystemPreset[], sets: readonly DiceSet[],
): { name: string; edited: boolean } {
  const { systemRules } = viewOfRules(campaignRules(system, presets), presets, sets);
  const active = findActivePreset(presets, system.systemPresetId, systemRules);
  return active
    ? { name: active.name, edited: !sameSystemRules(active.rules, systemRules) }
    : { name: t('csm.system.custom'), edited: false };
}

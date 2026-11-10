import { collectionStatblockRoles } from '../../../statblocks/roles/collectionStatblockRoles';
import { viewOfRules, type RulesView } from '../../../gameSystems/rulesView';
import type { DiceSet } from '../../../types/diceSetTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import type { CollectionSettingsDraft } from './useCollectionSettingsDraft';

/** A collection's draft as its dialog shows it, with the statblock roles that belong to its game system as a preset holds them. */
export function collectionRulesView(draft: CollectionSettingsDraft, presets: readonly SystemPreset[], sets: readonly DiceSet[]): RulesView {
  const rulesView = viewOfRules(draft, presets, sets);
  return { ...rulesView, systemRules: { ...rulesView.systemRules, statblockRoles: collectionStatblockRoles(draft, presets) } };
}

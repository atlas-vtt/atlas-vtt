import React, { useEffect, useRef, useState } from 'react';
import type { App } from 'obsidian';
import { campaignRules } from '../../../campaigns/campaignSystem';
import type { Campaign } from '../../../campaigns/campaignTypes';
import type { CampaignService } from '../../../campaigns/CampaignService';
import { viewOfRules } from '../../../gameSystems/rulesView';
import { vanillaSystemSettings } from '../../../gameSystems/systemRules';
import { resourceFieldSuggestions } from '../../../resources/resourceFieldSuggestions';
import { initiativeFieldSuggestions } from '../../../initiative/initiativeFieldSuggestions';
import { AssetService } from '../../../services/AssetService';
import { SettingsService } from '../../../services/SettingsService';
import { deleteSystemPreset } from '../../../services/systemPresetDeletion';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import { t } from '../../../i18n';
import { RULES_TABS, RulesSettingsTabs, type SettingsTab } from '../collection-settings/RulesSettingsTabs';
import { SettingsDialog } from '../collection-settings/SettingsDialog';
import { useCollectionCreatures } from '../collection-settings/useCollectionCreatures';
import { useRulesDraft } from '../collection-settings/useRulesDraft';
import { useExperimentalFeature } from '../../hooks/useExperimentalFeature';
import { useSystemPresets } from '../../hooks/useSystemPresets';
import { useDiceSets } from '../../hooks/useDiceSets';
import { usePlayedCollections } from './usePlayedCollections';

/**
 * Without a game system the dialog offers only the choice of one. A campaign makes no scenes, so with
 * one it has the rules' tabs alone (`RULES_TABS`): no default widgets, creature filters or loot.
 */
const NO_SYSTEM_TABS: readonly SettingsTab[] = ['system'];

interface CampaignRulesDialogProps {
  app: App;
  campaign: Campaign;
  service: CampaignService;
  onClose: () => void;
  /** The tab it opens on, where the campaign's system has it; Game System otherwise. */
  initialTab?: SettingsTab;
}

/**
 * The game system a campaign plays by, edited with the tabs of a collection's settings: a preset,
 * edited or not, or no game system, which leaves every map to its collection's rules. Saved as a
 * whole; the campaign's file keeps what a newer Atlas added.
 */
export function CampaignRulesDialog({ app, campaign, service, onClose, initialTab = 'system' }: CampaignRulesDialogProps): React.ReactElement {
  const systemPresets = useSystemPresets(app);
  const diceSets = useDiceSets(app);
  const lightingOn = useExperimentalFeature('dynamicLighting', SettingsService.forApp(app));
  const draft = useRulesDraft();
  const [hasSystem, setHasSystem] = useState(campaign.system !== undefined);
  const [activeTab, setActiveTab] = useState<SettingsTab>(RULES_TABS.includes(initialTab) ? initialTab : 'system');
  const offersFields = activeTab === 'resources' || activeTab === 'initiative';
  const collections = usePlayedCollections(app, campaign, offersFields);
  const creatures = useCollectionCreatures(app, AssetService.getInstance(app), collections, offersFields);
  const statblockRecords = creatures.creatures.map((creature) => creature.fields);

  // Read once, as the dialog opens: a save made elsewhere meanwhile does not take the GM's edits away.
  const opened = useRef({ system: campaign.system, presets: systemPresets.presets });
  const { load } = draft;
  useEffect(() => {
    const { system, presets } = opened.current;
    load(system ? campaignRules(system, presets) : vanillaSystemSettings());
  }, [load]);

  const view = viewOfRules(draft, systemPresets.presets, diceSets.sets);
  const canSave = !hasSystem || view.isValid;

  const save = (): void => {
    try {
      if (hasSystem) {
        const { defaultWidgets: _widgets, ...system } = draft.toSettings();
        service.update(campaign.id, { system });
      } else if (campaign.system !== undefined) {
        service.update(campaign.id, { system: undefined });
      }
      onClose();
    } catch (error) {
      console.error('[CampaignRulesDialog] Failed to save:', error);
    }
  };

  const applyPreset = (preset: SystemPreset): void => {
    draft.applyPreset(preset);
    setHasSystem(true);
  };

  const deletePreset = async (preset: SystemPreset): Promise<void> => {
    if (!systemPresets.service) return;
    if (draft.systemPresetId === preset.id) setHasSystem(false);
    await deleteSystemPreset(app, systemPresets.service, preset.id);
  };

  return (
    <SettingsDialog
      title={t('campaign.systemTitle', { name: campaign.name })}
      closeLabel={t('campaign.closeSystem')}
      canSave={canSave}
      onSave={save}
      onClose={onClose}
    >
      <RulesSettingsTabs
        tabs={hasSystem ? RULES_TABS : NO_SYSTEM_TABS}
        activeTab={hasSystem ? activeTab : 'system'}
        onTabChange={setActiveTab}
        draft={{ ...draft, applyPreset }}
        view={view}
        presets={systemPresets}
        diceSets={diceSets}
        onDeletePreset={deletePreset}
        none={{ summary: t('campaign.systemNoneSummary'), isActive: !hasSystem, onSelect: () => setHasSystem(false) }}
        lightingOn={lightingOn}
        fieldSuggestions={resourceFieldSuggestions([], statblockRecords)}
        initiativeFieldSuggestions={initiativeFieldSuggestions([], statblockRecords)}
      />
    </SettingsDialog>
  );
}

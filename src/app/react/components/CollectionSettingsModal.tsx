/**
 * CollectionSettingsModal
 *
 * Vertical-tabbed modal for configuring per-collection settings:
 *   Game System | Dice | Grid & Measurement | Vision | Default Widgets | Conditions | Resources | Statblocks | Creature Filters | Random tables
 *
 * Opens after collection creation and via a gear button in the sidebar.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { useAtlasUI } from '../root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { deleteSystemPreset } from '../../services/systemPresetDeletion';
import { syncCollectionSystem } from '../../services/collectionSystemSync';
import { useSystemPresets } from '../hooks/useSystemPresets';
import { useDiceSets } from '../hooks/useDiceSets';
import { useCollectionSettingsDraft } from './collection-settings/useCollectionSettingsDraft';
import { useExperimentalFeature } from '../hooks/useExperimentalFeature';
import { DefaultWidgetsTab } from './collection-settings/DefaultWidgetsTab';
import { resourceFieldSuggestions } from '../../resources/resourceFieldSuggestions';
import { initiativeFieldSuggestions } from '../../initiative/initiativeFieldSuggestions';
import { RandomTablesTab } from './collection-settings/RandomTablesTab';
import { viewOfRules, type RulesView } from '../../gameSystems/rulesView';
import { CreatureFiltersTab } from './collection-settings/CreatureFiltersTab';
import { useCollectionCreatures } from './collection-settings/useCollectionCreatures';
import { useRoleTemplates } from './collection-settings/useRoleTemplates';
import { isCompleteCreatureFilter } from '../../creatures/creatureFilterDefinitions';
import type { TemplateId } from '../../statblocks/model/templateTypes';
import { collectionStatblockRoles } from '../../statblocks/roles/collectionStatblockRoles';
import { statblockRolesAreValid } from '../../statblocks/roles/roleValidation';
import { StatblocksTab } from '../../statblocks/settings/StatblocksTab';
import { initiativeEdit, RulesSettingsTabs, type SettingsTab } from './collection-settings/RulesSettingsTabs';
import { SettingsDialog } from './collection-settings/SettingsDialog';
import { PlayedCampaignNotice } from './collection-settings/PlayedCampaignNotice';
import { CampaignRulesDialog } from './dashboard/CampaignRulesDialog';
import { usePlayedSystemCampaign } from '../../campaigns/usePlayedSystemCampaign';
import { t } from '../../i18n';

interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  /** The tab it opens on; Game System by default. */
  initialTab?: CollectionSettingsTab;
  /**
   * Opens a statblock template for this collection (`collectionId`). The Statblocks tab's Edit
   * saves the settings and closes the dialog first; without it the tab offers no Edit.
   */
  onEditTemplate?: (templateId: TemplateId, collectionId: string) => void;
}

export type CollectionSettingsTab = Exclude<SettingsTab, 'initiative'>;

/** The tabs in order; Vision only while dynamic lighting is on, Statblocks only while the statblock editor is. */
function collectionTabs(statblockEditorOn: boolean): readonly CollectionSettingsTab[] {
  return [
    'system', 'dice', 'grid', 'vision', 'widgets', 'conditions', 'resources',
    ...(statblockEditorOn ? ['statblocks' as const] : []),
    'creatureFilters', 'loot',
  ];
}

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collectionId,
  initialTab = 'system',
  onEditTemplate,
}: CollectionSettingsModalProps): React.ReactElement | null {
  const { app } = useAtlasUI();
  const lightingOn = useExperimentalFeature('dynamicLighting');
  const statblockEditorOn = useExperimentalFeature('statblockEditor');
  const assetService = app ? AssetService.getInstance(app) : null;
  const systemPresets = useSystemPresets(app);
  const diceSets = useDiceSets(app);

  const [activeTab, setActiveTab] = useState<SettingsTab>(initialTab);
  // While a played campaign has a game system, every map plays by it: its rules open in place of these.
  const played = usePlayedSystemCampaign(app);
  const playedId = played?.campaign.id ?? null;
  const [campaignOpen, setCampaignOpen] = useState(false);
  // Another campaign played, or none: the dialog of the one before is gone for good.
  useEffect(() => setCampaignOpen(false), [playedId]);
  const [collectionName, setCollectionName] = useState('');
  const [releaseLine, setReleaseLine] = useState('');

  // Local draft of settings — only persisted on Save
  const draft = useCollectionSettingsDraft(assetService, collectionId, isOpen);
  const collectionIds = useMemo(() => [collectionId], [collectionId]);
  const offersFields = isOpen && (activeTab === 'creatureFilters' || activeTab === 'resources' || activeTab === 'widgets');
  const collectionCreatures = useCollectionCreatures(app ?? null, assetService, collectionIds, offersFields);
  const roleTemplates = useRoleTemplates(app ?? null, collectionStatblockRoles(draft, systemPresets.presets), offersFields);
  const statblockRecords = collectionCreatures.creatures.map((creature) => creature.fields);
  const initiativeFields = initiativeFieldSuggestions(roleTemplates, statblockRecords);

  // Resolve the collection name for the header
  useEffect(() => {
    if (!isOpen || !assetService) return;
    let cancelled = false;

    assetService.getCollections().then((cols) => {
      if (cancelled) return;
      const match = cols.find((c) => c.id === collectionId);
      setCollectionName(match?.name ?? collectionId);
      setReleaseLine(match ? `v${match.version}${match.author ? ` · by ${match.author}` : ''}` : '');
    }).catch((err) => {
      console.error('[CollectionSettingsModal] Failed to load collections:', err);
    });

    return () => { cancelled = true; };
  }, [isOpen, collectionId, assetService]);

  const rulesView = viewOfRules(draft, systemPresets.presets, diceSets.sets);
  // A collection's statblock roles are part of its game system, as a preset holds them.
  const view: RulesView = {
    ...rulesView,
    systemRules: { ...rulesView.systemRules, statblockRoles: collectionStatblockRoles(draft, systemPresets.presets) },
  };
  const canSave = view.isValid
    && draft.customCreatureFilters.every(isCompleteCreatureFilter)
    && statblockRolesAreValid(draft.statblockRoles ?? []);

  /** Saves the draft and closes the dialog; false when nothing was saved. */
  const save = async (): Promise<boolean> => {
    if (!app || !assetService || !canSave) return false;

    try {
      await assetService.updateCollectionSettings(collectionId, draft.toSettings());
      // Widgets and token conditions follow the saved game system in every scene.
      await syncCollectionSystem(app, collectionId, systemPresets.presets);
      onClose();
      return true;
    } catch (err) {
      console.error('[CollectionSettingsModal] Failed to save:', err);
      return false;
    }
  };

  const editTemplate = onEditTemplate && ((templateId: TemplateId): void => {
    void save().then((saved) => { if (saved) onEditTemplate(templateId, collectionId); });
  });

  const handleDeletePreset = async (preset: SystemPreset): Promise<void> => {
    if (!app || !systemPresets.service) return;
    if (draft.systemPresetId === preset.id) draft.clearSystem();
    await deleteSystemPreset(app, systemPresets.service, preset.id);
  };

  const playedNotice = played && <PlayedCampaignNotice campaignName={played.campaign.name} onEdit={() => setCampaignOpen(true)} />;

  const renderOther = (tab: SettingsTab): React.ReactNode => {
    switch (tab) {
      case 'widgets':
        return (
          <DefaultWidgetsTab
            defaultWidgets={draft.defaultWidgets}
            onChange={draft.setDefaultWidgets}
            initiative={view.initiative}
            onInitiativeChange={initiativeEdit(draft, view)}
            initiativeFieldSuggestions={initiativeFields}
            initiativeNotice={playedNotice}
          />
        );
      case 'statblocks':
        return app && statblockEditorOn && (
          <StatblocksTab
            app={app}
            collectionId={collectionId}
            ownRoles={draft.statblockRoles}
            onOwnRolesChange={draft.setStatblockRoles}
            folders={draft.statblockRoleFolders}
            onFoldersChange={draft.setStatblockRoleFolders}
            systemPresetId={draft.systemPresetId}
            presets={systemPresets.presets}
            canSave={canSave}
            onEditTemplate={editTemplate}
          />
        );
      case 'creatureFilters':
        return (
          <CreatureFiltersTab
            hidden={draft.hiddenCreatureFilters}
            onHiddenChange={draft.setHiddenCreatureFilters}
            custom={draft.customCreatureFilters}
            onCustomChange={draft.setCustomCreatureFilters}
            creatures={collectionCreatures.creatures}
            pending={collectionCreatures.pending}
            templates={roleTemplates}
          />
        );
      case 'loot':
        return app && (
          <RandomTablesTab
            app={app}
            lootBases={draft.lootBases}
            onBasesChange={draft.setLootBases}
            randomTables={draft.randomTables}
            onRandomTablesChange={draft.setRandomTables}
            currency={draft.lootCurrency}
            onCurrencyChange={draft.setLootCurrency}
            itemRarities={draft.itemRarities}
            onItemRaritiesChange={draft.setItemRarities}
            systemPresetId={draft.systemPresetId}
            presets={systemPresets.presets}
          />
        );
      default:
        return null;
    }
  };

  if (!isOpen) return null;

  if (app && played && campaignOpen) {
    return <CampaignRulesDialog app={app} campaign={played.campaign} service={played.service} initialTab={activeTab === 'widgets' ? 'initiative' : activeTab} onClose={() => setCampaignOpen(false)} />;
  }

  return (
    <SettingsDialog
      title={t('csm.title', { name: collectionName })}
      subtitle={releaseLine}
      closeLabel={t('csm.close')}
      canSave={canSave}
      onSave={() => { void save(); }}
      onClose={onClose}
    >
      <RulesSettingsTabs
        tabs={collectionTabs(statblockEditorOn)}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        draft={draft}
        view={view}
        presets={systemPresets}
        diceSets={diceSets}
        onDeletePreset={handleDeletePreset}
        lightingOn={lightingOn}
        fieldSuggestions={resourceFieldSuggestions(roleTemplates, statblockRecords)}
        initiativeFieldSuggestions={initiativeFields}
        renderOther={renderOther}
        rulesNotice={playedNotice}
      />
    </SettingsDialog>
  );
}

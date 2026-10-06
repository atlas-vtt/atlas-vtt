/**
 * CollectionSettingsModal
 *
 * Vertical-tabbed modal for configuring per-collection settings:
 *   Game System | Dice | Grid & Measurement | Vision | Default Widgets | Conditions | Resources | Creature Filters | Loot
 *
 * Opens after collection creation and via a gear button in the sidebar.
 */

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Dice5, Dices, Eye, Gauge, Grid3X3, LayoutGrid, ListFilter, ShieldAlert } from 'lucide-react';
import { CoinIcon } from './CoinIcon';
import { Button } from '../../packages/components/primitives/button';
import { useAtlasUI } from '../root/AtlasUIContext';
import { AssetService } from '../../services/AssetService';
import type { InitiativeRules } from '../../types/initiativeRulesTypes';
import type { SystemPreset } from '../../types/systemPresetTypes';
import { deleteSystemPreset } from '../../services/systemPresetDeletion';
import { syncCollectionSystem } from '../../services/collectionSystemSync';
import { useSystemPresets } from '../hooks/useSystemPresets';
import { savedResources, useCollectionSettingsDraft } from './collection-settings/useCollectionSettingsDraft';

import { GridMeasurementTab } from './collection-settings/GridMeasurementTab';
import { collectionConeAngle } from '../../gameSystems/coneAngle';
import { VisionTab } from './collection-settings/VisionTab';
import { useExperimentalFeature } from '../hooks/useExperimentalFeature';
import { DefaultWidgetsTab } from './collection-settings/DefaultWidgetsTab';
import { ConditionsTab } from './collection-settings/ConditionsTab';
import { ResourcesTab } from './collection-settings/ResourcesTab';
import { discoverResourceFields } from '../../resources/resourceFields';
import { LootTab } from './collection-settings/LootTab';
import { SystemTab } from './collection-settings/SystemTab';
import { DiceTab } from './collection-settings/DiceTab';
import { collectionDiceRules, isValidDiceRules } from '../../gameSystems/diceRules';
import { collectionInitiativeRules, isValidInitiativeRules } from '../../gameSystems/initiativeRules';
import { collectionLightPresets } from '../../gameSystems/lightPresetRules';
import { editedSenses, sensesAreValid } from '../../gameSystems/senseEditing';
import { collectionSenses } from '../../gameSystems/senseRules';
import { CreatureFiltersTab } from './collection-settings/CreatureFiltersTab';
import { useCollectionCreatures } from './collection-settings/useCollectionCreatures';
import { isCompleteCreatureFilter } from '../../creatures/creatureFilterDefinitions';
import { areRangeBandsValid } from '../../grid/measurementFormat';

import { SettingsContent } from './collection-settings/SettingsContent';
import { CloseButton } from '../../packages/components/primitives/CloseButton';
import { dialogOverlayMotion, useDialogWindowVariants } from '../../packages/components/primitives/dialogMotion';
import { t } from '../../i18n';

// ── Types ──────────────────────────────────────────────────────────────────

interface CollectionSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  collectionId: string;
  /** The tab it opens on; Game System by default. */
  initialTab?: CollectionSettingsTab;
}

export type CollectionSettingsTab = 'system' | 'dice' | 'grid' | 'vision' | 'widgets' | 'conditions' | 'resources' | 'creatureFilters' | 'loot';

interface TabDef {
  id: CollectionSettingsTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabDef[] = [
  { id: 'system', label: t('csm.tab.system'), icon: <Dices size={16} /> },
  { id: 'dice', label: t('diceSettings.dice'), icon: <Dice5 size={16} /> },
  { id: 'grid', label: t('csm.tab.grid'), icon: <Grid3X3 size={16} /> },
  { id: 'vision', label: t('csm.tab.vision'), icon: <Eye size={16} /> },
  { id: 'widgets', label: t('csm.tab.widgets'), icon: <LayoutGrid size={16} /> },
  { id: 'conditions', label: t('csm.tab.conditions'), icon: <ShieldAlert size={16} /> },
  { id: 'resources', label: 'Resources', icon: <Gauge size={16} /> },
  { id: 'creatureFilters', label: t('csm.tab.creatureFilters'), icon: <ListFilter size={16} /> },
  { id: 'loot', label: t('csm.tab.loot'), icon: <CoinIcon size={16} /> },
];

/** Whether what was typed is the system's rules to the letter; a roll with a space or another case is kept as typed. */
function isSameAsTyped(typed: InitiativeRules, system: InitiativeRules): boolean {
  return typed.mode === system.mode && typed.firstSide === system.firstSide && typed.roll === system.roll;
}

// ── Component ──────────────────────────────────────────────────────────────

export function CollectionSettingsModal({
  isOpen,
  onClose,
  collectionId,
  initialTab = 'system',
}: CollectionSettingsModalProps): React.ReactElement | null {
  const { app } = useAtlasUI();
  const lightingOn = useExperimentalFeature('dynamicLighting');
  const assetService = app ? AssetService.getInstance(app) : null;
  const systemPresets = useSystemPresets(app);
  const windowVariants = useDialogWindowVariants();

  const [activeTab, setActiveTab] = useState<CollectionSettingsTab>(initialTab);
  const [collectionName, setCollectionName] = useState('');
  const [releaseLine, setReleaseLine] = useState('');

  // Local draft of settings — only persisted on Save
  const draft = useCollectionSettingsDraft(assetService, collectionId, isOpen);
  const { gridDefaults, conditions } = draft;
  const collectionCreatures = useCollectionCreatures(app ?? null, assetService, collectionId, isOpen && (activeTab === 'creatureFilters' || activeTab === 'resources'));

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

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const dice = collectionDiceRules(draft, systemPresets.presets);
  const systemInitiative = collectionInitiativeRules({ systemPresetId: draft.systemPresetId }, systemPresets.presets);
  // The draft as it is typed, half a roll included; only stored rules are parsed
  const initiative = draft.initiative ?? systemInitiative;
  const senses = collectionSenses(draft, systemPresets.presets);
  // What the collection's game system gives it; an edit that ends up there again stores nothing.
  const systemSenses = collectionSenses({ systemPresetId: draft.systemPresetId }, systemPresets.presets);
  const canSave = areRangeBandsValid(gridDefaults.abstractRangeBands)
    && isValidDiceRules(dice)
    && isValidInitiativeRules(initiative)
    && sensesAreValid(senses)
    && draft.customCreatureFilters.every(isCompleteCreatureFilter)
    // A resource without a name or a statblock field could never show
    && draft.resources.every((resource) => resource.name.trim() !== '' && resource.field.trim() !== '');

  const handleSave = async (): Promise<void> => {
    if (!app || !assetService || !canSave) return;

    try {
      await assetService.updateCollectionSettings(collectionId, draft.toSettings());
      // Widgets and token conditions follow the saved game system in every scene.
      await syncCollectionSystem(app, collectionId, systemPresets.presets);
      onClose();
    } catch (err) {
      console.error('[CollectionSettingsModal] Failed to save:', err);
    }
  };

  const handleDeletePreset = async (preset: SystemPreset): Promise<void> => {
    if (!app || !systemPresets.service) return;
    if (draft.systemPresetId === preset.id) draft.clearSystem();
    await deleteSystemPreset(app, systemPresets.service, preset.id);
  };

  if (!isOpen) return null;

  return createPortal(
    <motion.div {...dialogOverlayMotion} className="atlas-vtt-plugin atlas-vtt-root atlas-collection-settings-overlay"
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Backdrop */}
      <div
        className="atlas-collection-settings-backdrop"
        onClick={onClose}
      />

      {/* Modal */}
      <motion.div
        className="atlas-vtt-plugin atlas-collection-settings-modal"
        variants={windowVariants}
        role="dialog"
        aria-modal="true"
        aria-labelledby="atlas-csm-title"
      >
        {/* Header */}
        <div className="atlas-collection-settings-header">
          <h3 id="atlas-csm-title">
            {t('csm.title', { name: collectionName })}
            {releaseLine && <span className="atlas-collection-settings-release">{releaseLine}</span>}
          </h3>
          <CloseButton onClick={onClose} aria-label={t('csm.close')} />
        </div>

        {/* Body — sidebar + content */}
        <div className="atlas-collection-settings-body">
          {/* Vertical tab sidebar */}
          <nav className="atlas-collection-settings-sidebar">
            {TABS.filter((tab) => tab.id !== 'vision' || lightingOn).map((tab) => (
              <Button
                key={tab.id}
                variant="ghost"
                className={`atlas-collection-settings-tab ${activeTab === tab.id ? 'atlas-active' : ''}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.icon}
                {tab.label}
              </Button>
            ))}
          </nav>

          {/* Tab content */}
          <SettingsContent>
            {activeTab === 'system' && systemPresets.service && (
              <SystemTab
                service={systemPresets.service}
                presets={systemPresets.presets}
                rules={{
                  gridDefaults,
                  conditions,
                  defaultWidgets: draft.defaultWidgets,
                  dice,
                  initiative,
                  resources: savedResources(draft.resources),
                  ...(draft.defaultTokenVision && { defaultTokenVision: draft.defaultTokenVision }),
                  senses,
                  lightPresets: collectionLightPresets(draft, systemPresets.presets),
                }}
                presetId={draft.systemPresetId}
                onApplyPreset={draft.applyPreset}
                onPresetIdChange={draft.setSystemPresetId}
                onDeletePreset={handleDeletePreset}
              />
            )}
            {activeTab === 'dice' && (
              <DiceTab dice={dice} onChange={draft.setDice} />
            )}
            {activeTab === 'grid' && (
              <GridMeasurementTab
                gridDefaults={gridDefaults}
                coneAngle={collectionConeAngle(gridDefaults, draft.systemPresetId)}
                onChange={draft.setGridDefaults}
              />
            )}
            {activeTab === 'vision' && lightingOn && (
              <VisionTab
                gridDefaults={gridDefaults}
                vision={draft.defaultTokenVision}
                onChange={draft.setDefaultTokenVision}
                senses={senses}
                onSensesChange={(next) => draft.setSenses(editedSenses(next, systemSenses))}
              />
            )}
            {activeTab === 'widgets' && (
              <DefaultWidgetsTab
                defaultWidgets={draft.defaultWidgets}
                onChange={draft.setDefaultWidgets}
                initiative={initiative}
                // Rules that are the game system's again store nothing, so the collection keeps following it
                onInitiativeChange={(next) => draft.setInitiative(isSameAsTyped(next, systemInitiative) ? undefined : next)}
              />
            )}
            {activeTab === 'conditions' && (
              <ConditionsTab
                conditions={conditions}
                onChange={draft.setConditions}
              />
            )}
            {activeTab === 'resources' && (
              <ResourcesTab
                resources={draft.resources}
                onChange={draft.setResources}
                fieldSuggestions={discoverResourceFields(collectionCreatures.creatures.map((creature) => creature.fields))}
              />
            )}
            {activeTab === 'creatureFilters' && (
              <CreatureFiltersTab
                hidden={draft.hiddenCreatureFilters}
                onHiddenChange={draft.setHiddenCreatureFilters}
                custom={draft.customCreatureFilters}
                onCustomChange={draft.setCustomCreatureFilters}
                creatures={collectionCreatures.creatures}
                pending={collectionCreatures.pending}
              />
            )}
            {activeTab === 'loot' && app && (
              <LootTab
                app={app}
                lootBases={draft.lootBases}
                onBasesChange={draft.setLootBases}
                currency={draft.lootCurrency}
                onCurrencyChange={draft.setLootCurrency}
              />
            )}
          </SettingsContent>
        </div>

        {/* Footer */}
        <div className="atlas-collection-settings-footer">
          <Button variant="outline" className="atlas-csm-cancel" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="default" className="atlas-csm-save" disabled={!canSave} onClick={() => { void handleSave(); }}>
            {t('common.save')}
          </Button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

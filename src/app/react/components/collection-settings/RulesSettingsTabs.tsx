import React from 'react';
import { Dice5, Dices, Eye, Gauge, Grid3X3, LayoutGrid, ListFilter, ScrollText, ShieldAlert, Swords } from 'lucide-react';
import { CoinIcon } from '../CoinIcon';
import { Button } from '../../../packages/components/primitives/button';
import { collectionConeAngle } from '../../../gameSystems/coneAngle';
import { isSameAsTyped, type RulesView } from '../../../gameSystems/rulesView';
import { editedSenses } from '../../../gameSystems/senseEditing';
import type { SystemPresetService } from '../../../services/SystemPresetService';
import type { InitiativeRules } from '../../../types/initiativeRulesTypes';
import type { SystemPreset } from '../../../types/systemPresetTypes';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import type { DiceSets } from '../../hooks/useDiceSets';
import { t } from '../../../i18n';
import { ConditionsTab } from './ConditionsTab';
import { DiceTab } from './DiceTab';
import { GridMeasurementTab } from './GridMeasurementTab';
import { InitiativeFields } from './InitiativeFields';
import { ResourcesTab } from './ResourcesTab';
import { SettingsContent } from './SettingsContent';
import { SystemTab, type NoSystemChoice } from './SystemTab';
import type { RulesDraft } from './useRulesDraft';
import { VisionTab } from './VisionTab';

/** The tabs of a settings dialog: the game system's rules, and what a collection keeps beside them. */
export type SettingsTab =
  'system' | 'dice' | 'grid' | 'vision' | 'widgets' | 'conditions' | 'resources' | 'initiative' | 'statblocks' | 'creatureFilters' | 'loot';

/** The tabs of the game system's rules, which a played campaign's system replaces on every map. */
export const RULES_TABS: readonly SettingsTab[] = ['system', 'dice', 'grid', 'vision', 'conditions', 'resources', 'initiative'];

const TAB_LABELS: Record<SettingsTab, { label: string; icon: React.ReactNode }> = {
  system: { label: t('csm.tab.system'), icon: <Dices size={16} /> },
  dice: { label: 'Dice', icon: <Dice5 size={16} /> },
  grid: { label: t('csm.tab.grid'), icon: <Grid3X3 size={16} /> },
  vision: { label: t('csm.tab.vision'), icon: <Eye size={16} /> },
  widgets: { label: t('csm.tab.widgets'), icon: <LayoutGrid size={16} /> },
  conditions: { label: t('csm.tab.conditions'), icon: <ShieldAlert size={16} /> },
  resources: { label: 'Resources', icon: <Gauge size={16} /> },
  initiative: { label: t('csm.tab.initiative'), icon: <Swords size={16} /> },
  statblocks: { label: 'Statblocks', icon: <ScrollText size={16} /> },
  creatureFilters: { label: t('csm.tab.creatureFilters'), icon: <ListFilter size={16} /> },
  loot: { label: t('csm.tab.loot'), icon: <CoinIcon size={16} /> },
};

interface RulesSettingsTabsProps {
  /** The tabs offered, in order; Vision only while dynamic lighting is on (`lightingOn`). */
  tabs: readonly SettingsTab[];
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  draft: Omit<RulesDraft, 'toSettings'>;
  /** The draft as it reads (`viewOfRules`). */
  view: RulesView;
  presets: { service: SystemPresetService | null; presets: readonly SystemPreset[] };
  /** The vault's dice sets, which the Dice tab picks from. */
  diceSets: DiceSets;
  onDeletePreset: (preset: SystemPreset) => Promise<void>;
  /** A choice of no game system at all, for rules that may have none. */
  none?: NoSystemChoice;
  lightingOn: boolean;
  /** The statblock fields the Resources tab offers as chips (`resourceFieldSuggestions`). */
  fieldSuggestions: readonly FieldSuggestion[];
  /** The statblock fields the initiative modifier is offered (`initiativeFieldSuggestions`). */
  initiativeFieldSuggestions: readonly FieldSuggestion[];
  /** The content of a tab that is not one of the rules', such as a collection's loot. */
  renderOther?: (tab: SettingsTab) => React.ReactNode;
  /** A line above the rules' tabs (`RULES_TABS`), such as that a played campaign's rules apply in their place. */
  rulesNotice?: React.ReactNode;
}

/**
 * The sidebar and content of a settings dialog's tabs. The game system's tabs (system, dice,
 * measurement, vision, conditions, resources, initiative) edit `draft`, wherever its rules are
 * kept; any other tab is the caller's (`renderOther`).
 */
export function RulesSettingsTabs({
  tabs, activeTab, onTabChange, draft, view, presets, diceSets, onDeletePreset, none, lightingOn, fieldSuggestions, initiativeFieldSuggestions, renderOther, rulesNotice,
}: RulesSettingsTabsProps): React.ReactElement {
  const shown = tabs.filter((tab) => tab !== 'vision' || lightingOn);

  const content = (): React.ReactNode => {
    switch (activeTab) {
      case 'system':
        return presets.service && (
          <SystemTab
            service={presets.service}
            presets={presets.presets}
            rules={view.systemRules}
            presetId={draft.systemPresetId}
            onApplyPreset={draft.applyPreset}
            onPresetIdChange={draft.setSystemPresetId}
            onDeletePreset={onDeletePreset}
            {...(none && { none })}
          />
        );
      case 'dice':
        return <DiceTab diceSet={view.diceSet} diceSets={diceSets} onPick={draft.pickDiceSet} />;
      case 'grid':
        return (
          <GridMeasurementTab
            gridDefaults={draft.gridDefaults}
            coneAngle={collectionConeAngle(draft.gridDefaults, draft.systemPresetId)}
            onChange={draft.setGridDefaults}
          />
        );
      case 'vision':
        return lightingOn && (
          <VisionTab
            gridDefaults={draft.gridDefaults}
            vision={draft.defaultTokenVision}
            onChange={draft.setDefaultTokenVision}
            senses={view.senses}
            onSensesChange={(next) => draft.setSenses(editedSenses(next, view.systemSenses))}
          />
        );
      case 'conditions':
        return <ConditionsTab conditions={draft.conditions} onChange={draft.setConditions} />;
      case 'resources':
        return <ResourcesTab resources={draft.resources} onChange={draft.setResources} fieldSuggestions={fieldSuggestions} />;
      case 'initiative':
        return <InitiativeFields initiative={view.initiative} onChange={initiativeEdit(draft, view)} fieldSuggestions={initiativeFieldSuggestions} />;
      default:
        return renderOther?.(activeTab);
    }
  };

  return (
    <div className="atlas-collection-settings-body">
      <nav className="atlas-collection-settings-sidebar">
        {shown.map((tab) => (
          <Button
            key={tab}
            variant="ghost"
            className={`atlas-collection-settings-tab ${activeTab === tab ? 'atlas-active' : ''}`}
            onClick={() => onTabChange(tab)}
          >
            {TAB_LABELS[tab].icon}
            {TAB_LABELS[tab].label}
          </Button>
        ))}
      </nav>
      <SettingsContent>
        {RULES_TABS.includes(activeTab) && rulesNotice}
        {content()}
      </SettingsContent>
    </div>
  );
}

/** Sets typed initiative rules; rules that are the game system's again store nothing, so the draft keeps following it. */
export function initiativeEdit(draft: Pick<RulesDraft, 'setInitiative'>, view: Pick<RulesView, 'systemInitiative'>): (next: InitiativeRules) => void {
  return (next) => draft.setInitiative(isSameAsTyped(next, view.systemInitiative) ? undefined : next);
}

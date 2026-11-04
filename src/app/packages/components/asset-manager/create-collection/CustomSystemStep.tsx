import React from 'react';
import { ConditionsTab } from '../../../../react/components/collection-settings/ConditionsTab';
import { DefaultWidgetsTab } from '../../../../react/components/collection-settings/DefaultWidgetsTab';
import { GridMeasurementTab } from '../../../../react/components/collection-settings/GridMeasurementTab';
import { ResourcesTab } from '../../../../react/components/collection-settings/ResourcesTab';
import type { ResourceDefinition } from '../../../../resources/resourceTypes';
import type { CollectionGridDefaults, ConditionDefinition } from '../../../../types/collectionSettingsTypes';
import type { InitiativeRules } from '../../../../types/initiativeRulesTypes';
import { t } from '../../../../i18n';

/** The rules a game system set up while creating a collection consists of. */
export interface CustomSystemRules {
  gridDefaults: CollectionGridDefaults;
  conditions: ConditionDefinition[];
  defaultWidgets: Record<string, boolean>;
  initiative: InitiativeRules;
  resources: ResourceDefinition[];
}

interface CustomSystemStepProps {
  presetName: string;
  onPresetNameChange: (name: string) => void;
  /** Shown under the name once the user tried to continue with an unusable one. */
  presetNameError: string | null;
  rules: CustomSystemRules;
  onRulesChange: (rules: CustomSystemRules) => void;
}

/**
 * Sets up a game system while creating a collection, with the same editors as
 * Collection Settings. It is saved as a preset, so other collections can use it.
 */
export function CustomSystemStep({
  presetName, onPresetNameChange, presetNameError, rules, onRulesChange,
}: CustomSystemStepProps): React.ReactElement {
  return (
    <>
      <div className="atlas-csm-field">
        <label className="atlas-csm-label" htmlFor="atlas-new-system-name">{t('am.system.presetName')}</label>
        <input
          id="atlas-new-system-name"
          type="text"
          className="atlas-csm-input"
          placeholder="e.g. My homebrew"
          value={presetName}
          aria-invalid={presetNameError !== null || undefined}
          onChange={(e) => onPresetNameChange(e.target.value)}
          autoFocus
        />
        {presetNameError && <p className="atlas-csm-hint atlas-csm-hint--error" role="alert">{presetNameError}</p>}
      </div>

      <section className="atlas-create-collection__section" aria-labelledby="atlas-new-system-measure">
        <h4 id="atlas-new-system-measure" className="atlas-create-collection__heading">{t('am.system.measurement')}</h4>
        <GridMeasurementTab
          gridDefaults={rules.gridDefaults}
          onChange={(gridDefaults) => onRulesChange({ ...rules, gridDefaults })}
        />
      </section>

      <section className="atlas-create-collection__section" aria-labelledby="atlas-new-system-conditions">
        <h4 id="atlas-new-system-conditions" className="atlas-create-collection__heading">{t('am.system.conditions')}</h4>
        <ConditionsTab
          conditions={rules.conditions}
          onChange={(conditions) => onRulesChange({ ...rules, conditions })}
        />
      </section>

      <section className="atlas-create-collection__section" aria-labelledby="atlas-new-system-resources">
        <h4 id="atlas-new-system-resources" className="atlas-create-collection__heading">Resources</h4>
        <ResourcesTab
          resources={rules.resources}
          onChange={(resources) => onRulesChange({ ...rules, resources })}
          fieldSuggestions={[]}
        />
      </section>

      <section className="atlas-create-collection__section" aria-labelledby="atlas-new-system-widgets">
        <h4 id="atlas-new-system-widgets" className="atlas-create-collection__heading">{t('am.system.bars')}</h4>
        <DefaultWidgetsTab
          defaultWidgets={rules.defaultWidgets}
          onChange={(defaultWidgets) => onRulesChange({ ...rules, defaultWidgets })}
          initiative={rules.initiative}
          onInitiativeChange={(initiative) => onRulesChange({ ...rules, initiative })}
          initiativeFieldSuggestions={[]}
        />
      </section>
    </>
  );
}

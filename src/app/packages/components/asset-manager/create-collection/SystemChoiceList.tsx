import React from 'react';
import { SystemPresetRow } from '../../../../react/components/collection-settings/SystemPresetRow';
import type { SystemPreset } from '../../../../types/systemPresetTypes';
import { t } from '../../../../i18n';

/** What a new collection plays: no game system, a saved preset, or one set up on the spot. */
export type SystemChoice = { kind: 'none' } | { kind: 'preset'; presetId: string } | { kind: 'custom' };

interface SystemChoiceListProps {
  presets: readonly SystemPreset[];
  choice: SystemChoice;
  onChange: (choice: SystemChoice) => void;
}

/** The game systems a new collection can start with, as one radio group. */
export function SystemChoiceList({ presets, choice, onChange }: SystemChoiceListProps): React.ReactElement {
  return (
    <div className="atlas-csm-preset-list" role="radiogroup" aria-label={t('am.create.system')}>
      <SystemPresetRow
        name={t('am.system.none')}
        summary={t('am.system.noneSummary')}
        isActive={choice.kind === 'none'}
        onSelect={() => onChange({ kind: 'none' })}
      />
      {presets.map((preset) => (
        <SystemPresetRow
          key={preset.id}
          name={preset.name}
          rules={preset.rules}
          isBuiltIn={preset.builtIn}
          isActive={choice.kind === 'preset' && choice.presetId === preset.id}
          onSelect={() => onChange({ kind: 'preset', presetId: preset.id })}
        />
      ))}
      <SystemPresetRow
        name={t('am.system.own')}
        summary={t('am.system.ownSummary')}
        isActive={choice.kind === 'custom'}
        onSelect={() => onChange({ kind: 'custom' })}
      />
    </div>
  );
}

/**
 * Where a turn-order fight reads each combatant's initiative modifier: a statblock field, whether
 * it holds an ability score, and the fallback a game system may name.
 */

import React from 'react';
import { X } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import { modifierPreview, type NamedModifierStatblock } from '../../../initiative/modifierPreview';
import type { InitiativeModifierSource, InitiativeRules } from '../../../types/initiativeRulesTypes';
import { t } from '../../../i18n';
import { SettingRow } from './SettingRow';
import { ToggleSwitch } from '../../../packages/components/primitives/Toggle';
import { StatblockFieldSelect } from './StatblockFieldSelect';

interface InitiativeModifierFieldsProps {
  initiative: InitiativeRules;
  onChange: (initiative: InitiativeRules) => void;
  fieldSuggestions: readonly FieldSuggestion[];
  /** The collection's statblocks: the line under the field says what the rules read in them. */
  statblocks?: readonly NamedModifierStatblock[] | undefined;
}

/** The rules with `modifier` and `fallback` as their sources, each absent where it is none. */
function withSources(
  { modifier: _modifier, modifierFallback: _fallback, ...rules }: InitiativeRules,
  modifier: InitiativeModifierSource | undefined,
  fallback: InitiativeModifierSource | undefined,
): InitiativeRules {
  return { ...rules, ...(modifier?.field && { modifier }), ...(fallback && { modifierFallback: fallback }) };
}

export function InitiativeModifierFields({ initiative, onChange, fieldSuggestions, statblocks }: InitiativeModifierFieldsProps): React.ReactElement {
  const field = initiative.modifier?.field ?? '';
  const abilityScore = initiative.modifier?.abilityScore === true;
  const fallback = initiative.modifierFallback;
  const setModifier = (next: { field?: string; abilityScore?: boolean }): void => {
    const merged = { field, abilityScore, ...next };
    onChange(withSources(initiative, { field: merged.field, ...(merged.abilityScore && { abilityScore: true }) }, fallback));
  };

  return (
    <>
      <SettingRow
        label={t('initiative.modifierShort')}
        info={t('initiative.modifierHint')}
        control={(labelId) => (
          // A score's slot is picked as a score: DEX 16 adds +3, never +16.
          <StatblockFieldSelect suggestions={fieldSuggestions} value={field} labelledBy={labelId}
            onChange={(path, suggestion) => setModifier({ field: path, ...(suggestion && { abilityScore: suggestion.score === true }) })} />
        )}
      >
        {statblocks && statblocks.length > 0 && field !== '' && <ModifierPreviewLine statblocks={statblocks} initiative={initiative} />}
      </SettingRow>
      <SettingRow
        label={t('initiative.abilityScoreShort')}
        info={t('initiative.abilityScoreHint')}
        control={(labelId) => <ToggleSwitch labelledBy={labelId} value={abilityScore} disabled={field === ''} onChange={() => setModifier({ abilityScore: !abilityScore })} />}
      />
      {fallback && (
        <SettingRow
          label={t('initiative.fallbackLabel')}
          info={t('initiative.fallbackInfo')}
          control={() => (
            <span className="atlas-csm-setting__value">
              <span className="atlas-csm-setting__text">{t(fallback.abilityScore ? 'initiative.fallbackScoreValue' : 'initiative.fallbackValue', { field: fallback.field })}</span>
              <LabelTooltip label={t('initiative.removeFallback')}>
                <Button variant="ghost" size="icon" aria-label={t('initiative.removeFallback')} onClick={() => onChange(withSources(initiative, initiative.modifier, undefined))}>
                  <X />
                </Button>
              </LabelTooltip>
            </span>
          )}
        />
      )}
    </>
  );
}

/** How the rules read the collection's statblocks as they stand in the draft, with an example. */
function ModifierPreviewLine({ statblocks, initiative }: { statblocks: readonly NamedModifierStatblock[]; initiative: InitiativeRules }): React.ReactElement {
  const { total, read, example } = modifierPreview(statblocks, initiative);
  const text = example
    ? t('initiative.previewRead', { count: total, read, name: example.name, modifier: signedModifier(example.modifier) })
    : t('initiative.previewNone', { count: total });
  return <p className={example ? 'atlas-csm-hint' : 'atlas-csm-hint atlas-csm-hint--error'} aria-live="polite">{text}</p>;
}

const signedModifier = (modifier: number): string => (modifier < 0 ? `−${-modifier}` : `+${modifier}`);

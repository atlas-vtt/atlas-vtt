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
import { StatblockFieldChips } from './StatblockFieldChips';

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
    <div className="atlas-csm-field">
      <label className="atlas-csm-label" htmlFor="atlas-csm-initiative-modifier">{t('initiative.modifierField')}</label>
      <input
        id="atlas-csm-initiative-modifier"
        type="text"
        className="atlas-csm-input"
        placeholder={t('initiative.modifierPlaceholder')}
        spellCheck={false}
        aria-describedby="atlas-csm-initiative-modifier-hint"
        value={field}
        onChange={(e) => setModifier({ field: e.target.value })}
      />
      {/* A score's slot is picked as a score: DEX 16 adds +3, never +16 */}
      <StatblockFieldChips suggestions={fieldSuggestions} value={field}
        onPick={(path, suggestion) => setModifier({ field: path, abilityScore: suggestion?.score === true })} />
      <p id="atlas-csm-initiative-modifier-hint" className="atlas-csm-hint">{t('initiative.modifierHint')}</p>
      {statblocks && statblocks.length > 0 && <ModifierPreviewLine statblocks={statblocks} initiative={initiative} />}
      <div className="atlas-csm-toggle-row">
        <div>
          <div className="atlas-csm-toggle-label">{t('initiative.abilityScore')}</div>
          <div className="atlas-csm-hint">{t('initiative.abilityScoreHint')}</div>
        </div>
        <label className="atlas-csm-switch">
          <input
            type="checkbox"
            aria-label={t('initiative.abilityScore')}
            checked={abilityScore}
            disabled={field === ''}
            onChange={(e) => setModifier({ abilityScore: e.target.checked })}
          />
          <span className="atlas-csm-switch-track" />
        </label>
      </div>
      {fallback && (
        <div className="atlas-csm-toggle-row">
          <div className="atlas-csm-hint">
            {t(fallback.abilityScore ? 'initiative.fallbackScore' : 'initiative.fallback', { field: fallback.field })}
          </div>
          <LabelTooltip label={t('initiative.removeFallback')}>
            <Button variant="ghost" size="icon" aria-label={t('initiative.removeFallback')} onClick={() => onChange(withSources(initiative, initiative.modifier, undefined))}>
              <X />
            </Button>
          </LabelTooltip>
        </div>
      )}
    </div>
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

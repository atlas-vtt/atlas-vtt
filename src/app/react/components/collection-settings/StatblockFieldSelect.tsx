import React, { useState } from 'react';
import { Select, type SelectOption } from '../../../packages/components/primitives/Select';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import { t } from '../../../i18n';

/** The choice that reveals a field for a statblock key the collection's templates do not name. */
const OTHER = '__other__';

interface StatblockFieldSelectProps {
  /** The fields offered, in order (`initiativeFieldSuggestions`). */
  suggestions: readonly FieldSuggestion[];
  /** The field chosen; empty for none. */
  value: string;
  /** Called with the path chosen, and the suggestion it came from when it is one. */
  onChange: (path: string, suggestion?: FieldSuggestion) => void;
  labelledBy: string;
}

/** The group a suggestion is listed under: what the templates mean as this setting, a score's slot, or any other field. */
function groupOf({ recommended, score }: FieldSuggestion): string {
  if (recommended) return t('initiative.fieldGroup.suggested');
  return score ? t('initiative.fieldGroup.scores') : t('initiative.fieldGroup.other');
}

/**
 * The fields as options, grouped, each named by its label; a field's key follows its name only
 * where another field bears the same name.
 */
function fieldOptions(suggestions: readonly FieldSuggestion[]): SelectOption<string>[] {
  const named = new Map<string, number>();
  for (const { path, label } of suggestions) named.set(label ?? path, (named.get(label ?? path) ?? 0) + 1);
  const order = [t('initiative.fieldGroup.suggested'), t('initiative.fieldGroup.scores'), t('initiative.fieldGroup.other')];
  return suggestions
    .map((suggestion) => {
      const name = suggestion.label ?? suggestion.path;
      return { value: suggestion.path, label: name, group: groupOf(suggestion), ...((named.get(name) ?? 0) > 1 && { detail: suggestion.path }) };
    })
    .sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group));
}

/** A statblock field, picked from the collection's fields (grouped) or typed as another key. */
export function StatblockFieldSelect({ suggestions, value, onChange, labelledBy }: StatblockFieldSelectProps): React.ReactElement {
  const known = value === '' || suggestions.some(({ path }) => path === value);
  const [typing, setTyping] = useState(!known);
  const options: SelectOption<string>[] = [
    { value: '', label: t('initiative.modifierNone') },
    ...fieldOptions(suggestions),
    // Listed with the other fields: a key none of the templates names.
    { value: OTHER, label: t('initiative.modifierCustom'), group: t('initiative.fieldGroup.other') },
  ];

  return (
    <div className="atlas-csm-field-select">
      <Select
        value={typing ? OTHER : value}
        options={options}
        labelledBy={labelledBy}
        onChange={(next) => {
          if (next === OTHER) {
            setTyping(true);
            return;
          }
          setTyping(false);
          onChange(next, suggestions.find(({ path }) => path === next));
        }}
      />
      {typing && (
        <input
          type="text"
          className="atlas-csm-input"
          aria-labelledby={labelledBy}
          placeholder={t('initiative.modifierPlaceholder')}
          spellCheck={false}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

import React from 'react';
import { cn } from '../../../../utils/cn';
import type { FieldSuggestion } from '../../../resources/resourceFieldSuggestions';
import { t } from '../../../i18n';

interface StatblockFieldChipsProps {
  /** The fields offered, in order (`resourceFieldSuggestions`, `initiativeFieldSuggestions`). */
  suggestions: readonly FieldSuggestion[];
  /** The field as typed so far. */
  value: string;
  /** Called with the path picked and the suggestion it came from. */
  onPick: (path: string, suggestion?: FieldSuggestion) => void;
}

/** Whether a suggestion's path or name holds what is typed. */
const holds = ({ path, label }: FieldSuggestion, typed: string): boolean =>
  path.toLowerCase().includes(typed) || Boolean(label?.toLowerCase().includes(typed));

/**
 * The fields of the collection's statblocks, each picked with one click; typing in the field
 * narrows them. A field that is one of them narrows nothing: the others stay on offer.
 */
export function StatblockFieldChips({ suggestions, value, onPick }: StatblockFieldChipsProps): React.ReactElement | null {
  const typed = value.trim().toLowerCase();
  const offered = suggestions.some(({ path }) => path.toLowerCase() === typed)
    ? suggestions
    : suggestions.filter((suggestion) => holds(suggestion, typed));
  if (offered.length === 0) return null;

  return (
    <div className="atlas-csm-field-chips" role="group" aria-label={t('csm.statblockFieldChips')}>
      {offered.map((suggestion) => {
        const { path, label, sample } = suggestion;
        return (
          <button key={path} type="button" className={cn('atlas-csm-field-chip', path === value && 'atlas-selected')}
            aria-pressed={path === value} onClick={() => onPick(path, suggestion)}>
            {label && label !== path ? <>{label}<span className="atlas-csm-field-chip__path">{path}</span></> : path}
            {sample && <span className="atlas-csm-field-chip__sample">{sample}</span>}
          </button>
        );
      })}
    </div>
  );
}

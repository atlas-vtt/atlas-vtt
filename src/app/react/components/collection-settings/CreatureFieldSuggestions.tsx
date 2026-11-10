import React from 'react';
import { Plus } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { LoadingSpinner } from '../../../packages/components/primitives/LoadingSpinner';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { DiscoveredField } from '../../../creatures/creatureFieldDiscovery';
import { t } from '../../../i18n';

interface CreatureFieldSuggestionsProps {
  fields: readonly DiscoveredField[];
  /** How many statblocks the fields come from. */
  statblockCount: number;
  pending: boolean;
  onAdd: (field: DiscoveredField) => void;
}

function describeValues(field: DiscoveredField): string {
  // Values may hold commas themselves ("fire, poison"), so they are set apart with a dot.
  if (field.kind === 'options') return field.samples.join(' · ');
  const [first, ...rest] = field.samples;
  return rest.length > 0 ? `${first} – ${rest.at(-1)}` : first ?? '';
}

/** What a field holds: its kind, and a few of its values where any are known. */
function describeField(field: DiscoveredField): string {
  const values = describeValues(field);
  return `${field.kind === 'range' ? t('csm.filters.kind.range') : t('csm.filters.kind.options')}${values ? ` · ${values}` : ''}`;
}

/**
 * The fields of the collection's role templates and statblocks that no filter reads yet, each
 * added with one click. A template's field is named as the template names it.
 */
export function CreatureFieldSuggestions({ fields, statblockCount, pending, onAdd }: CreatureFieldSuggestionsProps): React.JSX.Element {
  if (pending && fields.length === 0) {
    return (
      <div className="atlas-csm-empty atlas-csm-creature-fields__status">
        <LoadingSpinner size={16} />
        {t('csm.filters.reading')}
      </div>
    );
  }
  if (fields.length === 0) {
    return statblockCount === 0
      ? <div className="atlas-csm-empty">{t('csm.filters.linkStatblocks')}</div>
      : <div className="atlas-csm-empty">{t('csm.filters.noOtherFields')}</div>;
  }
  return (
    <ul className="atlas-csm-creature-fields" aria-label={t('csm.filters.statblockFields')}>
      {fields.map((field) => (
        <li key={field.field} className="atlas-csm-creature-field">
          <div className="atlas-csm-creature-field__text">
            {field.label && <span className="atlas-csm-creature-field__label">{field.label}</span>}
            <code className="atlas-csm-creature-field__name">{field.field}</code>
            <span className="atlas-csm-hint">{describeField(field)}</span>
          </div>
          {statblockCount > 0 && (
            <span className="atlas-csm-creature-field__count">
              {t('csm.filters.countOf', { count: field.count, total: statblockCount })}
            </span>
          )}
          <LabelTooltip label={t('csm.filters.filterBy', { field: field.label ?? field.field })}>
            <Button variant="ghost" size="icon" className="atlas-csm-creature-field__add" onClick={() => onAdd(field)}>
              <Plus />
            </Button>
          </LabelTooltip>
        </li>
      ))}
    </ul>
  );
}

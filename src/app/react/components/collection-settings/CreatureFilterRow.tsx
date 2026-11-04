import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl } from '../../../packages/components/primitives/SegmentedControl';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import { filterFields, isCompleteCreatureFilter, withFilterKind } from '../../../creatures/creatureFilterDefinitions';
import type { CreatureFilterDefinition, CreatureFilterKind } from '../../../types/creatureFilterTypes';
import { t } from '../../../i18n';

const KIND_OPTIONS = [
  { value: 'range', label: t('csm.filters.kind.range') },
  { value: 'options', label: t('csm.filters.kind.options') },
] as const;

interface CreatureFilterRowProps {
  filter: CreatureFilterDefinition;
  isFirst: boolean;
  isLast: boolean;
  onChange: (filter: CreatureFilterDefinition) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}

/** The fields as typed: an options filter reads several, separated by commas. */
function withFieldText(filter: CreatureFilterDefinition, text: string): CreatureFilterDefinition {
  if (filter.kind === 'range') return { ...filter, field: text.trim() };
  return { ...filter, fields: text.split(',').map((field) => field.trim()).filter(Boolean) };
}

/** One filter of the collection: its label, the statblock field(s) it reads and how. */
export function CreatureFilterRow({ filter, isFirst, isLast, onChange, onMove, onRemove }: CreatureFilterRowProps): React.JSX.Element {
  // Kept as typed, so a trailing comma survives until the next field name follows it.
  const [fieldText, setFieldText] = useState(() => filterFields(filter).join(', '));
  const incomplete = !isCompleteCreatureFilter(filter);

  const changeKind = (kind: CreatureFilterKind): void => {
    const next = withFilterKind(filter, kind);
    setFieldText(filterFields(next).join(', '));
    onChange(next);
  };

  return (
    <div className="atlas-csm-condition atlas-csm-creature-filter">
      <div className="atlas-csm-condition-row">
        <input
          type="text"
          className="atlas-csm-input"
          placeholder={t('csm.filters.label')}
          aria-label={t('csm.filters.filterLabel')}
          value={filter.label}
          onChange={(e) => onChange({ ...filter, label: e.target.value })}
        />
        <LabelTooltip label={t('common.moveUp')}>
          <Button variant="ghost" size="icon" className="atlas-csm-creature-filter__move" disabled={isFirst} onClick={() => onMove(-1)}>
            <ChevronUp />
          </Button>
        </LabelTooltip>
        <LabelTooltip label={t('common.moveDown')}>
          <Button variant="ghost" size="icon" className="atlas-csm-creature-filter__move" disabled={isLast} onClick={() => onMove(1)}>
            <ChevronDown />
          </Button>
        </LabelTooltip>
        <LabelTooltip label={t('csm.filters.remove')}>
          <Button variant="ghost" size="icon" className="atlas-csm-condition-delete" onClick={onRemove}>
            <Trash2 />
          </Button>
        </LabelTooltip>
      </div>
      <div className="atlas-csm-condition-row">
        <input
          type="text"
          className="atlas-csm-input atlas-csm-creature-filter__fields"
          placeholder={filter.kind === 'range' ? t('csm.filters.rangePlaceholder') : t('csm.filters.optionsPlaceholder')}
          aria-label={t('csm.filters.statblockFields')}
          aria-invalid={incomplete || undefined}
          spellCheck={false}
          value={fieldText}
          onChange={(e) => {
            setFieldText(e.target.value);
            onChange(withFieldText(filter, e.target.value));
          }}
        />
        <SegmentedControl
          className="atlas-csm-creature-filter__kind"
          ariaLabel={t('csm.filters.kind')}
          value={filter.kind}
          options={KIND_OPTIONS}
          onChange={changeKind}
        />
      </div>
      {incomplete && <p className="atlas-csm-hint atlas-csm-hint--error">{t('csm.filters.incomplete')}</p>}
    </div>
  );
}

import React, { useId } from 'react';
import { X } from 'lucide-react';
import { t } from '../../../i18n';
import { senseKind, takesRange } from '../../../gameSystems/senseEditing';
import type { SenseRow } from '../../../lighting/tokenLighting';
import { Button } from '../../../packages/components/primitives/button';
import { LabelTooltip } from '../../../packages/components/primitives/tooltip';
import type { SenseDefinition, TokenSense } from '../../../types/senseTypes';
import { numberText, positiveNumber } from '../../../utils/numberInput';

/** What a list calls a sense its collection does not define, e.g. one of another game system. */
const UNKNOWN_SENSE = t('senses.unknown');

function StatblockTag(): React.ReactElement {
  return <span className="atlas-sense-row__tag">{t('senses.fromStatblock')}</span>;
}

/** What the empty range field of a sense says: its default distance, that it has no limit, or that it needs one. */
function rangePlaceholder(definition: SenseDefinition | undefined): string {
  if (definition?.range === 'required') return definition.defaultRange === undefined ? t('senses.rangePlaceholder') : numberText(definition.defaultRange);
  return t('vision.unlimited');
}

interface SenseRowFieldsProps {
  row: SenseRow;
  /** Undefined for a sense the collection does not define. */
  definition: SenseDefinition | undefined;
  unit: string;
  /** The row still says what the token's statblock says. */
  fromStatblock: boolean;
  inputRef: (input: HTMLInputElement | null) => void;
  onRangeChange: (range: string) => void;
  onRemove: () => void;
}

/** One sense of a list being edited: its name, its range where it takes one, and its remove button. */
export function SenseRowFields({ row, definition, unit, fromStatblock, inputRef, onRangeChange, onRemove }: SenseRowFieldsProps): React.ReactElement {
  const rangeLabel = useId();
  const name = definition?.name ?? UNKNOWN_SENSE;
  // A stored distance limits any sense, so it shows on one that takes none as well.
  const hasRange = definition === undefined || takesRange(definition) || row.range.trim() !== '';
  return (
    <li className="atlas-sense-row">
      <span className="atlas-sense-row__name">
        {name}
        {fromStatblock && <StatblockTag />}
      </span>
      {hasRange && (
        <span className="atlas-sense-row__range">
          <span id={rangeLabel} hidden>{t('senses.rangeOf', { name })}</span>
          <input
            ref={inputRef}
            type="number"
            aria-labelledby={rangeLabel}
            value={row.range}
            min={0}
            placeholder={rangePlaceholder(definition)}
            onChange={(event) => onRangeChange(event.target.value)}
          />
          {unit && <span className="atlas-sense-row__unit">{unit}</span>}
        </span>
      )}
      <LabelTooltip label={t('senses.remove', { name })}>
        <Button variant="ghost" size="icon" className="atlas-sense-row__remove" onClick={onRemove}>
          <X />
        </Button>
      </LabelTooltip>
    </li>
  );
}

/** How far a statblock's sense reaches, as text: its distance, its default, or that it has no limit. */
function reachText(sense: TokenSense, definition: SenseDefinition | undefined, unit: string): string {
  const range = positiveNumber(sense.range) ?? (definition?.range === 'required' ? definition.defaultRange : undefined);
  if (range !== undefined) return `${numberText(range)} ${unit}`.trim();
  return definition && senseKind(definition) === 'sense' && definition.range === 'optional' ? t('vision.unlimited') : '';
}

interface InheritedSenseRowProps {
  sense: TokenSense;
  definition: SenseDefinition | undefined;
  unit: string;
}

/** A sense the token takes from its statblock: shown, not edited. */
export function InheritedSenseRow({ sense, definition, unit }: InheritedSenseRowProps): React.ReactElement {
  const reach = reachText(sense, definition, unit);
  return (
    <li className="atlas-sense-row atlas-sense-row--inherited">
      <span className="atlas-sense-row__name">
        {definition?.name ?? UNKNOWN_SENSE}
        <StatblockTag />
      </span>
      {reach && <span className="atlas-sense-row__reach">{reach}</span>}
    </li>
  );
}

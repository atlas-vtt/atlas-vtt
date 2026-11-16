import React, { useId, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '../../../../packages/components/primitives/button';
import { ToolButton } from '../../../../packages/components/primitives/ToolButton';
import { blockSpec } from '../../../model/blockCatalogue';
import { findBlock } from '../../../model/treeQueries';
import type { FieldKey, LineBlock, StatblockTemplate } from '../../../model/templateTypes';
import { withBlockChanges } from './blockEdits';
import { withChosenField, type FieldChoice } from './fieldChoices';
import { FieldPicker } from './FieldPicker';
import type { GroupProps } from './groupProps';
import { Setting } from './InspectorControls';
import { t } from '../../../../i18n';

/** The line under the name shows one to four values (§7.5). */
const MAX_LINE_FIELDS = 4;
const LINE_TYPES = blockSpec('line').binds;

/** The template with the Line's fields changed by `edit`, read from the Line as the template holds it now. */
function withLineFields(template: StatblockTemplate, id: string, edit: (fields: FieldKey[]) => FieldKey[]): StatblockTemplate {
  const found = findBlock(template.layout.blocks, id)?.block;
  if (found?.type !== 'line') return template;
  return withBlockChanges(template, id, 'line', { fields: edit([...found.fields]) });
}

interface RowProps {
  labelId: string;
  index: number;
  value: FieldKey | null;
  disabled: boolean;
  onPick: (choice: FieldChoice) => void;
  onRemove: (() => void) | null;
}

function LineFieldRow({ labelId, index, value, disabled, onPick, onRemove }: RowProps): React.JSX.Element {
  const rowLabelId = useId();
  return (
    <div className="atlas-te-setting__inline">
      <span id={rowLabelId} hidden>{t('templateEditor.valueN', { n: index + 1 })}</span>
      <FieldPicker labelledBy={`${labelId} ${rowLabelId}`} value={value} accepts={LINE_TYPES} allowNew disabled={disabled}
        placeholder={value ? undefined : t('templateEditor.addAValue')} onPick={onPick} />
      {onRemove && <ToolButton icon={X} label={t('templateEditor.remove')} isActive={false} disabled={disabled} onClick={onRemove} />}
    </div>
  );
}

/** A Line's fields, in the order it writes them; each row picks one, and one more row adds another. */
export function LineFields({ block, session, readOnly }: GroupProps & { block: LineBlock }): React.JSX.Element {
  const [adding, setAdding] = useState(false);
  const rows: Array<FieldKey | null> = [...block.fields, ...(adding || block.fields.length === 0 ? [null] : [])];
  const pickAt = (index: number) => (choice: FieldChoice): void => {
    setAdding(false);
    session.apply((template) => {
      const chosen = withChosenField(template, choice, 'text');
      if (!chosen) return template;
      return withLineFields(chosen.template, block.id, (fields) => {
        fields.splice(index, index < fields.length ? 1 : 0, chosen.key);
        return fields;
      });
    });
  };
  const removeAt = (index: number) => (): void => {
    session.apply((template) => withLineFields(template, block.id, (fields) => fields.filter((_, at) => at !== index)));
  };
  return (
    <Setting label={t('templateEditor.lineValues')} wide>
      {(labelId) => (
        <div className="atlas-te-setting__list">
          {rows.map((key, index) => (
            <LineFieldRow
              key={`${index}:${key ?? ''}`}
              labelId={labelId}
              index={index}
              value={key}
              disabled={readOnly}
              onPick={pickAt(index)}
              onRemove={key ? removeAt(index) : null}
            />
          ))}
          {!adding && block.fields.length > 0 && block.fields.length < MAX_LINE_FIELDS && (
            <Button type="button" variant="ghost" size="sm" className="atlas-te-setting__add" disabled={readOnly} onClick={() => setAdding(true)}>
              <Plus aria-hidden="true" />
              {t('templateEditor.addValue')}
            </Button>
          )}
        </div>
      )}
    </Setting>
  );
}

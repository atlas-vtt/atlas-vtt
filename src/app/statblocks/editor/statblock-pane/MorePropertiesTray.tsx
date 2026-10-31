import React, { forwardRef, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import type { StatblockTemplate, TemplateField } from '../../model/templateTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { readField, type FieldRecord } from '../../values/fieldValues';
import { ChipsEditor } from './ListValueInput';
import { usePaneEdit } from './paneEditContext';
import { hiddenFields } from './templateChoices';
import { TrayValueRow } from './TrayValueRow';
import { t } from '../../../i18n';

/** Obsidian's own properties, edited here while the note's Properties are hidden (D7). */
const NOTE_FIELDS: readonly TemplateField[] = [
  { key: 'tags', label: t('statblockEditor.tags'), type: 'list' },
  { key: 'aliases', label: t('statblockEditor.aliases'), type: 'list' },
];

interface MorePropertiesTrayProps {
  record: FieldRecord;
  template: StatblockTemplate;
}

/**
 * "More properties (n)" under the card (§7.2): the note's tags and aliases as
 * chips, and the values the template hides from the card (header parts it keeps off it),
 * each editable as raw text and removable from the note. Collapsed until opened.
 */
export const MorePropertiesTray = forwardRef<HTMLButtonElement, MorePropertiesTrayProps>(({ record, template }, toggleRef) => {
  const pane = usePaneEdit();
  const [open, setOpen] = useState(false);
  const contentId = useId();
  const hidden = hiddenFields(template);
  const filled = (field: TemplateField): boolean => !isEmptyValue(record[field.key]);
  const count = NOTE_FIELDS.filter(filled).length + hidden.filter(filled).length;

  return (
    <section className="atlas-sb-pane-tray">
      <Button
        ref={toggleRef}
        type="button"
        variant="ghost"
        size="sm"
        className="atlas-sb-pane-tray__toggle"
        aria-expanded={open}
        aria-controls={contentId}
        onClick={() => setOpen((was) => !was)}
      >
        <ChevronRight aria-hidden="true" className="atlas-sb-pane-tray__chevron" />
        {t('statblockEditor.moreProperties', { count })}
      </Button>
      {open && (
        <div id={contentId} className="atlas-sb-pane-tray__content">
          {NOTE_FIELDS.map((field) => (
            <div key={field.key} className="atlas-sb-pane-tray__row">
              <span className="atlas-sb-pane-tray__key">{field.label}</span>
              <ChipsEditor field={field} read={readField(record, field)} write={pane.write} autoFocus={false} />
            </div>
          ))}
          {hidden.length > 0 && (
            <>
              <h3 className="atlas-sb-pane-tray__heading">{t('statblockEditor.hiddenByTemplate')}</h3>
              {hidden.map((field) => <TrayValueRow key={field.key} field={field} />)}
            </>
          )}
        </div>
      )}
    </section>
  );
});

MorePropertiesTray.displayName = 'MorePropertiesTray';

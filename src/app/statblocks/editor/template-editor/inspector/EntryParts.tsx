import React, { useState } from 'react';
import { withAbilityParts } from '../../../model/abilityParts';
import { labelToKey } from '../../../model/fieldKeys';
import type { EntryExtraShape, TemplateField } from '../../../model/templateTypes';
import type { EditorSession } from '../sessionTypes';
import { EntryPartRow } from './EntryPartRow';
import { Setting } from './InspectorControls';
import { t } from '../../../../i18n';

export interface EntryPartsProps {
  /** The properties the component's lists show, one per tab; the first's parts are shown, and every edit is made to all. */
  fields: readonly TemplateField[];
  session: EditorSession;
  readOnly: boolean;
}

/** Parts many statblocks give their abilities, offered with one click; any other is typed. */
const PART_SUGGESTIONS: readonly string[] = ['Type', 'Range', 'Damage', 'Cost', 'Uses', 'Trigger', 'Requirement'];
/** A suggested Type is the kind of ability, which the template names once and every ability picks. */
const CHOICE_SUGGESTIONS: ReadonlySet<string> = new Set(['Type']);

/**
 * What each entry holds before its text (§7.5: entry extras), "Range" or
 * "Cost". A new part takes its key from its first name; renaming it later
 * keeps the key, so the statblocks keep their values.
 */
export function EntryParts({ fields, session, readOnly }: EntryPartsProps): React.JSX.Element {
  const [name, setName] = useState('');
  const keys = fields.map((field) => field.key);
  const extras = fields[0]?.entry?.extras ?? [];
  const edit = (change: (extras: EntryExtraShape[]) => EntryExtraShape[]): void => {
    session.apply((template) => withAbilityParts(template, keys, change));
  };
  const addPart = (label: string, type: EntryExtraShape['type'] = 'text'): void => edit((current) => {
    const own = fields.flatMap((field) => [field.entry?.nameKey ?? 'name', field.entry?.textKey ?? 'desc']);
    return [...current, { key: labelToKey(label, [...own, ...current.map((item) => item.key)]), label, type }];
  });
  const add = (): void => {
    const label = name.trim();
    if (!label) return;
    setName('');
    addPart(label);
  };
  const named = new Set(extras.map((extra) => extra.label.trim().toLowerCase()));
  const suggestions = PART_SUGGESTIONS.filter((label) => !named.has(label.toLowerCase()));
  return (
    <Setting label={t('templateEditor.eachItemHas')} wide>
      {(labelId) => (
        <div className="atlas-te-setting__list">
          {extras.map((extra, index) => (
            <EntryPartRow
              key={extra.key}
              extra={extra}
              index={index}
              session={session}
              disabled={readOnly}
              onEdit={(change) => edit((current) => current.map((item, at) => (at === index ? change(item) : item)))}
              onRemove={() => edit((current) => current.filter((_, at) => at !== index))}
            />
          ))}
          <input
            type="text"
            className="atlas-te-input"
            aria-labelledby={labelId}
            placeholder={t('templateEditor.addPart')}
            disabled={readOnly}
            value={name}
            spellCheck={false}
            onChange={(event) => setName(event.target.value)}
            onBlur={add}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
              event.preventDefault();
              add();
            }}
          />
          {suggestions.length > 0 && (
            <div className="atlas-te-setting__suggestions" role="group" aria-label={t('templateEditor.commonParts')}>
              {suggestions.map((label) => (
                <button key={label} type="button" className="atlas-te-suggestion" disabled={readOnly} onClick={() => addPart(label, CHOICE_SUGGESTIONS.has(label) ? 'choice' : 'text')}>+ {label}</button>
              ))}
            </div>
          )}
        </div>
      )}
    </Setting>
  );
}

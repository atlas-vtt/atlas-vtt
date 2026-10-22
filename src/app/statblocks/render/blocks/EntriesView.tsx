import React, { useContext, useMemo } from 'react';
import type { EntriesBlock, EntryShape, FieldValue } from '../../model/templateTypes';
import { keyedEntryItems } from '../../values/entryKeys';
import { readField } from '../../values/fieldValues';
import { entryExtras, entryName, entryText } from '../../values/entryValues';
import { singular } from '../../values/entryNoun';
import { valueText } from '../../values/valueText';
import { EntryLine } from '../shared/EntryLine';
import { InlineText } from '../shared/InlineText';
import { useSheet } from '../sheetContext';
import { SheetHeading } from '../values/SheetHeading';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueEditingContext, ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

/** An entry's labelled parts before its text: "Range 30 ft. Cost 2". */
function EntryExtras({ entry, shape }: { entry: FieldValue; shape: EntryShape | undefined }): React.JSX.Element | null {
  const { app, sourcePath } = useSheet();
  const extras = entryExtras(entry, shape);
  if (!extras.length) return null;
  return (
    <span className="atlas-sb-entry-extras">
      {extras.map((extra) => (
        <span key={extra.key} className="atlas-sb-entry-extra">
          <span className="atlas-sb-entry-extra-label">{extra.label}</span> <InlineText text={valueText(extra.value)} app={app} sourcePath={sourcePath} dice />
        </span>
      ))}
    </span>
  );
}

/** A list's items by their place, as `keyedEntryItems` counts them: a single value is a list of one. */
function listOf(value: FieldValue | undefined): readonly FieldValue[] {
  if (Array.isArray(value)) return value;
  return value === undefined ? [] : [value];
}

/** A list of traits or actions under its heading: "***Claws.*** Melee Attack Roll: +5…". */
export function EntriesView({ block, display }: BlockViewProps<EntriesBlock>): React.JSX.Element {
  const { state, app, sourcePath } = useSheet();
  const editing = useContext(ValueEditingContext);
  const field = state.fields.get(block.field);
  const shape = field?.entry;
  // Keys and the items editors change are the note's as written; what is drawn has its references filled in
  const entries = display.state === 'value' && field ? keyedEntryItems(readField(state.record, field).value) : [];
  const drawnItems = useMemo(() => listOf(state.reader(block.field)), [state, block.field]);
  const intro = block.introField && display.state === 'value' ? valueText(state.reader(block.introField)) : '';
  const label = block.addLabel?.trim() || `Add ${singular(state.fields.get(block.field)?.label ?? '').toLowerCase() || 'entry'}`;
  const named = block.heading?.trim();
  const heading = named || state.provisional?.label;
  const hasHeading = Boolean(heading);
  const add = entries.length > 0 ? editing?.addEntry?.(block, label, hasHeading) : null;

  return (
    <div className="atlas-sb-entries">
      {hasHeading && <SheetHeading action={add} placeholder={!named}>{heading}</SheetHeading>}
      {intro.trim() && (
        <div className="atlas-sb-entries-intro">
          <ValueText shown={{ text: intro, problems: [] }} />
        </div>
      )}
      <ValueSlot block={block}>
        {display.state !== 'value' && <StandIn display={display} />}
        {entries.map(({ item, key, index }, shown) => {
          const drawn = drawnItems[index] ?? item;
          const line = (
            <EntryLine
              itemKey={key}
              itemIndex={index}
              name={entryName(drawn, shape)}
              text={entryText(drawn, shape) ?? ''}
              app={app}
              sourcePath={sourcePath}
              nameStyle={block.nameStyle ?? 'run-in'}
            >
              <EntryExtras entry={drawn} shape={shape} />
            </EntryLine>
          );
          return <React.Fragment key={key}>{editing?.entry ? editing.entry(block, { item, key, index, shown }, line) : line}</React.Fragment>;
        })}
      </ValueSlot>
      {!hasHeading && add}
    </div>
  );
}

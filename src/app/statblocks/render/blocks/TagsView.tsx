import React from 'react';
import type { TagsBlock } from '../../model/templateTypes';
import { listItems } from '../../values/listText';
import { StatblockMarkdown } from '../shared/StatblockMarkdown';
import { useSheet } from '../sheetContext';
import { LabelledLine } from '../values/LabelledLine';
import { StandIn, ValueText } from '../values/ValueText';
import { ValueSlot } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';

type ItemLook = Exclude<TagsBlock['look'], 'comma'>;

const LIST_CLASS: Readonly<Record<ItemLook, string>> = {
  chips: 'atlas-sb-chips',
  bullets: 'atlas-sb-word-list atlas-sb-word-list--bullets',
  numbered: 'atlas-sb-word-list atlas-sb-word-list--numbered',
};

/** One element per item: chips, or a bulleted or numbered list. */
function Items({ items, look }: { items: readonly string[]; look: ItemLook }): React.JSX.Element {
  const { app, sourcePath } = useSheet();
  const List = look === 'numbered' ? 'ol' : 'ul';
  return (
    <List className={LIST_CLASS[look]}>
      {items.map((item, index) => (
        <li key={`${item}-${index}`} className={look === 'chips' ? 'atlas-sb-chip' : 'atlas-sb-word'}>
          <StatblockMarkdown text={item} app={app} sourcePath={sourcePath} />
        </li>
      ))}
    </List>
  );
}

/** A list run in after its label as "Common, Elvish", or one element per item under a label the template gives. */
export function TagsView({ block, display }: BlockViewProps<TagsBlock>): React.JSX.Element {
  const { state } = useSheet();
  const label = block.label ?? state.fields.get(block.field)?.label ?? block.field;
  const items = display.state === 'value' ? listItems(state.reader(block.field)) : [];

  // Items that stand on their own name themselves; they get a label only where the template gives one.
  if (block.look !== 'comma') {
    return (
      <LabelledLine label={block.label ?? ''} look="stacked" className="atlas-sb-tags">
        <ValueSlot block={block}>{display.state === 'value' ? <Items items={items} look={block.look} /> : <StandIn display={display} />}</ValueSlot>
      </LabelledLine>
    );
  }
  return (
    <LabelledLine label={label} className="atlas-sb-tags">
      <ValueSlot block={block}>
        {display.state === 'value' ? <ValueText shown={{ text: items.join(', '), problems: [] }} /> : <StandIn display={display} />}
      </ValueSlot>
    </LabelledLine>
  );
}

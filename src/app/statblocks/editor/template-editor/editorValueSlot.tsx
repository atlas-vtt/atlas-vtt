import React from 'react';
import { TokenPortrait } from '../../../packages/components/shared/TokenPortrait';
import type { CountersBlock, EntriesBlock, ImageBlock, TemplateBlock } from '../../model/templateTypes';
import type { ShownCounters } from '../../render/blocks/CountersView';
import { CountersGrid } from '../../render/shared/CountersGrid';
import { useSheet } from '../../render/sheetContext';
import { AddEntryRow } from '../../render/shared/AddEntryRow';
import { statblockImageSrc } from '../../render/shared/statblockImage';
import type { ValueEditing } from '../../render/valueSlot';
import { valueText } from '../../values/valueText';
import { TokenSocketFace } from '../token-socket/TokenSocketFace';
import { renderTemplateTable } from './TemplateTable';
import '../token-socket/token-socket.scss';

/** The Image block as the note view draws it beside a note, without its panel: the template editor links no token. */
function ImageSocket({ block, art }: { block: ImageBlock; art: React.ReactNode }): React.JSX.Element {
  const { state, app, sourcePath } = useSheet();
  const named = valueText(state.reader(block.field));
  const src = app && named ? statblockImageSrc(app, named, sourcePath) : '';
  const shown = block.shape === 'token' && src ? <TokenPortrait className="atlas-sb-token-image" src={src} alt="" showRing /> : art;
  return <TokenSocketFace shape={block.shape} art={src ? shown : null} prompt={named ? 'Art not found' : 'Add token art'} tabIndex={-1} />;
}

function slot(block: TemplateBlock, values: React.ReactNode): React.ReactNode {
  return block.type === 'image' ? <ImageSocket block={block} art={values} /> : values;
}

function addEntry(_block: EntriesBlock, label: string, iconOnly: boolean): React.ReactNode {
  return <AddEntryRow label={label} iconOnly={iconOnly} />;
}

/** A Counters block as the note view draws it, its pips inert. */
function counters(_block: CountersBlock, shown: ShownCounters): React.ReactNode {
  return <CountersGrid {...shown} controls={{}} />;
}

/**
 * The template editor's values (§2.1): drawn as the note view draws them, so
 * the card is the same; the Image block shows the note view's token socket,
 * a list of abilities the note view's "Add ability" control, Counters their pips, inert, and a
 * Table its starting table, typed and shaped in place (`TemplateTable`). A
 * tile just placed is drawn as it will be once named.
 */
export const EDITOR_VALUE_EDITING: ValueEditing = { slot, addEntry, counters, table: renderTemplateTable, drawsUnnamed: true };

/** A tile drawn beside the card (a drag's copy, the insert menu's preview): as on the card, its table drawn and never typed. */
export const PREVIEW_VALUE_EDITING: ValueEditing = { slot, addEntry, counters, drawsUnnamed: true };

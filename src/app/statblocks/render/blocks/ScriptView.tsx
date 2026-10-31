import React, { useContext, useMemo } from 'react';
import type { ScriptBlock, TemplateBlock } from '../../model/templateTypes';
import { BlockChromeContext } from '../blockChrome';
import { scriptBlocksShown, viewedSheet } from '../blockDisplay';
import { SheetContext, useSheet } from '../sheetContext';
import { ValueEditingContext } from '../valueSlot';
import type { BlockViewProps } from './blockViewProps';
import { t } from '../../../i18n';

interface ScriptViewProps extends BlockViewProps<ScriptBlock> {
  renderBlock: (block: TemplateBlock) => React.ReactNode;
}

/**
 * A block of Fantasy Statblocks JavaScript kept from an import. Atlas never runs it: it shows the
 * values the script reads that no other part of the card shows, each in its field's own block,
 * read only. The template editor, and a statblock being edited where none holds a value, say
 * where the script is drawn instead.
 */
export function ScriptView({ block, renderBlock }: ScriptViewProps): React.JSX.Element {
  const sheet = useSheet();
  const inTemplateEditor = useContext(ValueEditingContext)?.drawsUnnamed === true;
  const viewed = useMemo(() => ({ ...sheet, state: viewedSheet(sheet.state) }), [sheet]);
  const shown = inTemplateEditor ? [] : scriptBlocksShown(block.id, sheet.state);
  if (shown.length === 0) return <div className="atlas-sb-script">{t('statblockEditor.shownByFs')}</div>;
  return (
    <SheetContext.Provider value={viewed}>
      <BlockChromeContext.Provider value={null}>
        <ValueEditingContext.Provider value={null}>
          <div className="atlas-sb-stack">{shown.map((read) => <React.Fragment key={read.id}>{renderBlock(read)}</React.Fragment>)}</div>
        </ValueEditingContext.Provider>
      </BlockChromeContext.Provider>
    </SheetContext.Provider>
  );
}

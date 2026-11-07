import React, { useId } from 'react';
import { tabLabel } from '../../model/blockCatalogue';
import type { SectionBlock, TabsBlock, TemplateBlock } from '../../model/templateTypes';
import { blockDisplay } from '../blockDisplay';
import { useSheet } from '../sheetContext';
import { TabPanelContext, useOpenTab } from '../tabs/openTabs';
import { TabPanel, TabStrip } from '../tabs/TabStrip';
import { SheetHeading } from '../values/SheetHeading';
import type { BlockViewProps } from './blockViewProps';
import { sectionHeading } from '../values/sectionHeading';

interface TabsViewProps extends BlockViewProps<TabsBlock> {
  /** Draws one tab's Section (the renderer's `BlockView`). */
  renderBlock: (block: TemplateBlock) => React.ReactNode;
}

/**
 * Sections shown one at a time, each Section's heading its tab, under the
 * block's own heading where it has one (an Abilities component split into
 * tabs keeps its name there). Only the Sections that show (in the editing
 * mode every one) get a tab; the block itself hides where none does
 * (`blockDisplay`).
 */
export function TabsView({ block, renderBlock }: TabsViewProps): React.JSX.Element {
  const { state } = useSheet();
  const idBase = useId();
  const tabs = block.blocks.filter((child): child is SectionBlock => child.type === 'section' && blockDisplay(child, state) !== null);
  const [open, choose] = useOpenTab(block.id, tabs.map((tab) => tab.id));
  const strip = tabs.map((tab) => ({
    id: tab.id,
    label: sectionHeading(tab, state).trim() || tabLabel(block.blocks.indexOf(tab) + 1),
  }));

  return (
    <div className="atlas-sb-tabs">
      {block.heading?.trim() && <SheetHeading>{block.heading}</SheetHeading>}
      <TabStrip idBase={idBase} tabs={strip} selected={open} onSelect={choose} />
      {tabs.map((tab) => (
        <TabPanel key={tab.id} idBase={idBase} tab={tab.id} open={tab.id === open}>
          <TabPanelContext.Provider value={tab.id}>{renderBlock(tab)}</TabPanelContext.Provider>
        </TabPanel>
      ))}
    </div>
  );
}

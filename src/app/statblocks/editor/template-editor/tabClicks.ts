/** A click on a tab in the template editor's canvas: which tab it is, and what stays selected once it opens. */

import { TAB_FOR_ATTRIBUTE } from '../../render/tabs/TabStrip';
import { findBlock, isWithin } from '../../model/treeQueries';
import type { TemplateLayout } from '../../model/templateTypes';
import type { BlockSelection } from './selection';

export interface ClickedTab {
  /** The Tabs block whose strip holds the tab. */
  tabsId: string;
  /** The tab's Section. */
  sectionId: string;
}

/** The tab of a Tabs block an element lies in, within the sheet; null elsewhere (a Spells block's tabs are values). */
export function tabAt(target: Element, sheet: HTMLElement): ClickedTab | null {
  const tab = target.closest?.(`[${TAB_FOR_ATTRIBUTE}]`);
  const frame = tab?.closest('[data-block-id]');
  const sectionId = tab?.getAttribute(TAB_FOR_ATTRIBUTE);
  const tabsId = frame?.getAttribute('data-block-id');
  if (!tab || !sheet.contains(tab) || frame?.getAttribute('data-block') !== 'tabs' || !sectionId || !tabsId) return null;
  return { tabsId, sectionId };
}

/** The selection once `tab` opens: as it was, or empty where it held a block of another tab of the same Tabs block. */
export function withoutClosedTab(layout: TemplateLayout, selection: BlockSelection, tab: ClickedTab): BlockSelection {
  const tabs = findBlock(layout.blocks, tab.tabsId)?.block;
  if (!tabs || tabs.type !== 'tabs') return selection;
  const hidden = selection.some((id) => id !== tab.tabsId && isWithin(layout.blocks, tab.tabsId, id) && !isWithin(layout.blocks, tab.sectionId, id));
  return hidden ? [] : selection;
}

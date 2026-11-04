// Tabs in the block tree: adding a tab, splitting a list into tabs, and which
// tabs hold a block. Pure and immutable like `treeOps`; a refusal returns the
// layout it was given.

import { canContain, tabLabel } from './blockCatalogue';
import type { BlockIdSource } from './templateIds';
import { done, parentTypeOf, refuse, spliced, withChildren, type TreeEdit } from './treeEdit';
import { collectBlockIds, findBlock } from './treeQueries';
import {
  isContainerBlock, type SectionBlock, type TabsBlock, type TemplateBlock, type TemplateLayout,
} from './templateTypes';

/** The lists a Split into tabs takes: the blocks a list of items is made of. */
export const LIST_BLOCK_TYPES = ['entries', 'tags', 'pairs', 'spells'] as const;
export type ListBlockType = (typeof LIST_BLOCK_TYPES)[number];

export function isListBlockType(type: TemplateBlock['type']): type is ListBlockType {
  return (LIST_BLOCK_TYPES as readonly string[]).includes(type);
}

/** "Tab n" for the first n past the tabs there are that no tab is headed with yet. */
function freshTabLabel(tabs: TabsBlock): string {
  const taken = new Set(tabs.blocks.map((tab) => (tab.type === 'section' ? tab.heading?.trim() : undefined)));
  let position = tabs.blocks.length + 1;
  while (taken.has(tabLabel(position))) position++;
  return tabLabel(position);
}

/** An empty tab at the end of a Tabs block; the new Section is the focus, so selecting it opens it. */
export function addTab(layout: TemplateLayout, tabsId: string, nextId: BlockIdSource): TreeEdit {
  const found = findBlock(layout.blocks, tabsId);
  if (!found) return refuse(layout, 'block-not-found');
  if (found.block.type !== 'tabs') return refuse(layout, 'wrong-type');
  const tab: SectionBlock = { id: nextId(), type: 'section', heading: freshTabLabel(found.block), blocks: [] };
  if (collectBlockIds(layout.blocks).has(tab.id)) return refuse(layout, 'duplicate-id');
  return done(withChildren(layout, tabsId, (tabs) => spliced(tabs, tabs.length, 0, tab)), tab.id);
}

/** A list without its heading, which the Tabs block takes over. */
function withoutHeading(block: TemplateBlock): TemplateBlock {
  if (!('heading' in block)) return block;
  const { heading: _heading, ...rest } = block;
  return rest;
}

/**
 * Wraps a list (Abilities, Tags, Labelled values, Spells) into a new Tabs
 * block in its place: the Tabs block takes the list's heading, so the
 * component keeps its name, the list is the first tab, "Tab 1", and an empty
 * "Tab 2" stands beside it. Refused where Tabs may not stand (in a Side by
 * side, straight in Tabs).
 */
export function splitIntoTabs(layout: TemplateLayout, listId: string, nextId: BlockIdSource): TreeEdit {
  const found = findBlock(layout.blocks, listId);
  if (!found) return refuse(layout, 'block-not-found');
  const list = found.block;
  if (!isListBlockType(list.type)) return refuse(layout, 'wrong-type');
  const parentType = parentTypeOf(layout, found.parentId);
  if (parentType === null || !canContain(parentType, 'tabs')) return refuse(layout, 'not-allowed-here');
  const heading = 'heading' in list ? list.heading?.trim() : undefined;
  const first: SectionBlock = { id: nextId(), type: 'section', heading: tabLabel(1), blocks: [withoutHeading(list)] };
  const second: SectionBlock = { id: nextId(), type: 'section', heading: tabLabel(2), blocks: [] };
  const tabs: TabsBlock = { id: nextId(), type: 'tabs', ...(heading && { heading }), blocks: [first, second] };
  const taken = collectBlockIds(layout.blocks);
  const fresh = [first.id, second.id, tabs.id];
  if (fresh.some((id) => taken.has(id)) || new Set(fresh).size !== fresh.length) return refuse(layout, 'duplicate-id');
  return done(withChildren(layout, found.parentId, (children) => spliced(children, found.index, 1, tabs)), tabs.id);
}

/** A tab a block lies in: the Tabs block and its Section that holds the block (or is it). */
export interface TabPlace {
  tabsId: string;
  sectionId: string;
}

/** The block and every container around it, outermost first; null for an unknown id. */
function ancestry(blocks: readonly TemplateBlock[], id: string): TemplateBlock[] | null {
  for (const block of blocks) {
    if (block.id === id) return [block];
    const inner = isContainerBlock(block) ? ancestry(block.blocks, id) : null;
    if (inner) return [block, ...inner];
  }
  return null;
}

/** Every tab a block lies in, outermost first; opening them all shows the block. Empty where no tab holds it. */
export function tabsHolding(blocks: readonly TemplateBlock[], id: string): TabPlace[] {
  const chain = ancestry(blocks, id) ?? [];
  return chain.flatMap((block, index) => {
    const child = chain[index + 1];
    return block.type === 'tabs' && child ? [{ tabsId: block.id, sectionId: child.id }] : [];
  });
}

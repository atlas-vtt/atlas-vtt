/**
 * An Abilities tile split into tabs (spell levels, kinds of ability): a Tabs
 * block whose every tab is a Section headed with the tab's name, holding one
 * list of abilities bound to a property of its own. The Tabs block keeps
 * the component's name as its heading. A new tab's list takes the parts of
 * the first tab's list, and the last tab but one going leaves a plain list
 * again, under the component's name. Pure.
 */

import { createBlock } from './blockCatalogue';
import { fieldByKey, fieldKeysOf, labelToKey } from './fieldKeys';
import { addField } from './fieldOps';
import { isAbilityTabs } from './templateGrid';
import { blockIdSource } from './templateIds';
import { done, spliced, withChildren, type TreeEdit } from './treeEdit';
import { updateBlock } from './treeOps';
import { addTab, splitIntoTabs } from './treeTabs';
import { collectBlockIds, findBlock } from './treeQueries';
import type { EntriesBlock, SectionBlock, StatblockTemplate, TabsBlock, TemplateField } from './templateTypes';

export type TemplateEdit = { ok: true; template: StatblockTemplate; focus: string | null } | { ok: false; template: StatblockTemplate };

const refused = (template: StatblockTemplate): TemplateEdit => ({ ok: false, template });

function withLayout(template: StatblockTemplate, edit: TreeEdit): TemplateEdit {
  return edit.ok ? { ok: true, template: { ...template, layout: edit.layout }, focus: edit.focus } : refused(template);
}

function abilityTabsOf(template: StatblockTemplate, tabsId: string): TabsBlock | null {
  const block = findBlock(template.layout.blocks, tabsId)?.block;
  return block?.type === 'tabs' && isAbilityTabs(block) ? block : null;
}

/** The list a tab holds. */
function listOf(tab: SectionBlock): EntriesBlock | null {
  const list = tab.blocks[0];
  return list?.type === 'entries' ? list : null;
}

/** A property for a new tab's list, named like the tab, with the parts of `like`. */
function tabField(template: StatblockTemplate, heading: string, like: TemplateField | undefined): TemplateField {
  const key = labelToKey(heading, fieldKeysOf(template.fields));
  return { key, label: heading, type: 'entries', ...(like?.entry && { entry: like.entry }) };
}

/** Fills the empty tab `sectionId` with a list of its own, like the list `likeKey` shows. */
function fillTab(template: StatblockTemplate, sectionId: string, likeKey: string | undefined): TemplateEdit {
  const tab = findBlock(template.layout.blocks, sectionId)?.block;
  if (tab?.type !== 'section' || tab.blocks.length > 0) return refused(template);
  const field = tabField(template, tab.heading?.trim() || 'Abilities', likeKey ? fieldByKey(template.fields, likeKey) : undefined);
  const list = createBlock('entries', blockIdSource(collectBlockIds(template.layout.blocks)), field.key);
  const layout = withChildren(template.layout, sectionId, () => [list]);
  return { ok: true, template: { ...addField(template, field), layout }, focus: sectionId };
}

/** The list `listId` becomes the first of two tabs, its heading the Tabs block's; the second gets a list of its own. */
export function splitAbilities(template: StatblockTemplate, listId: string): TemplateEdit {
  const list = findBlock(template.layout.blocks, listId)?.block;
  if (list?.type !== 'entries') return refused(template);
  const split = withLayout(template, splitIntoTabs(template.layout, listId, blockIdSource(collectBlockIds(template.layout.blocks))));
  if (!split.ok || !split.focus) return split;
  const tabs = abilityTabsOrEmpty(split.template, split.focus);
  const second = tabs?.blocks[1];
  if (!second) return refused(template);
  const filled = fillTab(split.template, second.id, list.field);
  return filled.ok ? { ...filled, focus: split.focus } : refused(template);
}

/** A Tabs block just split, whose second tab is still empty. */
function abilityTabsOrEmpty(template: StatblockTemplate, tabsId: string): TabsBlock | null {
  const block = findBlock(template.layout.blocks, tabsId)?.block;
  return block?.type === 'tabs' ? block : null;
}

/** A new tab at the end, with a list like the first tab's. */
export function addAbilityTab(template: StatblockTemplate, tabsId: string): TemplateEdit {
  const tabs = abilityTabsOf(template, tabsId);
  if (!tabs) return refused(template);
  const added = withLayout(template, addTab(template.layout, tabsId, blockIdSource(collectBlockIds(template.layout.blocks))));
  if (!added.ok || !added.focus) return refused(template);
  const first = tabs.blocks[0];
  const like = first?.type === 'section' ? listOf(first)?.field : undefined;
  return fillTab(added.template, added.focus, like);
}

/**
 * Takes a tab away. Where one tab is left, the Tabs block gives way to its
 * list, headed with the Tabs block's heading, else with that tab's name. The
 * tab's property stays in the template, so no statblock loses what it wrote
 * there.
 */
export function removeAbilityTab(template: StatblockTemplate, tabsId: string, tabId: string): TemplateEdit {
  const tabs = abilityTabsOf(template, tabsId);
  const index = tabs?.blocks.findIndex((tab) => tab.id === tabId) ?? -1;
  const found = findBlock(template.layout.blocks, tabsId);
  if (!tabs || !found || index < 0) return refused(template);
  const rest = spliced(tabs.blocks, index, 1);
  if (rest.length !== 1) return withLayout(template, done(withChildren(template.layout, tabsId, () => rest), rest[Math.max(0, index - 1)]?.id ?? null));
  const last = rest[0];
  const list = last?.type === 'section' ? listOf(last) : null;
  if (!last || last.type !== 'section' || !list) return refused(template);
  const heading = tabs.heading?.trim() || last.heading?.trim();
  const plain: EntriesBlock = heading ? { ...list, heading } : list;
  const layout = withChildren(template.layout, found.parentId, (children) => spliced(children, found.index, 1, plain));
  return { ok: true, template: { ...template, layout }, focus: plain.id };
}

/** Names a tab. */
export function renameAbilityTab(template: StatblockTemplate, tabId: string, heading: string): TemplateEdit {
  const edit = updateBlock(template.layout, tabId, 'section', { heading });
  return withLayout(template, edit);
}

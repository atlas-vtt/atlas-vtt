import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, type BookStatblock, type SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import type { TemplateBlock, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries' },
  { key: 'action_uses', label: 'Action uses', type: 'counters' },
  { key: 'bonus_actions', label: 'Bonus actions', type: 'entries' },
  { key: 'bonus_action_uses', label: 'Bonus action uses', type: 'counters' },
  { key: 'reactions', label: 'Reactions', type: 'entries' },
  { key: 'reaction_uses', label: 'Reaction uses', type: 'counters' },
];
const tab = (id: string, heading: string, list: string, uses: string): TemplateBlock => ({
  id: `tab${id}`, type: 'section', heading, blocks: [
    { id: `lst${id}`, type: 'entries', field: list },
    { id: `use${id}`, type: 'counters', field: uses, whenEmpty: 'hide' },
  ],
});
/** A character sheet's actions as a tab group named after its first tab, each tab a list and its uses. */
const ACTIONS: TemplateBlock = { id: 'actions0', type: 'tabs', heading: 'Actions', blocks: [
  tab('00001', 'Actions', 'actions', 'action_uses'),
  tab('00002', 'Bonus Actions', 'bonus_actions', 'bonus_action_uses'),
  tab('00003', 'Reactions', 'reactions', 'reaction_uses'),
] };
const USES = [{ name: 'Hunter\'s Mark', max: 2, used: 0 }];

const drawn = (note: Record<string, unknown>): BookStatblock =>
  statblockSheet({ resolved: resolvedOf(templateOf(FIELDS, [ACTIONS]), { name: 'Ana', ...note }), definitions: [], resources: undefined })!;

const outline = (nodes: readonly SheetNode[]): unknown[] => nodes.map((node) => {
  if (node.k === 'section') return ['section', node.heading, outline(node.nodes)];
  if (node.k === 'tabs') return ['tabs', node.heading, node.tabs.map((one) => [one.label, outline(one.nodes)])];
  return node.k === 'counters' ? ['counters', node.counters.map((row) => row.name)] : node.k;
});

describe('a tab group on the player\'s sheet once its lists went to the Abilities tab', () => {
  it('is a section under its last tab\'s heading where one tab is left, never under the group\'s heading', () => {
    const statblock = drawn({ bonus_action_uses: USES });
    expect(parseBookStatblock(statblock)).toEqual(statblock);
    expect(outline(statblock.blocks)).toEqual([['section', 'Bonus Actions', [['counters', ['Hunter\'s Mark']]]]]);
  });

  it('keeps its heading and tabs where more than one is left', () => {
    const statblock = drawn({ bonus_action_uses: USES, reaction_uses: [{ name: 'Shield', max: 1, used: 0 }] });
    expect(outline(statblock.blocks)).toEqual([['tabs', 'Actions', [
      ['Bonus Actions', [['counters', ['Hunter\'s Mark']]]],
      ['Reactions', [['counters', ['Shield']]]],
    ]]]);
  });
});

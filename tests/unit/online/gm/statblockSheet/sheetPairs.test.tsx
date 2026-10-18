import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import type { SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import { allBuiltInTemplates } from '../../../../../src/app/statblocks/library/builtInTemplates';
import { sampleRecord } from '../../../../../src/app/statblocks/model/sampleValues';
import { renderSheet, valueOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const FIVE_E_2024 = allBuiltInTemplates().find((each) => each.template.id === 'builtin:5e-2024-monster')!.template;
const SKILLS = 'b5skill0';

function sheetOf(fields: Record<string, unknown>): SheetNode[] {
  return statblockSheet({ resolved: resolvedOf(FIVE_E_2024, fields), definitions: [], resources: undefined })!.blocks;
}

const skills = (nodes: readonly SheetNode[]): Extract<SheetNode, { k: 'value' }> | undefined =>
  nodes.find((node): node is Extract<SheetNode, { k: 'value' }> => node.k === 'value' && node.value.label === 'Skills');

describe('a pairs value and a table on a player\'s sheet', () => {
  for (const [shape, value] of [
    ['a record', { dexterity: 2, wisdom: -1 }],
    ['one-key records', [{ dexterity: 2 }, { wisdom: -1 }]],
    ['entries with a description', [{ name: 'dexterity', desc: 2 }, { name: 'wisdom', desc: -1 }]],
  ] as const) {
    it(`write skills held as ${shape} as the card writes them, signed and with their names`, () => {
      const fields = { ...sampleRecord(FIVE_E_2024), skillsaves: value };
      const { container, unmount } = renderSheet(FIVE_E_2024, fields);
      const card = valueOf(container, SKILLS);
      unmount();
      const node = skills(sheetOf(fields));
      expect(card).toBe('Dexterity +2, Wisdom -1');
      expect(node?.value.text.opening).toBe(card);
      expect(node?.value.pairs).toEqual([{ label: 'Dexterity', value: '+2', roll: '+2' }, { label: 'Wisdom', value: '-1', roll: '-1' }]);
    });
  }

  it('write a table\'s cells and worked-out rows as the card writes them', () => {
    const fields = sampleRecord(FIVE_E_2024);
    const { container, unmount } = renderSheet(FIVE_E_2024, fields);
    const card = [...container.querySelectorAll('.atlas-sb-score-column')].map((cell) => cell.textContent?.trim());
    unmount();
    const table = sheetOf(fields).find((node): node is Extract<SheetNode, { k: 'table' }> => node.k === 'table');
    // The card sets the columns in groups side by side, so only the texts are compared, not their order.
    expect(card.length).toBeGreaterThan(0);
    expect((table?.worked.flat() ?? []).sort()).toEqual(card.sort());
    expect(table?.rows.flat()).toEqual(['14', '12', '13', '10', '11', '8']);
  });
});

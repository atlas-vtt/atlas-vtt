import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import type { BookStatblock, SheetNode, SheetValue } from '../../../../../src/app/online/protocol/index.ts';
import { allBuiltInTemplates } from '../../../../../src/app/statblocks/library/builtInTemplates';
import { sampleRecord } from '../../../../../src/app/statblocks/model/sampleValues';
import type { TemplateBlock, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

function values(nodes: readonly SheetNode[]): SheetValue[] {
  return nodes.flatMap((node): SheetValue[] => {
    switch (node.k) {
      case 'section': case 'row': return values(node.nodes);
      case 'tabs': return node.tabs.flatMap((tab) => values(tab.nodes));
      case 'value': return [node.value];
      case 'metric': return node.values;
      default: return [];
    }
  });
}

const valueLabelled = (statblock: BookStatblock, label: string): SheetValue | undefined => values(statblock.blocks).find((value) => value.label === label);

describe('a value a player\'s sheet works out', () => {
  it('is read only on the 5E (2024) template: the XP worked out from CR, the initiative written with its passive score', () => {
    const builtIn = allBuiltInTemplates().find((each) => each.template.id === 'builtin:5e-2024-monster')!;
    const statblock = statblockSheet({ resolved: resolvedOf(builtIn.template, sampleRecord(builtIn.template)), definitions: [], resources: undefined })!;
    expect(valueLabelled(statblock, 'XP')).toMatchObject({ text: { opening: '200; PB +2' }, field: null });
    expect(valueLabelled(statblock, 'Initiative')).toMatchObject({ text: { opening: '+2 (12)' }, field: null });
    expect(valueLabelled(statblock, 'Skills')?.field).toMatchObject({ key: 'skillsaves' });
  });

  it('stays the player\'s where a fallback shows in its place, the fallback its prompt, and a value shown as it is too', () => {
    const fields: TemplateField[] = [
      { key: 'name', label: 'Name', type: 'text' },
      { key: 'dex', label: 'Dex', type: 'number' },
      { key: 'speed', label: 'Speed', type: 'text' },
      { key: 'init', label: 'Initiative', type: 'number' },
      { key: 'alignment', label: 'Alignment', type: 'text' },
      { key: 'athletics', label: 'Athletics', type: 'choice', options: ['◇', '◆'] },
    ];
    const blocks: TemplateBlock[] = [
      { id: 'init0001', type: 'stat', field: 'init', look: 'run-in', whenEmpty: 'fallback', fallback: '{dex|signed}' },
      { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in', pattern: '{speed}' },
      { id: 'dex00001', type: 'stat', field: 'dex', look: 'run-in', pattern: 'Dex {dex}' },
      { id: 'line0001', type: 'line', fields: ['alignment'] },
      { id: 'athl0001', type: 'stat', field: 'athletics', look: 'run-in', whenEmpty: 'fallback', fallback: '◇' },
    ];
    const statblock = statblockSheet({ resolved: resolvedOf(templateOf(fields, blocks), { name: 'Ana', dex: 2, speed: '30 ft.', alignment: 'Neutral' }), definitions: [], resources: undefined })!;
    expect(valueLabelled(statblock, 'Initiative')).toMatchObject({ text: { opening: '+2' }, prompt: '+2', field: { key: 'init', value: null } });
    // A choice the note holds no value of yet is picked over its fallback
    expect(valueLabelled(statblock, 'Athletics')).toMatchObject({ text: { opening: '◇' }, prompt: '◇', field: { key: 'athletics', options: ['◇', '◆'], value: null } });
    expect(valueLabelled(statblock, 'Speed')?.field).toMatchObject({ key: 'speed' });
    expect(valueLabelled(statblock, 'Dex')).toMatchObject({ text: { opening: 'Dex 2' }, field: null });
    expect(values(statblock.blocks).find((value) => value.text.opening === 'Neutral')?.field).toMatchObject({ key: 'alignment' });
  });
});

// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, type AbilityComponent } from '../../../../../src/app/online/protocol/index.ts';
import { allBuiltInTemplates } from '../../../../../src/app/statblocks/library/builtInTemplates';
import { sampleRecord } from '../../../../../src/app/statblocks/model/sampleValues';
import { resolvedOf } from './sheetKit';

const FIVE_E_2024 = allBuiltInTemplates().find((each) => each.template.id === 'builtin:5e-2024-monster')!.template;

function spellsOf(spells: unknown): AbilityComponent | undefined {
  const statblock = statblockSheet({ resolved: resolvedOf(FIVE_E_2024, { ...sampleRecord(FIVE_E_2024), spells }), definitions: [], resources: undefined })!;
  expect(parseBookStatblock(statblock)).toEqual(statblock);
  return statblock.abilities.find((component) => component.spells);
}

const shape = (component: AbilityComponent | undefined): unknown => component?.tabs.map((tab) => ({ label: tab.label, intro: tab.intro?.opening, names: tab.entries.map((entry) => entry.name) }));

describe('a spell list on a player\'s sheet', () => {
  it('opens each group with its header line above its first level, never as an ability without a name', () => {
    expect(shape(spellsOf(sampleRecord(FIVE_E_2024).spells))).toEqual([
      { label: 'At will', intro: 'The creature casts spells using Wisdom (save DC 12).', names: ['light', 'mage hand'] },
      { label: '1/day each', intro: undefined, names: ['cure wounds', 'sleep'] },
    ]);
  });

  it('keeps a group\'s header line where no level follows it, and gives every group its own', () => {
    expect(shape(spellsOf(['Innate spellcasting:', 'Ritual casting:', { '1st level': 'alarm' }]))).toEqual([
      { label: null, intro: 'Innate spellcasting:', names: [] },
      { label: '1st level', intro: 'Ritual casting:', names: ['alarm'] },
    ]);
  });
});

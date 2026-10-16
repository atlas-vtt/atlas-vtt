// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { statblockSheet } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, type BookStatblock, type SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'agility', label: 'Agility', type: 'number' },
  { key: 'strength', label: 'Strength', type: 'number' },
  { key: 'finesse', label: 'Finesse', type: 'number' },
  { key: 'secret', label: 'Secret', type: 'number' },
  { key: 'evasion', label: 'Evasion', type: 'number' },
  { key: 'damage', label: 'Damage', type: 'text' },
  { key: 'attack', label: 'Attack', type: 'text' },
  { key: 'experiences', label: 'Experiences', type: 'pairs' },
  { key: 'gear', label: 'Gear', type: 'scores', slots: ['Item', 'Damage'] },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
];

const metric = (rollable: boolean): TemplateBlock => ({
  id: 'traits01', type: 'metric', heading: 'Traits', fields: ['agility', 'strength', 'finesse', 'secret'], ...(rollable && { rollable: true }),
});

const BLOCKS: TemplateBlock[] = [
  { id: 'evasion1', type: 'stat', field: 'evasion', look: 'stacked' },
  { id: 'damage01', type: 'stat', field: 'damage', look: 'run-in' },
  { id: 'attack01', type: 'stat', field: 'attack', look: 'run-in' },
  { id: 'experie1', type: 'pairs', field: 'experiences', rollable: true },
  { id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' },
  { id: 'stats001', type: 'scores', field: 'stats', orientation: 'row', rollable: true, columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }] },
];

const VALUES = {
  name: 'Ana', agility: 2, strength: -1, finesse: 0, secret: 3, evasion: 10, damage: '1d8+3', attack: 'ATK +4',
  experiences: { Tracker: 2, Liar: '+1', Quiet: 'very' },
  gear: [['Sword', '2d6+3'], ['Rope', '50 ft.']],
  stats: [18, 9],
};

function sheet(blocks: TemplateBlock[]): BookStatblock {
  const template: StatblockTemplate = { ...templateOf(FIELDS, blocks), players: { secret: 'hidden' } };
  return statblockSheet({ resolved: resolvedOf(template, VALUES), definitions: [], resources: undefined })!;
}

function flat(nodes: readonly SheetNode[]): SheetNode[] {
  return nodes.flatMap((node) => (node.k === 'section' || node.k === 'row' ? flat(node.nodes) : [node]));
}

const nodeOf = <K extends SheetNode['k']>(statblock: BookStatblock, k: K, index = 0): Extract<SheetNode, { k: K }> =>
  flat(statblock.blocks).filter((node): node is Extract<SheetNode, { k: K }> => node.k === k)[index]!;

describe('the rolls a player\'s sheet names', () => {
  it('roll each number of a rollable Metric as a bonus, and no number hidden from players', () => {
    const drawn = sheet([metric(true)]);
    expect(nodeOf(drawn, 'metric').values.map((value) => [value.label, value.roll])).toEqual([['Agility', '+2'], ['Strength', '-1'], ['Finesse', '+0']]);
    expect(JSON.stringify(drawn)).not.toContain('+3');
    expect(parseBookStatblock(drawn)).toEqual(drawn);
  });

  it('roll a plain number of a Metric that is not rollable only where its text links a bonus itself', () => {
    expect(nodeOf(sheet([metric(false)]), 'metric').values.map((value) => value.roll)).toEqual([undefined, '-1', undefined]);
  });

  it('roll a Value whose whole text is one roll, as the card links it, and none of a plain number', () => {
    const drawn = sheet(BLOCKS);
    const [evasion, damage, attack] = [0, 1, 2].map((index) => nodeOf(drawn, 'value', index).value);
    expect(evasion).not.toHaveProperty('roll');
    expect(damage).toMatchObject({ text: { opening: '1d8+3' }, roll: '1d8+3' });
    expect(attack).toMatchObject({ text: { opening: 'ATK +4' }, roll: '+4' });
    expect(parseBookStatblock(drawn)).toEqual(drawn);
  });

  it('roll each pair of a rollable pairs value on its own', () => {
    const pairs = nodeOf(sheet(BLOCKS), 'value', 3).value;
    expect(pairs.look).toBe('pairs');
    expect(pairs).not.toHaveProperty('roll');
    expect(pairs.pairs).toEqual([{ label: 'Tracker', value: '2', roll: '+2' }, { label: 'Liar', value: '+1', roll: '+1' }, { label: 'Quiet', value: 'very' }]);
  });

  it('shape a table\'s rolls as its cells, and send none for a table where no cell rolls', () => {
    const drawn = sheet(BLOCKS);
    const gear = nodeOf(drawn, 'table', 0);
    expect(gear.rolls).toEqual([[null, '2d6+3'], [null, null]]);
    expect(gear).not.toHaveProperty('workedRolls');
    const stats = nodeOf(drawn, 'table', 1);
    expect(stats.rows).toEqual([['18', '9']]);
    expect(stats.rolls).toEqual([['+18', '+9']]);
    expect(stats.worked).toEqual([['4', '-1']]);
    expect(stats.workedRolls).toEqual([['+4', '-1']]);

    const plain = sheet([{ id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' }]);
    const rope = { ...VALUES, gear: [['Rope', '50 ft.']] };
    const none = statblockSheet({ resolved: resolvedOf(templateOf(FIELDS, [{ id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' }]), rope), definitions: [], resources: undefined })!;
    expect(nodeOf(none, 'table')).not.toHaveProperty('rolls');
    expect(parseBookStatblock(drawn)).toEqual(drawn);
    expect(parseBookStatblock(plain)).toEqual(plain);
  });
});

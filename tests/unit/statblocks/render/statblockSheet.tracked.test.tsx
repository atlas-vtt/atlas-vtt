// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'level', label: 'Level', type: 'number' },
  { key: 'luck', label: 'Luck', type: 'number', tracks: { counts: 'down' } },
  { key: 'hit_dice', label: 'Hit Dice', type: 'number', tracks: { counts: 'down', max: 'level' } },
  { key: 'temp', label: 'Temp HP', type: 'number', tracks: { counts: 'down' } },
  { key: 'stress', label: 'Stress', type: 'number' },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'metric01', type: 'metric', fields: ['luck', 'hit_dice'] },
  { id: 'stattemp', type: 'stat', field: 'temp', look: 'run-in' },
  { id: 'track001', type: 'track', field: 'stress', look: 'boxes', counts: 'up' },
];
const TEMPLATE = templateOf(FIELDS, BLOCKS);
const VALUES = { name: 'Mira', level: 4, luck: 3, temp: 5, stress: 6 };

const tracked = (container: HTMLElement, id: string): string[] =>
  [...blockEl(container, id)!.querySelectorAll('.atlas-sb-tracked')].map((element) => element.textContent ?? '');

describe('StatblockSheet: tracked numbers', () => {
  it('show where they start without a token, a maximum another field holds included', () => {
    const { container } = renderSheet(TEMPLATE, VALUES);
    expect(tracked(container, 'metric01')).toEqual(['3 / 3', '4 / 4']);
    expect(tracked(container, 'stattemp')).toEqual(['5 / 5']);
    expect(blockEl(container, 'track001')!.querySelectorAll('.is-marked')).toHaveLength(0);
  });

  it('show the token\'s current value over the note\'s maximum', () => {
    const token = { id: 't1', name: 'Mira', resources: { luck: { current: 1, max: 9 }, hit_dice: { current: 2, max: 4 }, stress: { current: 2, max: 6 } } };
    const { container } = renderSheet(TEMPLATE, VALUES, { token });
    expect(tracked(container, 'metric01')).toEqual(['1 / 3', '4 / 4']);
    expect(blockEl(container, 'track001')!.querySelectorAll('.is-marked')).toHaveLength(2);
  });

  it('leave a number a resource of the token\'s collection reads to that resource', () => {
    const definitions = [{ key: 'fortune', name: 'Fortune', field: 'Luck', direction: 'drains' as const, color: '#000000', visibleToPlayers: true }];
    const token = { id: 't1', name: 'Mira', resources: { luck: { current: 1, max: 3 } }, definitions };
    const { container } = renderSheet(TEMPLATE, VALUES, { token });
    expect(tracked(container, 'metric01')).toEqual(['4 / 4']);
  });

  it('show a tracked number whose maximum another field holds though its own field is empty', () => {
    const { container } = renderSheet(templateOf(FIELDS, [{ id: 'metric02', type: 'metric', fields: ['hit_dice'] }]), { name: 'Mira', level: 2 });
    expect(tracked(container, 'metric02')).toEqual(['2 / 2']);
  });
});

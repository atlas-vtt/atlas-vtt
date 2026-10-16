import { act, cleanup } from '@testing-library/react';
import { MarkdownRenderer } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockEl, fakeApp, renderSheet, templateOf } from './sheetTestKit';

vi.mock('../../../../src/app/atlas-view', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));
vi.mock('../../../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

const FIELDS: TemplateField[] = [
  { key: 'agility', label: 'Agility', type: 'number' },
  { key: 'strength', label: 'Strength', type: 'number' },
  { key: 'finesse', label: 'Finesse', type: 'number' },
  { key: 'evasion', label: 'Evasion', type: 'number' },
  { key: 'experiences', label: 'Experiences', type: 'pairs' },
  { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex'] },
];

const metric = (rollable: boolean): TemplateBlock => ({
  id: 'traits01', type: 'metric', heading: 'Traits', fields: ['agility', 'strength', 'finesse'], ...(rollable && { rollable: true }),
});

const BLOCKS: TemplateBlock[] = [
  { id: 'evasion1', type: 'stat', field: 'evasion', look: 'stacked', rollable: true },
  { id: 'experie1', type: 'pairs', field: 'experiences', rollable: true },
  { id: 'stats001', type: 'scores', field: 'stats', orientation: 'row', rollable: true, columns: [{ label: 'Mod', formula: 'floor((value - 10) / 2)' }] },
];

const VALUES = { agility: 2, strength: -1, finesse: 0, evasion: 10, experiences: { Tracker: 2, Liar: '+1' }, stats: [18, 9] };

beforeEach(() => {
  vi.spyOn(MarkdownRenderer, 'render').mockImplementation((_app, markdown, el) => {
    el.insertAdjacentHTML('beforeend', `<p>${markdown}</p>`);
    return Promise.resolve();
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function links(el: Element): string[] {
  return [...el.querySelectorAll<HTMLElement>('.atlas-dice-link')].map((link) => link.dataset.formula ?? '');
}

describe('a block that rolls as a bonus', () => {
  it.each([['plain', undefined], ['Markdown', fakeApp()]])('makes every number of a Metric a roll of that bonus (%s)', (_, app) => {
    const rollable = blockEl(renderSheet(templateOf(FIELDS, [metric(true)]), VALUES, { app }).container, 'traits01')!;
    expect(links(rollable)).toEqual(['+2', '-1', '+0']);
    expect(rollable.querySelector('.atlas-sb-metric__value')?.textContent).toBe('2');
  });

  it('leaves a Metric that does not alone', () => {
    const plain = blockEl(renderSheet(templateOf(FIELDS, [metric(false)]), VALUES, { app: fakeApp() }).container, 'traits01')!;
    // A negative number is a bonus in any text; a plain one rolls nothing.
    expect(links(plain)).toEqual(['-1']);
    expect(plain.querySelector('[data-roll-name]')).toBeNull();
  });

  it('rolls a click on a Metric\'s number as that bonus, named after the number', () => {
    const rolls: { formula: string; source: unknown }[] = [];
    const block = blockEl(renderSheet(templateOf(FIELDS, [metric(true)]), VALUES, { app: fakeApp(rolls) }).container, 'traits01')!;
    act(() => { block.querySelector<HTMLElement>('.atlas-dice-link')?.click(); });
    expect(rolls).toEqual([{ formula: '+2', source: expect.objectContaining({ abilityName: 'Agility' }) }]);
  });

  it('rolls a Value\'s number, each pair\'s value and every number of a Table and its worked-out row', () => {
    const { container } = renderSheet(templateOf(FIELDS, BLOCKS), VALUES, { app: fakeApp() });
    expect(links(blockEl(container, 'evasion1')!)).toEqual(['+10']);
    const pairs = blockEl(container, 'experie1')!;
    expect(links(pairs)).toEqual(['+2', '+1']);
    expect(pairs.textContent).toContain('Tracker 2, Liar +1');
    expect(links(blockEl(container, 'stats001')!)).toEqual(['+18', '+9', '+4', '-1']);
  });
});

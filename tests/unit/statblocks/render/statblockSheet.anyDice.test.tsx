// @vitest-environment jsdom
import { cleanup } from '@testing-library/react';
import { MarkdownRenderer } from 'obsidian';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { statblockSheet } from '../../../../src/app/online/gm/book/statblockSheet';
import type { BookStatblock } from '../../../../src/app/online/protocol/index.ts';
import type { StatblockTemplate, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { resolvedOf } from '../../online/gm/statblockSheet/sheetKit';
import { blockEl, fakeApp, renderSheet, templateOf } from './sheetTestKit';

vi.mock('../../../../src/app/atlasViewType', () => ({ ATLAS_VIEW_TYPE: 'atlas-vtt' }));

// Kestrel's sheet as the maintainer wrote it: Experiences whose values are bonuses, some through the traits' labels
const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'agility', label: 'Agi', type: 'number' },
  { key: 'strength', label: 'Str', type: 'number' },
  { key: 'experiences', label: 'Experiences', type: 'pairs' },
  { key: 'attack', label: 'Attack', type: 'text' },
  { key: 'background', label: 'Background', type: 'markdown' },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, [
  { id: 'traits01', type: 'metric', fields: ['agility', 'strength'] },
  { id: 'experie1', type: 'pairs', field: 'experiences' },
  { id: 'attack01', type: 'stat', field: 'attack' },
  { id: 'back0001', type: 'text', field: 'background' },
]);
const NOTE = {
  name: 'Kestrel Vane', agility: 1, strength: 2,
  experiences: { 'Never backs down': '+2', 'Test Experience 2': '+3', 'Test Experience 3': '+4+@agi', 'Test Experience 4': '+4+@str', Feint: '2d8 + @agility' },
  attack: '2 + 1d6',
  background: 'Swings for +4 + 1 - 2, then (1d8+2)*2 when she is 3 years older.',
};

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

const links = (el: Element): string[] => [...el.querySelectorAll<HTMLElement>('.atlas-dice-link')].map((link) => link.dataset.formula ?? '');

describe('StatblockSheet: any roll a value or text holds', () => {
  it.each([['plain', undefined], ['Markdown', fakeApp()]])('links a bonus written as a sum, its references filled in (%s)', (_, app) => {
    const { container } = renderSheet(TEMPLATE, NOTE, { app });
    const experiences = blockEl(container, 'experie1')!;
    expect(experiences.textContent).toContain('Test Experience 3 +4+1');
    expect(links(experiences)).toEqual(['+2', '+3', '+4+1', '+4+2', '2d8+1']);
    expect(links(blockEl(container, 'attack01')!)).toEqual(['2+1d6']);
  });

  it('links every roll of a Markdown text and no number of its sentences', () => {
    const { container } = renderSheet(TEMPLATE, NOTE, { app: fakeApp() });
    expect(links(blockEl(container, 'back0001')!)).toEqual(['+4+1-2', '1d8+2']);
  });
});

/** Every pair a sheet's blocks hold, as the page reads them. */
function sheetPairs(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(sheetPairs);
  if (typeof value !== 'object' || value === null) return [];
  const own = 'pairs' in value && Array.isArray(value.pairs) ? value.pairs : [];
  return [...own, ...Object.values(value).flatMap(sheetPairs)];
}

describe('a player\'s sheet: what each value rolls', () => {
  it('gives every Experience its roll, the sums through references included and their references named', () => {
    const sheet = statblockSheet({ resolved: resolvedOf(TEMPLATE, NOTE), definitions: [], resources: undefined }) as BookStatblock;
    expect(sheetPairs(sheet.blocks)).toEqual([
      { label: 'Never backs down', value: '+2', roll: '+2' },
      { label: 'Test Experience 2', value: '+3', roll: '+3' },
      { label: 'Test Experience 3', value: '+4+1', roll: '+4+1[Agi]' },
      { label: 'Test Experience 4', value: '+4+2', roll: '+4+2[Str]' },
      { label: 'Feint', value: '2d8 + 1', roll: '2d8+1[Agility]' },
    ]);
  });
});

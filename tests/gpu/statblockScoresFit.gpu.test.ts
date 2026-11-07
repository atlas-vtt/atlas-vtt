import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';
import { findBlock } from '../../src/app/statblocks/model/treeQueries';
import { FIVE_E_2024_MONSTER } from '../../src/app/statblocks/presets/fiveE2024';

// Dice links reach the map view, whose services need Node's `events`; nothing here rolls dice.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const THEME = `body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-ui-smaller: 12px; --font-ui-small: 13px; }`;
const SLOTS = ['Accuracy', 'Communication', 'Constitution', 'Dexterity', 'Fighting', 'Intelligence', 'Perception', 'Strength', 'Willpower'];
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'nine-slots-abc123',
  fields: [{ key: 'stats', label: 'Abilities', type: 'scores', slots: SLOTS }],
  layout: { maxColumns: 1, blocks: [{ id: 'scores00', type: 'scores', field: 'stats', orientation: 'row' }] },
};

/**
 * A table with many long column names in a narrow card (a Fantasy Statblocks
 * layout's preview in the gallery): it wraps into bands one under another, as
 * Fantasy Statblocks wraps its tables, and never runs past the card or
 * scrolls. Every name stays in its own cell, every column shows once and in
 * order, and a card that grows takes the table back into one band.
 */
describe('a table with long column names in a narrow card', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  function renderAt(width: number): HTMLElement {
    const { container } = render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width } },
      React.createElement(StatblockSheet, { template: TEMPLATE, name: 'Nine slots', fields: { stats: SLOTS.map(() => 10) }, variant: 'feed' })));
    return container.firstElementChild as HTMLElement;
  }

  it('wraps into bands within the card, each name in its cell', () => {
    renderAt(240);
    const tables = [...document.querySelectorAll<HTMLElement>('table.atlas-sb-sheet-table__grid')];
    expect(tables.length, 'the table wraps').toBeGreaterThan(1);
    const block = document.querySelector('[data-block-id="scores00"]')!.getBoundingClientRect();
    for (const table of tables) expect(table.getBoundingClientRect().width).toBeLessThanOrEqual(block.width + 0.5);
    const names = [...document.querySelectorAll<HTMLElement>('thead th')];
    expect(names.map((name) => name.textContent)).toEqual(SLOTS);
    for (const name of names) {
      const cell = name.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(name);
      const text = range.getBoundingClientRect();
      expect(text.left, `${name.textContent} starts in its cell`).toBeGreaterThanOrEqual(cell.left - 0.5);
      expect(text.right, `${name.textContent} ends in its cell`).toBeLessThanOrEqual(cell.right + 0.5);
    }
    const room = document.querySelector<HTMLElement>('.atlas-sb-sheet-table__room')!;
    expect(room.scrollWidth, 'nothing to scroll').toBeLessThanOrEqual(room.clientWidth);
  });

  it('keeps a table of short names in one band in the same card', () => {
    const short: StatblockTemplate = { ...TEMPLATE, fields: [{ key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex', 'Con', 'Int', 'Wis', 'Cha'] }] };
    render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 367 } },
      React.createElement(StatblockSheet, { template: short, name: 'Six slots', fields: { stats: [10, 12, 14, 8, 13, 9] }, variant: 'feed' })));
    expect(document.querySelectorAll('table.atlas-sb-sheet-table__grid')).toHaveLength(1);
  });

  it('stands in one band where the card has room, and goes back to one when it grows', async () => {
    const card = renderAt(240);
    expect(document.querySelectorAll('table.atlas-sb-sheet-table__grid').length).toBeGreaterThan(1);
    card.style.width = '1000px';
    await vi.waitFor(() => expect(document.querySelectorAll('table.atlas-sb-sheet-table__grid')).toHaveLength(1));
    expect([...document.querySelectorAll('thead th')].map((name) => name.textContent)).toEqual(SLOTS);
  });
});

/**
 * The 5E (2024 rules) ability table in one column of the statblock pane's
 * two-column card (about 380 px): its three groups stay side by side rather
 * than wrapping two and one, which left Con and Cha alone on a line.
 */
describe('the 5E 2024 ability table in a pane column', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1000, 700);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('keeps its three groups on one line', () => {
    const scores = findBlock(FIVE_E_2024_MONSTER.template.layout.blocks, 'b5stats0')?.block;
    expect(scores?.type).toBe('scores');
    const template: StatblockTemplate = { ...FIVE_E_2024_MONSTER.template, layout: { maxColumns: 1, blocks: scores ? [scores] : [] } };
    render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380 + 32 } },
      React.createElement(StatblockSheet, { template, name: '5E (2024 rules)', fields: { stats: [16, 14, 15, 7, 12, 8] }, variant: 'feed' })));
    const groups = [...document.querySelectorAll<HTMLElement>('.atlas-sb-score-group')];
    expect(groups).toHaveLength(3);
    const tops = new Set(groups.map((group) => Math.round(group.getBoundingClientRect().top)));
    expect(tops.size, 'all three groups start on the same line').toBe(1);
  });
});

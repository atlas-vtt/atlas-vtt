import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import type { App } from 'obsidian';
import css from '../../styles/main.scss?inline';
import type { StatblockTemplate, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { TEMPLATE_FORMAT } from '../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { THEME, frames } from './sidePanesHarness';

const rolls = vi.hoisted((): string[] => []);
// The roll's way to a map reaches the map view, whose Node `events` has no browser build; the links and clicks stay real.
vi.mock('../../src/app/services/statblockRolls', () => ({
  rollStatblockDice: (_app: unknown, formula: string) => { rolls.push(formula); return null; },
  statblockRollingDice: () => null,
}));
vi.mock('../../src/app/services/statblockHitPoints', () => ({ rollHitPoints: () => undefined }));

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'gear', label: 'Gear', type: 'scores', slots: ['Item', 'Damage', 'Bonus'] },
  { key: 'attack', label: 'Attack', type: 'text' },
];
const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'dice-links-k7m2qa',
  fields: FIELDS,
  layout: {
    maxColumns: 1,
    blocks: [
      { id: 'attack01', type: 'stat', field: 'attack', look: 'run-in' },
      { id: 'gear0001', type: 'scores', field: 'gear', orientation: 'row' },
    ],
  },
};
const VALUES = {
  name: 'Marsh Warden',
  attack: 'Bite (+5), Hit: 9 (2d6 + 2) piercing',
  gear: [['Sword', '2d6+3', '+5'], ['Dagger', '(1d8)', '(+2)'], ['Rope', '—', '0']],
};
/** Enough of an app for Markdown and rolls: the renderer is the test double, the rolls are recorded above. */
const APP = { workspace: { getLeavesOfType: () => [] } } as unknown as App;
const h = React.createElement;

async function drawn(): Promise<HTMLElement> {
  const host = document.body.createDiv({ cls: 'atlas-vtt-plugin' });
  host.style.width = '480px';
  render(h(StatblockSheet, { template: TEMPLATE, name: 'Dice links', fields: VALUES, variant: 'full', app: APP, sourcePath: 'Warden.md' }), { container: host });
  await act(async () => { await frames(2); });
  return host.querySelector<HTMLElement>('.atlas-statblock')!;
}

function linksIn(el: Element): HTMLElement[] {
  return [...el.querySelectorAll<HTMLElement>('.atlas-dice-link')];
}

/** The look of a roll link: the accent colour, underlined. */
function expectLinkLook(link: HTMLElement): void {
  const style = getComputedStyle(link);
  expect(style.color).toBe('rgb(166, 138, 249)');
  expect(style.textDecorationLine).toBe('underline');
  expect(style.cursor).toBe('pointer');
}

/**
 * Dice in a Table's cells and in brackets, with the real stylesheet: each
 * linked in the accent colour with its underline, the brackets left outside
 * the link, a cell with a link as tall as one without, and a click rolls the
 * cell's formula.
 */
describe('dice links in a statblock', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;
  beforeEach(async () => {
    rolls.length = 0;
    await page.viewport(800, 600);
    document.head.append(style);
  });
  afterEach(() => {
    cleanup();
    style.remove();
    document.body.replaceChildren();
  });

  it('look like links in a table cell, inside the cell, the row as tall as a row without dice', async () => {
    const card = await drawn();
    const table = card.querySelector<HTMLElement>('[data-block-id="gear0001"]')!;
    const rows = [...table.querySelectorAll<HTMLElement>('tbody tr')];
    expect(linksIn(table).map((link) => link.dataset.formula)).toEqual(['2d6+3', '+5', '1d8', '+2']);
    for (const link of linksIn(table)) {
      expectLinkLook(link);
      const cell = link.closest('td')!.getBoundingClientRect();
      const box = link.getBoundingClientRect();
      expect(box.top).toBeGreaterThanOrEqual(cell.top);
      expect(box.bottom).toBeLessThanOrEqual(cell.bottom);
    }
    const [linked, , plain] = rows.map((row) => row.getBoundingClientRect().height);
    expect(Math.abs(linked! - plain!)).toBeLessThanOrEqual(0.5);
    await page.screenshot({ element: card, path: '__screenshots__/dice-links/table-and-brackets.png' });
  });

  it('leave the brackets outside the link', async () => {
    const card = await drawn();
    const attack = card.querySelector<HTMLElement>('[data-block-id="attack01"]')!;
    expect(linksIn(attack).map((link) => link.textContent)).toEqual(['+5', '2d6 + 2']);
    for (const link of linksIn(attack)) {
      expectLinkLook(link);
      expect(link.previousSibling?.textContent?.endsWith('(')).toBe(true);
      expect(link.nextSibling?.textContent?.startsWith(')')).toBe(true);
    }
    const dagger = linksIn(card).find((link) => link.dataset.formula === '1d8')!;
    expect(dagger.parentElement?.textContent).toBe('(1d8)');
  });

  it('roll the formula clicked, a bare bonus as it is written', async () => {
    const card = await drawn();
    for (const link of linksIn(card.querySelector('[data-block-id="gear0001"]')!)) link.click();
    expect(rolls).toEqual(['2d6+3', '+5', '1d8', '+2']);
  });
});

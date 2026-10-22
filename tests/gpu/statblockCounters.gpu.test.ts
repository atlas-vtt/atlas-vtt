import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { CountersGrid } from '../../src/app/statblocks/render/shared/CountersGrid';
import { ValueEditingContext, type ValueEditing } from '../../src/app/statblocks/render/valueSlot';
import { TEMPLATE_FORMAT, type StatblockTemplate } from '../../src/app/statblocks/model/templateTypes';

// Dice links reach the map view, whose services need Node's `events`; nothing here rolls dice.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const THEME = `body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --font-ui-smaller: 12px;
  --font-ui-small: 13px; --font-ui-large: 20px; --font-semibold: 600; --font-bold: 700; --line-height-tight: 1.2; --radius-s: 4px;
  --radius-m: 8px; --text-accent: rgb(120, 80, 200); --background-modifier-border: rgb(120, 120, 120); }`;

const TEMPLATE: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'counters-abc123',
  fields: [{ key: 'slots', label: 'Spell slots', type: 'counters' }],
  layout: { maxColumns: 1, blocks: [{ id: 'slots001', type: 'counters', field: 'slots' }] },
};

const SLOTS = [
  { name: '1st level', max: 4, used: 1, reset: 'long' },
  { name: '2nd level', max: 3, used: 0, reset: 'long' },
  { name: '3rd level', max: 3, used: 0, reset: 'long' },
  { name: '4th level', max: 3, used: 0, reset: 'long' },
  { name: '5th level', max: 1, used: 0, reset: 'long' },
  { name: 'Arcane Recovery', max: 1, used: 0, reset: 'short' },
];

/** The pane's controls, which press nothing here: the buttons are drawn as the pane draws them. */
const LIVE: ValueEditing = {
  slot: (_block, values) => values,
  counters: (_block, shown) => React.createElement(CountersGrid, { ...shown, controls: { use: () => undefined } }),
};

const cells = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.atlas-sb-counter')];
const pipRects = (cell: HTMLElement): DOMRect[] => [...cell.querySelectorAll<HTMLElement>('.atlas-sb-counter__pip')].map((pip) => pip.getBoundingClientRect());

function mount(editing: ValueEditing | null): void {
  const sheet = React.createElement(StatblockSheet, { template: TEMPLATE, name: 'Counters', fields: { slots: SLOTS }, variant: 'feed' });
  const card = editing ? React.createElement(ValueEditingContext.Provider, { value: editing }, sheet) : sheet;
  render(React.createElement('div', { className: 'atlas-vtt-plugin', style: { width: 380, padding: 16 } }, card));
}

/** A Counters block: small cells wrapping three or four to a line, each its name over a row of diamond pips. */
describe('Counters in the real stylesheet', () => {
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

  it('wraps its cells three or four to a line, evenly spaced, each its name over its pips', () => {
    mount(null);
    const rects = cells().map((cell) => cell.getBoundingClientRect());
    const firstLine = rects.filter((rect) => Math.abs(rect.top - rects[0]!.top) < 1);
    expect(firstLine.length).toBeGreaterThanOrEqual(3);
    expect(firstLine.length).toBeLessThanOrEqual(4);
    expect(rects[1]!.left - rects[0]!.right).toBeCloseTo(8, 0);
    for (const cell of cells()) {
      const name = cell.querySelector('.atlas-sb-counter__name')!.getBoundingClientRect();
      const pips = pipRects(cell);
      expect(pips[0]!.top, 'the pips stand under the name').toBeGreaterThanOrEqual(name.bottom - 1);
      // A diamond: a 9 px square turned a quarter is about 12.7 px across.
      expect(pips[0]!.width).toBeCloseTo(9 * Math.SQRT2, 0);
    }
  });

  it('stands its pressable pips where a read-only card draws them', () => {
    mount(null);
    const drawn = cells().map(pipRects);
    cleanup();
    mount(LIVE);
    const pressable = cells().map(pipRects);
    pressable.forEach((rects, cell) => rects.forEach((rect, pip) => {
      expect(rect.left, `cell ${cell} pip ${pip}`).toBeCloseTo(drawn[cell]![pip]!.left, 0);
    }));
  });
});

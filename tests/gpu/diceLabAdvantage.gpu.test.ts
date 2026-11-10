import '../setup/obsidianDom';
import React, { useEffect, useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DiceLabDialog } from '../../src/app/react/components/collection-settings/dice-lab/DiceLabDialog';
import { DiceSetService } from '../../src/app/services/diceSets/DiceSetService';
import { memoryPresets } from '../mocks/memoryPresets';

/** The dice lab with a set whose advantage and disadvantage roll dice of their own, styled by the real stylesheet. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3;
    --text-faint: #777; --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px;
    --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --corner-shape: squircle; }
  button, input { corner-shape: var(--corner-shape); }
  button { height: 30px; }
`;
const h = React.createElement;
const settle = (ms = 700): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SETS = [
  {
    id: 'duality', name: 'Duality', crit: 'doubles',
    dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#1d4ed8' }],
    advantage: { kind: 'die', sides: 6, colour: '#4d7c0f' }, disadvantage: { kind: 'die', sides: 6, colour: '#b91c1c' },
  },
  {
    id: 'horde', name: 'Horde', crit: 'natural', dice: [{ count: 9, sides: 6 }, { count: 5, sides: 8 }, { count: 4, sides: 20 }],
    advantage: { kind: 'die', sides: 8 }, disadvantage: { kind: 'number', value: 2 },
  },
];

function Lab(): React.ReactElement {
  const [service] = useState(() => new DiceSetService(memoryPresets(SETS)));
  const [sets, setSets] = useState(() => service.list());
  useEffect(() => service.onChange(() => setSets(service.list())), [service]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', ref: setAnchor },
    anchor && h(DiceLabDialog, { anchor, diceSets: { service, sets }, initialId: 'duality', onClose: () => undefined })));
}

const box = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();
const boxes = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
const overlap = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const inside = (inner: DOMRect, outer: DOMRect): boolean =>
  inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

describe('the dice advantage rolls, in the dice lab', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1100, 820);
    document.head.append(style);
    render(h(Lab));
    await settle(1200);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('lie in a row of their own under the set\'s dice, marked, on the tray and apart from every other die', async () => {
    for (const set of ['Duality', 'Horde']) {
      await userEvent.click(page.getByRole('button', { name: new RegExp(`^${set}`) }));
      await settle(1500);
      const field = box('.atlas-dice-lab__field');
      const setDice = boxes('.atlas-dice-lab__cell:not(.atlas-dice-lab__cell--edge)');
      const edgeDice = boxes('.atlas-dice-lab__cell--edge');
      expect(edgeDice).toHaveLength(set === 'Duality' ? 2 : 1);
      const cells = [...setDice, ...edgeDice];
      for (const [i, cell] of cells.entries()) {
        expect(inside(cell, field), `${set}: cell ${i} on the tray`).toBe(true);
        for (const other of cells.slice(i + 1)) expect(overlap(cell, other), `${set}: cells ${i} apart`).toBe(false);
      }
      const lowest = Math.max(...setDice.map((cell) => cell.bottom));
      for (const edge of edgeDice) expect(edge.top).toBeGreaterThan(lowest);
      for (const mark of boxes('.atlas-dice-lab__edge-mark')) expect(inside(mark, field)).toBe(true);
    }
  });

  it('fans the buttons of the advantage die out without a copy, inside the lab and clear of the die and its mark', async () => {
    const die = page.getByRole('button', { name: /^Advantage die/ });
    await userEvent.click(die);
    await settle();
    const dieBox = (await die.element()).getBoundingClientRect();
    const centre = { x: dieBox.left + dieBox.width / 2, y: dieBox.top + dieBox.height / 2 };
    const mark = box('.atlas-dice-lab__cell--advantage .atlas-dice-lab__edge-mark');
    const buttons = boxes('.atlas-csm-fan:not(.atlas-leaving) .atlas-csm-fan__button');
    expect(buttons).toHaveLength(4);
    for (const button of buttons) {
      expect(inside(button, box('.atlas-dice-lab__field'))).toBe(true);
      expect(inside(button, box('.atlas-dice-lab-dialog'))).toBe(true);
      // The die is round, its ring as well: a button stays outside both
      const reach = Math.hypot(button.left + button.width / 2 - centre.x, button.top + button.height / 2 - centre.y) - button.width / 2;
      expect(reach).toBeGreaterThan(dieBox.width / 2 + 4);
      expect(overlap(button, mark)).toBe(false);
    }
  });

  it('lays the options out as rows that never overlap, inside the sidebar', async () => {
    const options = box('.atlas-dice-lab__options');
    const rows = boxes('.atlas-dice-lab__options .atlas-dice-lab__option');
    expect(rows.length).toBeGreaterThanOrEqual(4);
    for (const [i, row] of rows.entries()) {
      expect(row.left).toBeGreaterThanOrEqual(options.left - 0.5);
      expect(row.right).toBeLessThanOrEqual(options.right + 0.5);
      for (const other of rows.slice(i + 1)) expect(overlap(row, other)).toBe(false);
    }
    for (const select of boxes('.atlas-dice-lab__select--wide')) expect(select.right).toBeLessThanOrEqual(options.right + 0.5);
  });
});

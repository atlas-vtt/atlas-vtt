import '../setup/obsidianDom';
import React, { useState } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { BUILT_IN_DICE_SETS } from '../../src/app/gameSystems/builtInDiceSets';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DiceTab } from '../../src/app/react/components/collection-settings/DiceTab';
import { SidesStep } from '../../src/app/react/components/collection-settings/dice-lab/SidesStep';
import type { DiceSet } from '../../src/app/types/diceSetTypes';

/**
 * The dice set picker and the Sides step with the real stylesheet, their dice
 * drawn by the dice renderer: every row and tile holds its dice, before its text.
 */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada; --text-muted: #b3b3b3;
    --text-faint: #777; --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px;
    --font-ui-small: 13px; --font-ui-medium: 15px; --font-ui-large: 20px; --input-height: 30px; --corner-shape: squircle; }
  button, input { corner-shape: var(--corner-shape); }
`;
const h = React.createElement;
const settle = (ms = 700): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const SETS: DiceSet[] = [
  ...BUILT_IN_DICE_SETS,
  {
    id: 'duality', name: 'Duality', builtIn: false, crit: 'doubles',
    dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#7e22ce' }],
    advantage: { kind: 'die', sides: 6 },
  },
  { id: 'horde', name: 'Horde', builtIn: false, crit: 'natural', dice: [{ count: 9, sides: 6 }, { count: 5, sides: 8, colour: '#4d7c0f' }, { count: 1, sides: 100 }] },
];

function Tab(): React.ReactElement {
  const [current, setCurrent] = useState<DiceSet>(SETS.at(-2)!);
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { width: 480 } },
    h(DiceTab, { diceSet: current, diceSets: { service: null, sets: SETS }, onPick: setCurrent })));
}

const rect = (element: Element): DOMRect => element.getBoundingClientRect();
const inside = (inner: DOMRect, outer: DOMRect): boolean =>
  inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;
const overlap = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;

describe('the dice set picker', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(900, 720);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('lays each set out as a row of its own, its dice drawn inside it before its name', async () => {
    render(h(Tab));
    await settle(2000);
    const options = [...document.querySelectorAll('[role="option"]')];
    expect(options).toHaveLength(SETS.length);
    for (const [i, option] of options.entries()) {
      const row = rect(option);
      for (const other of options.slice(i + 1)) expect(overlap(row, rect(other))).toBe(false);
      const text = rect(option.querySelector('.atlas-dice-picker__text')!);
      const dice = [...option.querySelectorAll('.atlas-die-still')];
      expect(dice.length).toBeGreaterThan(0);
      for (const die of dice) {
        expect(inside(rect(die), row), `a die of row ${i} inside it`).toBe(true);
        expect(rect(die).right).toBeLessThanOrEqual(text.left + 0.5);
      }
      // Drawn by the dice renderer, not the flat stand-in
      expect(option.querySelectorAll('img.atlas-die-still__image').length).toBe(dice.length);
    }
  });

  it('draws the Sides step\'s dice inside their tiles, the d100\'s two d10s over two columns', async () => {
    render(h('div', { className: 'atlas-vtt-plugin' }, h('div', { className: 'atlas-dice-lab__step-panel', style: { position: 'static' } },
      h('div', { className: 'atlas-dice-lab__step' }, h(SidesStep, { die: { id: 'a', sides: 12, name: '', colour: '#ca8a04' }, onChange: () => undefined, onDone: () => undefined })))));
    await settle(2000);
    const tiles = [...document.querySelectorAll('.atlas-dice-lab__side')];
    expect(tiles).toHaveLength(7);
    for (const [i, tile] of tiles.entries()) {
      const box = rect(tile);
      for (const other of tiles.slice(i + 1)) expect(overlap(box, rect(other))).toBe(false);
      const die = rect(tile.querySelector('.atlas-die-still')!);
      expect(inside(die, box)).toBe(true);
      expect(die.bottom).toBeLessThanOrEqual(rect(tile.querySelector('.atlas-dice-lab__side-name')!).top + 0.5);
      expect(tile.querySelector('img.atlas-die-still__image')).not.toBeNull();
    }
    const d100 = rect(tiles.at(-1)!);
    expect(d100.width).toBeGreaterThan(rect(tiles[0]!).width * 1.9);
  });
});

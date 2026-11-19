import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { page } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { DicePresetsPanel } from '../../src/app/react/components/dice/DicePresetsPanel';
import { DiceTray } from '../../src/app/react/components/dice/DiceTray';
import { readDiceShelf, STANDARD_ROW } from '../../src/app/react/components/dice/diceShelf';
import { centreOf, mouse } from './realMouse';

/** The saved rolls beside the tray, with the real stylesheet: beside it, foot on its foot, and a longer row in one line. */
const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --background-modifier-form-field: #2a2a2a;
    --text-normal: #dadada; --text-muted: #b3b3b3; --text-faint: #777; --text-accent: #a68af9; --text-error: #fb464c; --interactive-accent: #7f6df2;
    --radius-s: 4px; --radius-m: 8px; --radius-l: 12px; --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px;
    --font-ui-large: 20px; --input-height: 30px; --mono-100: #fff;
    --shadow-l: 0px 1.8px 7.3px rgba(0, 0, 0, 0.071), 0px 6.3px 24.7px rgba(0, 0, 0, 0.112), 0px 30px 90px rgba(0, 0, 0, 0.2); }
`;
const h = React.createElement;
const settle = (ms = 400): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const shelf = readDiceShelf({
  dicePresets: [
    { id: 'a', name: 'Duality', formula: '2d12' },
    { id: 'b', name: 'Longsword', formula: '1d8+3[slashing]' },
    { id: 'c', name: 'Stat line', formula: '4d6kh3' },
    { id: 'd', name: 'Smite', formula: '3d8kh1+3' },
  ],
  diceRow: [...STANDARD_ROW.slice(0, 5), { kind: 'preset', id: 'a' }, { kind: 'die', sides: 3 }, { kind: 'preset', id: 'b' }, { kind: 'preset', id: 'd' }],
});

function Scene(): React.ReactElement {
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: 760 } },
    h('div', { className: 'atlas-dice-tray', style: { left: '70%', bottom: 20, top: 'auto' } },
      h(DicePresetsPanel, { shelf, onChange: () => undefined, trayFormula: '2d12 + 3', problemOf: () => null, onRoll: () => undefined }),
      h('div', { className: 'atlas-dice-panel' },
        h(DiceTray, {
          memory: { formula: '2d12 + 3', side: 'normal' }, onRemember: () => undefined, check: () => null, onRoll: () => true, history: [],
          onRepeat: () => true, historyOpen: false, onHistoryOpen: () => undefined, onClose: () => undefined,
          shelf, presetsPanel: { open: true, onToggle: () => undefined },
        })))));
}

const rect = (selector: string): DOMRect => document.querySelector(selector)!.getBoundingClientRect();

describe('the saved rolls beside the dice tray', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1280, 800);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('stands left of the tray, top and foot on the tray\'s, and the row holds eight places to a line', async () => {
    render(h(Scene));
    await settle();
    const panel = rect('.atlas-dice-presets');
    const tray = rect('.atlas-dice-tray > .atlas-dice-panel:not(.atlas-dice-presets)');
    expect(panel.right).toBeLessThanOrEqual(tray.left);
    expect(Math.abs(panel.bottom - tray.bottom)).toBeLessThan(1);
    const faces = [...document.querySelectorAll('.atlas-dice-tray__face')].map((face) => face.getBoundingClientRect());
    expect(faces).toHaveLength(9);
    const lines = [...new Set(faces.map((face) => Math.round(face.top)))];
    expect(lines).toHaveLength(2);
    expect(faces.filter((face) => Math.round(face.top) === lines[0])).toHaveLength(8);
    expect(Math.abs(faces[8]!.left - faces[0]!.left)).toBeLessThan(1);
    expect(faces[7]!.right).toBeLessThanOrEqual(tray.right);

    // Every control of a card is concentric with the card's corner, on all four corners alike.
    const card = document.querySelector<HTMLElement>('.atlas-dice-presets__item')!;
    const px = (value: string): number => Number.parseFloat(value);
    const cardStyle = getComputedStyle(card);
    const inset = px(cardStyle.paddingTop) + px(cardStyle.borderTopWidth);
    for (const control of card.querySelectorAll<HTMLElement>('button')) {
      const corners = getComputedStyle(control);
      for (const corner of [corners.borderTopLeftRadius, corners.borderTopRightRadius, corners.borderBottomLeftRadius, corners.borderBottomRightRadius]) {
        expect(Math.abs(px(corner) + inset - px(cardStyle.borderTopLeftRadius))).toBeLessThan(0.6);
      }
    }
    // A card's ⋯ is drawn only under the pointer, and opens its menu.
    const more = (of: Element): string => getComputedStyle(of.querySelector('.atlas-dice-presets__more')!).display;
    const cards = [...document.querySelectorAll('.atlas-dice-presets__item')];
    expect(cards.map(more).every((display) => display === 'none')).toBe(true);
    const hovered = centreOf(card.querySelector('.atlas-dice-presets__roll')!);
    await mouse.hover(hovered.x, hovered.y);
    await settle();
    expect(cards.map(more)).toEqual(['flex', ...cards.slice(1).map(() => 'none')]);
    // The whole card lights up, its ⋯ included, not only the part that rolls.
    const fill = (of: Element): string => getComputedStyle(of).backgroundColor;
    expect(fill(card)).not.toBe(fill(cards[1]!));
    expect(getComputedStyle(card.querySelector('.atlas-dice-presets__roll')!).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    const button = centreOf(card.querySelector('.atlas-dice-presets__more')!);
    await mouse.click(button.x, button.y);
    await settle();
    expect(document.querySelectorAll('.atlas-ctx-menu [role="menuitem"]')).toHaveLength(3);
    await mouse.click(5, 5);
    await settle();
    // The room around the list for the shadows takes no pointer: the map beside it gets the press.
    const list = document.querySelector('.atlas-dice-presets__list')!.getBoundingClientRect();
    const beside = document.elementFromPoint(list.left + 20, list.top + 40);
    expect(beside?.closest('.atlas-dice-presets__list')).toBeNull();
  });
});

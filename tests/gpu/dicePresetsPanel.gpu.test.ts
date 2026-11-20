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
    --font-ui-large: 20px; --input-height: 30px; --mono-100: #fff; --mono-rgb-100: 255, 255, 255;
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
    { id: 'e', name: 'Fire bolt', formula: '+2', look: { crit: 'natural', dice: [{ count: 1, sides: 12, colour: '#c0392b' }, { count: 1, sides: 20, colour: '#2e86c1' }] } },
  ],
  diceRow: [...STANDARD_ROW.slice(0, 5), { kind: 'preset', id: 'a' }, { kind: 'die', sides: 3 }, { kind: 'preset', id: 'b' }, { kind: 'preset', id: 'd' }],
});

function Scene({ saved = shelf }: { readonly saved?: typeof shelf }): React.ReactElement {
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', style: { position: 'relative', height: 760 } },
    h('div', { className: 'atlas-dice-tray', style: { left: '70%', bottom: 20, top: 'auto' } },
      h(DicePresetsPanel, { shelf: saved, onChange: () => undefined, trayFormula: '2d12 + 3', problemOf: () => null, onRoll: () => undefined }),
      h('div', { className: 'atlas-dice-panel' },
        h(DiceTray, {
          memory: { formula: '2d12 + 3', side: 'normal' }, onRemember: () => undefined, check: () => null, onRoll: () => true, history: [],
          onRepeat: () => true, historyOpen: false, onHistoryOpen: () => undefined, onClose: () => undefined,
          shelf: saved, presetsPanel: { open: true, onToggle: () => undefined },
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
    // The ⋯ is a control of its own: under the pointer it alone lights up, the card rests.
    const moreCentre = centreOf(card.querySelector('.atlas-dice-presets__more')!);
    await mouse.hover(moreCentre.x, moreCentre.y);
    await settle(300);
    expect(fill(card)).toBe(fill(cards[1]!));
    expect(fill(card.querySelector('.atlas-dice-presets__more')!)).not.toBe('rgba(0, 0, 0, 0)');
    await mouse.hover(hovered.x, hovered.y);
    await settle(300);
    // The ⋯ is a square as tall as the part that rolls: its fill is the card's control, not a sliver of it.
    const moreBox = card.querySelector('.atlas-dice-presets__more')!.getBoundingClientRect();
    const rollBox = card.querySelector('.atlas-dice-presets__roll')!.getBoundingClientRect();
    expect(moreBox.height).toBeGreaterThanOrEqual(44);
    expect(Math.abs(moreBox.height - rollBox.height)).toBeLessThan(0.5);
    expect(Math.abs(moreBox.width - moreBox.height)).toBeLessThan(0.5);
    const button = centreOf(card.querySelector('.atlas-dice-presets__more')!);
    await mouse.click(button.x, button.y);
    await settle();
    const items = [...document.querySelectorAll('.atlas-ctx-menu [role="menuitem"]')];
    expect(items).toHaveLength(3);
    // Each choice keeps its icon: a pencil, a pin, a bin.
    expect(items.every((item) => item.querySelector('.atlas-ctx-item__leading .atlas-ctx-icon') !== null)).toBe(true);
    await mouse.click(5, 5);
    await settle();
    // The room around the list for the shadows takes no pointer: the map beside it gets the press.
    const list = document.querySelector('.atlas-dice-presets__list')!.getBoundingClientRect();
    const beside = document.elementFromPoint(list.left + 20, list.top + 40);
    expect(beside?.closest('.atlas-dice-presets__list')).toBeNull();
  });

  it('shows each saved roll\'s dice before its text, inside the card, and they stay put when the ⋯ shows', async () => {
    render(h(Scene));
    // The dice are drawn by the map's dice renderer; give it time.
    await expect.poll(() => document.querySelectorAll('.atlas-dice-presets__dice img').length, { timeout: 15_000 }).toBeGreaterThanOrEqual(6);
    await settle();
    const cards = [...document.querySelectorAll<HTMLElement>('.atlas-dice-presets__item')];
    for (const card of cards) {
      const dice = card.querySelector('.atlas-dice-presets__dice')!;
      expect(dice.closest('.atlas-dice-presets__roll')).not.toBeNull();
      const box = card.getBoundingClientRect();
      const strip = dice.getBoundingClientRect();
      expect(strip.left).toBeGreaterThanOrEqual(box.left);
      expect(strip.top).toBeGreaterThanOrEqual(box.top);
      expect(strip.bottom).toBeLessThanOrEqual(box.bottom);
      for (const text of card.querySelectorAll('.atlas-dice-presets__name, .atlas-dice-presets__formula')) {
        expect(text.getBoundingClientRect().left).toBeGreaterThanOrEqual(strip.right);
      }
    }
    // The ⋯ comes in at the card's end under the pointer; the dice keep their place.
    const first = cards[0]!;
    const before = first.querySelector('.atlas-dice-presets__dice')!.getBoundingClientRect().left;
    const point = centreOf(first.querySelector('.atlas-dice-presets__name')!);
    await mouse.hover(point.x, point.y);
    await settle(300);
    expect(getComputedStyle(first.querySelector('.atlas-dice-presets__more')!).display).toBe('flex');
    expect(first.querySelector('.atlas-dice-presets__dice')!.getBoundingClientRect().left).toBeCloseTo(before, 1);
    // One per kind: the designed roll's two coloured dice, the longsword's d8.
    expect(cards[4]!.querySelectorAll('.atlas-die-still')).toHaveLength(2);
    expect(cards[1]!.querySelectorAll('.atlas-die-still')).toHaveLength(1);
    await page.screenshot({ path: '__screenshots__/dice/saved-roll-dice.png', element: document.querySelector<HTMLElement>('.atlas-dice-presets')! });
  });

  it('presses a saved roll\'s whole card where its roll is pressed, and only the ⋯ where the ⋯ is', async () => {
    render(h(Scene));
    await settle();
    const card = document.querySelector<HTMLElement>('.atlas-dice-presets__item')!;
    const roll = card.querySelector<HTMLElement>('.atlas-dice-presets__roll')!;
    const tint = (element: Element): string => getComputedStyle(element).backgroundImage;

    const name = centreOf(card.querySelector('.atlas-dice-presets__name')!);
    await mouse.hover(name.x, name.y);
    await mouse.down(name.x, name.y);
    expect(tint(card)).toContain('gradient');
    expect(tint(roll)).toBe('none');
    await mouse.up(name.x, name.y);
    expect(tint(card)).toBe('none');

    await mouse.hover(name.x, name.y);
    await settle(200);
    const more = card.querySelector<HTMLElement>('.atlas-dice-presets__more')!;
    const dots = centreOf(more);
    await mouse.hover(dots.x, dots.y);
    await mouse.down(dots.x, dots.y);
    expect(tint(more)).toContain('gradient');
    expect(tint(card)).toBe('none');
    await mouse.up(dots.x, dots.y);
  });

  it('scrolls the last saved roll clear of the fade at the list\'s foot', async () => {
    const many = readDiceShelf({ dicePresets: Array.from({ length: 14 }, (_, i) => ({ id: `p${i}`, name: `Roll ${i}`, formula: `${i + 1}d6` })) });
    render(h(Scene, { saved: many }));
    await settle();
    const list = document.querySelector<HTMLElement>('.atlas-dice-presets__list')!;
    expect(list.scrollHeight).toBeGreaterThan(list.clientHeight);
    list.scrollTop = list.scrollHeight;
    await settle(100);
    // Where the mask starts to fade: the larger of its `calc(100% - Npx)` stops.
    const stops = [...getComputedStyle(list).maskImage.matchAll(/calc\(100% - ([\d.]+)px\)/g)].map((match) => Number(match[1]));
    const fadeStarts = list.getBoundingClientRect().bottom - Math.max(...stops);
    const cards = list.querySelectorAll('.atlas-dice-presets__item');
    expect(cards[cards.length - 1]!.getBoundingClientRect().bottom).toBeLessThanOrEqual(fadeStarts + 0.5);
  });
});

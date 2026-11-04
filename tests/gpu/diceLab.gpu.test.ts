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

/**
 * The dice lab as it opens over the collection settings, styled by the plugin's real
 * stylesheet, its dice drawn by the dice renderer.
 */
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
  { id: 'duality', name: 'Duality', crit: 'doubles', dice: [{ count: 1, sides: 12, name: 'Hope', colour: '#ca8a04' }, { count: 1, sides: 12, name: 'Fear', colour: '#1d4ed8' }] },
  { id: 'horde', name: 'Horde', crit: 'natural', dice: [{ count: 9, sides: 6 }, { count: 5, sides: 8, colour: '#4d7c0f' }, { count: 4, sides: 20, colour: '#b91c1c' }, { count: 1, sides: 100 }] },
];

function Lab(): React.ReactElement {
  const [service] = useState(() => new DiceSetService(memoryPresets(SETS)));
  const [sets, setSets] = useState(() => service.list());
  useEffect(() => service.onChange(() => setSets(service.list())), [service]);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  return h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin', ref: setAnchor },
    anchor && h(DiceLabDialog, { anchor, diceSets: { service, sets }, initialId: 'duality', onClose: () => undefined })));
}

const boxes = (selector: string): DOMRect[] => [...document.querySelectorAll(selector)].map((element) => element.getBoundingClientRect());
const overlap = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
const inside = (inner: DOMRect, outer: DOMRect): boolean =>
  inner.left >= outer.left - 0.5 && inner.right <= outer.right + 0.5 && inner.top >= outer.top - 0.5 && inner.bottom <= outer.bottom + 0.5;

/** The mean colour of the bright pixels of an image: the die's faces, not its shadow. */
async function meanColour(image: HTMLImageElement): Promise<[number, number, number]> {
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(image, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const sum = [0, 0, 0];
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 200 || data[i]! + data[i + 1]! + data[i + 2]! < 120) continue;
    sum[0] += data[i]!;
    sum[1] += data[i + 1]!;
    sum[2] += data[i + 2]!;
    count++;
  }
  expect(count, 'pixels of the die').toBeGreaterThan(300);
  return [sum[0]! / count, sum[1]! / count, sum[2]! / count];
}

describe('the dice lab', () => {
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

  it('draws each die in its colour', async () => {
    const [hope, fear] = [...document.querySelectorAll<HTMLImageElement>('.atlas-dice-lab__die-image')];
    const [hr, , hb] = await meanColour(hope!);
    const [fr, fg, fb] = await meanColour(fear!);
    // Gold, then blue
    expect(hr).toBeGreaterThan(hb + 30);
    expect(fb).toBeGreaterThan(fr + 30);
    expect(fb).toBeGreaterThan(fg);
  });

  it('lays twenty dice out on the tray without overlap', async () => {
    await userEvent.click(page.getByRole('button', { name: /^Horde/ }));
    await settle(1500);
    const field = document.querySelector('.atlas-dice-lab__field')!.getBoundingClientRect();
    const cells = boxes('.atlas-dice-lab__die, .atlas-dice-lab__add');
    expect(cells).toHaveLength(20);
    for (const [i, cell] of cells.entries()) {
      expect(inside(cell, field), `die ${i} on the tray`).toBe(true);
      for (const other of cells.slice(i + 1)) expect(overlap(cell, other)).toBe(false);
    }
  });

  it('fans the buttons of a die out on a circle around it (a d100\'s on an ellipse), inside the lab, for a die at any place', async () => {
    await userEvent.click(page.getByRole('button', { name: /^Horde/ }));
    await settle(1500);
    const dialog = document.querySelector('.atlas-dice-lab-dialog')!.getBoundingClientRect();
    const field = document.querySelector('.atlas-dice-lab__field')!.getBoundingClientRect();
    const dice = [...document.querySelectorAll<HTMLElement>('button.atlas-dice-lab__die')];
    for (const die of [dice[0]!, dice[6]!, dice.at(-1)!]) {
      await userEvent.click(die);
      await settle();
      const box = die.getBoundingClientRect();
      const centre = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
      const buttons = boxes('.atlas-csm-fan:not(.atlas-leaving) .atlas-csm-fan__button');
      expect(buttons).toHaveLength(5);
      // A circle for a die; the two d10s of a d100 lie side by side, and their fan is an ellipse
      // as far from their box's sides as from its top (29 px: the gap and half a button)
      const reach = (side: number): number => Math.max(72, side / 2 + 29);
      const stretch = reach(box.width) / reach(box.height);
      const distances = buttons.map((button) => Math.hypot((button.left + button.width / 2 - centre.x) / stretch, button.top + button.height / 2 - centre.y));
      for (const distance of distances) expect(Math.abs(distance - distances[0]!)).toBeLessThan(1);
      expect(distances[0]!).toBeGreaterThan(box.height / 2 + 17);
      for (const button of buttons) {
        expect(inside(button, field)).toBe(true);
        expect(inside(button, dialog)).toBe(true);
        // Above the die: its picture stays free
        expect(overlap(button, box)).toBe(false);
      }
      await userEvent.click(die);
      await settle(300);
    }
  });

  it('opens a die\'s steps whole, in the stage, clear of the die and its fan, and the die stays where it is', async () => {
    for (const [width, height, set] of [[1100, 820, /^Duality/], [1100, 560, /^Duality/], [1100, 560, /^Horde/], [700, 820, /^Duality/]] as const) {
      await page.viewport(width, height);
      await userEvent.click(page.getByRole('button', { name: set }));
      await settle(1200);
      const field = document.querySelector<HTMLElement>('.atlas-dice-lab__field')!;
      const die = document.querySelector<HTMLElement>('button.atlas-dice-lab__die')!;
      await userEvent.click(die);
      await settle();
      const before = die.getBoundingClientRect();
      const scrollHeight = field.scrollHeight;
      for (const step of [0, 1, 2]) {
        // Clicked in place: a pointer click would first scroll the button into view, and the die with it
        document.querySelectorAll<HTMLElement>('.atlas-csm-fan:not(.atlas-leaving) .atlas-csm-fan__button')[step]!.click();
        await settle();
        const panel = document.querySelector<HTMLElement>('.atlas-dice-lab__step-panel')!;
        const box = panel.getBoundingClientRect();
        const where = `${width} × ${height}, ${String(set)}, step ${step}`;
        expect(inside(box, document.querySelector('.atlas-dice-lab__stage')!.getBoundingClientRect()), where).toBe(true);
        expect(inside(box, document.querySelector('.atlas-dice-lab-dialog')!.getBoundingClientRect()), where).toBe(true);
        // A narrow lab scrolls as a whole and leaves little of the stage in view: there the panel scrolls
        if (width > 720) expect(panel.scrollHeight, `${where}: the whole panel shown`).toBe(panel.clientHeight);
        else expect(inside(box, document.querySelector('.atlas-dice-lab')!.getBoundingClientRect()), where).toBe(true);
        expect(overlap(box, die.getBoundingClientRect()), where).toBe(false);
        for (const button of boxes('.atlas-csm-fan:not(.atlas-leaving) .atlas-csm-fan__button')) expect(overlap(box, button), where).toBe(false);
        const after = die.getBoundingClientRect();
        expect([after.left, after.top], `${where}: the die stays`).toEqual([before.left, before.top]);
        expect(field.scrollHeight, `${where}: the tray does not grow`).toBe(scrollHeight);
        // Back to the fan, which a panel opened over the die hides
        await userEvent.keyboard('{Escape}');
        await settle(300);
      }
      await userEvent.keyboard('{Escape}');
      await settle(300);
    }
  });
});

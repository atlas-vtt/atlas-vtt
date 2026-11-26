import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../src/app/react/components/context-menu/atlas-context-menu.scss?inline';
import coarseCss from '../../styles/_coarse-pointer.scss?inline';
import { closeContextMenuGlobal, ContextMenuProvider, openContextMenuGlobal, type ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { centreOf, mouse } from './realMouse';

const style = document.createElement('style');
const h = React.createElement;
style.textContent = css + coarseCss + `
  * { box-sizing: border-box; }
  body { margin: 0; overflow: hidden; font: 13px/1.5 sans-serif; --size-2-1: 2px;
    --background-primary: #202020; --background-secondary: #262626; --text-normal: #ddd;
    --text-muted: #aaa; --background-modifier-border: #444; --background-modifier-hover: #383838; }
  .workspace-leaf { position: fixed; contain: strict; overflow: hidden; }
  .test-token { position: absolute; width: 30px; height: 30px; }
`;

const frames = async (): Promise<void> => {
  for (let frame = 0; frame < 3; frame++) await new Promise(requestAnimationFrame);
};
const items = (count: number): ContextMenuEntry[] => Array.from({ length: count }, (_, index) => ({ type: 'item', label: `Action ${index + 1}`, onClick: () => undefined }));
const menus = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.atlas-ctx-menu')];
const shape = (element: HTMLElement): number[] => {
  const { left, top, width, height } = element.getBoundingClientRect();
  return [left, top, width, height];
};

beforeEach(async () => {
  await page.viewport(800, 600);
  document.head.append(style);
});
afterEach(() => { cleanup(); style.remove(); document.body.removeAttribute('data-atlas-pointer'); });

/** A token's global right-click menu in an Obsidian leaf smaller than the window. */
async function open(entries: ContextMenuEntry[], height: number, y: number, leaf = true, width = 460): Promise<HTMLElement> {
  const host = render(h('div', { className: leaf ? 'workspace-leaf' : undefined, style: { position: 'fixed', left: 40, top: 80, width, height } },
    h(ContextMenuProvider, null,
      h('button', { className: 'test-token', style: { left: Math.min(210, width - 40), top: y - 95 }, onContextMenu: (event: React.MouseEvent) => {
        event.preventDefault();
        openContextMenuGlobal(entries, { x: event.clientX, y: event.clientY });
      } }, 'Token'))));
  const point = centreOf(host.getByRole('button'));
  await act(async () => { await mouse.rightClick(point.x, point.y); });
  await expect.poll(() => menus().length).toBe(1);
  await frames();
  return menus()[0]!;
}

function inside(menu: HTMLElement, height: number): void {
  const box = menu.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(87.5);
  expect(box.bottom).toBeLessThanOrEqual(80 + height - 7.5);
  expect(box.left).toBeGreaterThanOrEqual(47.5);
  expect(box.right).toBeLessThanOrEqual(492.5);
}

it('opens fully inside the map pane before hovering and stays still during rapid hover', async () => {
  const menu = await open(items(7), 260, 320);
  inside(menu, 260);
  const initial = shape(menu);
  const box = menu.getBoundingClientRect();
  for (let pass = 0; pass < 3; pass++) {
    for (const fraction of [0.1, 0.8, 0.3, 0.65, 0.2]) {
      await mouse.hover(box.left + 40, box.top + box.height * fraction);
      expect(shape(menu)).toEqual(initial);
    }
  }
  expect(menu.scrollTop).toBe(0);
  expect(window.scrollY).toBe(0);
});

it('slides up to stay in its room instead of scrolling, wherever it opens', async () => {
  // Opened near the pane's bottom, where the room below the point is far too small for it
  const menu = await open(items(7), 300, 365);
  inside(menu, 300);
  expect(menu.scrollHeight).toBeLessThanOrEqual(menu.clientHeight);
  expect(getComputedStyle(menu).display).toBe('flex');
});

it('leaves a pane too short for it for the window, in one column', async () => {
  const menu = await open(items(14), 200, 220);
  const box = menu.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(7.5);
  expect(box.bottom).toBeLessThanOrEqual(592.5);
  expect(menu.scrollHeight).toBeLessThanOrEqual(menu.clientHeight);
  expect(getComputedStyle(menu).display).toBe('flex');
});

it('goes into columns when it is too tall for the window, and never scrolls', async () => {
  const menu = await open(items(40), 300, 220);
  await frames();
  const box = menu.getBoundingClientRect();
  expect(menu.scrollHeight).toBeLessThanOrEqual(menu.clientHeight);
  expect(box.top).toBeGreaterThanOrEqual(7.5);
  expect(box.bottom).toBeLessThanOrEqual(592.5);
  expect(box.right).toBeLessThanOrEqual(792.5);
  const initial = shape(menu);
  await userEvent.keyboard('{End}');
  await frames();
  expect(menu.scrollTop).toBe(0);
  expect(document.activeElement?.textContent).toContain('Action 40');
  expect(shape(menu)).toEqual(initial);
  expect(window.scrollY).toBe(0);
});

it('fits a long submenu on screen without scrolling or moving its parent', async () => {
  const menu = await open([{ type: 'submenu', label: 'Conditions', children: items(40) }, ...items(4)], 300, 350);
  const initial = shape(menu);
  const trigger = menu.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  const point = centreOf(trigger);
  await mouse.hover(point.x, point.y);
  await expect.poll(() => menus().length).toBe(2);
  await frames();
  await frames();
  const submenu = menus()[1]!;
  expect(submenu.scrollHeight).toBeLessThanOrEqual(submenu.clientHeight);
  expect(submenu.getBoundingClientRect().bottom).toBeLessThanOrEqual(592.5);
  expect(shape(menu)).toEqual(initial);
});

it('uses the window when there is no map pane', async () => {
  const menu = await open(items(40), 300, 370, false);
  const box = menu.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(7.5);
  expect(box.bottom).toBeLessThanOrEqual(592.5);
  expect(menu.scrollHeight).toBeLessThanOrEqual(menu.clientHeight);
});

it('fits the menu width in a narrow pane', async () => {
  const menu = await open(items(8), 300, 350, true, 140);
  const pane = document.querySelector('.workspace-leaf')!.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(pane.left + 7.5);
  expect(box.right).toBeLessThanOrEqual(pane.right - 7.5);
  inside(menu, 300);
});

it('uses the clicked map pane even when a different pane registered the newest provider', async () => {
  await open(items(8), 300, 350);
  act(() => closeContextMenuGlobal());
  await frames();
  // Another map became the newest global controller, but the pointer is still over the first.
  render(h('div', { className: 'workspace-leaf', style: { left: 540, top: 80, width: 220, height: 300 } }, h(ContextMenuProvider, null)));
  await act(async () => {
    openContextMenuGlobal(items(8), { x: 100, y: 350 });
  });
  await frames();
  expect(menus()).toHaveLength(1);
  inside(menus()[0]!, 300);
});

it.each([true, false])('dismisses the menu on window resize without scrolling the map (pane: %s)', async (leaf) => {
  const menu = await open(items(12), 440, 500, leaf);
  const previous = centreOf(menu);
  await page.viewport(800, 300);
  await expect.poll(() => menus().length).toBe(0);
  await mouse.hover(previous.x, Math.min(previous.y, 270));
  await frames();
  expect(menus()).toHaveLength(0);
  expect(window.scrollY).toBe(0);
  expect(document.querySelector('.workspace-leaf')?.scrollTop ?? 0).toBe(0);
});

it('dismisses the menu and its submenu when the map pane is resized', async () => {
  const menu = await open([{ type: 'submenu', label: 'Conditions', children: items(40) }, ...items(4)], 300, 350);
  const point = centreOf(menu.querySelector<HTMLElement>('[aria-haspopup="menu"]')!);
  await mouse.hover(point.x, point.y);
  await expect.poll(() => menus().length).toBe(2);
  const leaf = document.querySelector<HTMLElement>('.workspace-leaf')!;
  leaf.style.height = '180px';
  await expect.poll(() => menus().length).toBe(0);
  await mouse.hover(point.x, 200);
  await frames();
  expect(menus()).toHaveLength(0);
  expect(window.innerHeight).toBe(600);
  expect(window.scrollY).toBe(0);
  expect(leaf.scrollTop).toBe(0);
});

it('keeps a menu opened beside the pane, over a body-level overlay, out of that pane', async () => {
  render(h('div', { className: 'workspace-leaf', style: { left: 40, top: 80, width: 260, height: 300 } }, h(ContextMenuProvider, null)));
  render(h('div', { style: { position: 'fixed', left: 480, top: 120, width: 300, height: 300 } }));
  await act(async () => {
    openContextMenuGlobal(items(4), { x: 520, y: 200 });
  });
  await frames();
  expect(menus()).toHaveLength(1);
  expect(menus()[0]!.getBoundingClientRect().left).toBeGreaterThanOrEqual(515);
});

/** A menu's rows: their heights, how far they stand inside the menu's border, their corner and where their words stand. */
function rowShape(menu: HTMLElement): { heights: number[]; inset: number[]; corners: string[]; offCentre: number } {
  const rows = [...menu.querySelectorAll<HTMLElement>('.atlas-ctx-item')];
  const box = menu.getBoundingClientRect();
  const border = parseFloat(getComputedStyle(menu).borderTopWidth);
  const first = rows[0]!.getBoundingClientRect();
  const last = rows.at(-1)!.getBoundingClientRect();
  const offCentre = Math.max(...rows.map((row) => {
    const rowBox = row.getBoundingClientRect();
    // The words themselves, whatever element holds them.
    const words = document.createRange();
    words.selectNodeContents(row);
    const label = words.getBoundingClientRect();
    return Math.abs(label.top + label.height / 2 - (rowBox.top + rowBox.height / 2));
  }));
  return {
    heights: [...new Set(rows.map((row) => row.getBoundingClientRect().height))],
    inset: [first.left - box.left - border, first.top - box.top - border, box.right - first.right - border, box.bottom - last.bottom - border],
    corners: [...new Set(rows.map((row) => getComputedStyle(row).borderTopLeftRadius)), getComputedStyle(menu).borderTopLeftRadius],
    offCentre,
  };
}

it('gives a fine pointer 28 px rows, 4 px inside the border, concentric with the menu\'s corner', async () => {
  const shapeOfRows = rowShape(await open(items(7), 400, 200));
  expect(shapeOfRows.heights).toEqual([28]);
  expect(shapeOfRows.inset).toEqual([4, 4, 4, 4]);
  expect(shapeOfRows.corners).toEqual(['10px', '15.5px']);
  expect(shapeOfRows.offCentre).toBeLessThanOrEqual(0.5);
});

it('gives a coarse pointer 44 px rows with the same inset and corners, their words on the rows\' middle, inside the pane', async () => {
  document.body.setAttribute('data-atlas-pointer', 'coarse');
  const menu = await open(items(7), 400, 200);
  const shapeOfRows = rowShape(menu);
  expect(shapeOfRows.heights).toEqual([44]);
  expect(shapeOfRows.inset).toEqual([4, 4, 4, 4]);
  expect(shapeOfRows.corners).toEqual(['10px', '15.5px']);
  expect(shapeOfRows.offCentre).toBeLessThanOrEqual(0.5);
  inside(menu, 400);
  expect(menu.scrollHeight).toBeLessThanOrEqual(menu.clientHeight);
});

it('keeps a coarse pointer\'s long menu on screen without scrolling: in the window, then in columns', async () => {
  document.body.setAttribute('data-atlas-pointer', 'coarse');
  const menu = await open(items(24), 300, 220);
  await frames();
  const box = menu.getBoundingClientRect();
  expect(menu.scrollHeight).toBeLessThanOrEqual(menu.clientHeight);
  expect(box.top).toBeGreaterThanOrEqual(7.5);
  expect(box.bottom).toBeLessThanOrEqual(592.5);
  expect(getComputedStyle(menu).display).toBe('grid');
});

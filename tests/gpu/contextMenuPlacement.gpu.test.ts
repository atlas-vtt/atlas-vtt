import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../src/app/react/components/context-menu/atlas-context-menu.scss?inline';
import { closeContextMenuGlobal, ContextMenuProvider, openContextMenuGlobal, type ContextMenuEntry } from '../../src/app/react/root/ContextMenuContext';
import { centreOf, mouse } from './realMouse';

const style = document.createElement('style');
const h = React.createElement;
style.textContent = css + `
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
afterEach(() => { cleanup(); style.remove(); });

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
  const menu = await open(items(12), 260, 320);
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

it('scrolls long menus internally and keeps their frame still when keyboard focus reaches the last item', async () => {
  const menu = await open(items(40), 300, 220);
  inside(menu, 300);
  expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);
  const initial = shape(menu);
  await userEvent.keyboard('{End}');
  await frames();
  expect(menu.scrollTop).toBeGreaterThan(0);
  expect(document.activeElement?.textContent).toContain('Action 40');
  expect(shape(menu)).toEqual(initial);
  expect(window.scrollY).toBe(0);
});

it('keeps a long submenu inside the same map pane without moving its parent', async () => {
  const menu = await open([{ type: 'submenu', label: 'Conditions', children: items(40) }, ...items(4)], 300, 350);
  const initial = shape(menu);
  const trigger = menu.querySelector<HTMLElement>('[aria-haspopup="menu"]')!;
  const point = centreOf(trigger);
  await mouse.hover(point.x, point.y);
  await expect.poll(() => menus().length).toBe(2);
  await frames();
  inside(menus()[1]!, 300);
  expect(menus()[1]!.scrollHeight).toBeGreaterThan(menus()[1]!.clientHeight);
  expect(shape(menu)).toEqual(initial);
});

it('uses the window when there is no map pane', async () => {
  const menu = await open(items(40), 300, 370, false);
  const box = menu.getBoundingClientRect();
  expect(box.top).toBeGreaterThanOrEqual(7.5);
  expect(box.bottom).toBeLessThanOrEqual(592.5);
  expect(menu.scrollHeight).toBeGreaterThan(menu.clientHeight);
});

it('fits the menu width in a narrow pane', async () => {
  const menu = await open(items(12), 300, 350, true, 140);
  const pane = document.querySelector('.workspace-leaf')!.getBoundingClientRect();
  const box = menu.getBoundingClientRect();
  expect(box.left).toBeGreaterThanOrEqual(pane.left + 7.5);
  expect(box.right).toBeLessThanOrEqual(pane.right - 7.5);
  inside(menu, 300);
});

it('uses the clicked map pane even when a different pane registered the newest provider', async () => {
  await open(items(12), 300, 350);
  act(() => closeContextMenuGlobal());
  await frames();
  // Another map became the newest global controller, but the pointer is still over the first.
  render(h('div', { className: 'workspace-leaf', style: { left: 540, top: 80, width: 220, height: 300 } }, h(ContextMenuProvider, null)));
  await act(async () => {
    openContextMenuGlobal(items(12), { x: 100, y: 350 });
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

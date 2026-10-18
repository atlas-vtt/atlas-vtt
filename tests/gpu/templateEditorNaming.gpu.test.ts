import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from '../unit/statblocks/template-editor/editorKit';
import React from 'react';
import { render } from '@testing-library/react';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor } from '../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { openPopout, pointer, pointIn, press } from './dragHarness';
import { frame, frames, mount, px, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/**
 * The name a tile just placed asks for, with the real stylesheet: under the
 * new tile where there is room, above it near the view's foot, never over it
 * and inside the view; its padding even on every side and its input's corners
 * concentric with its own, while the tile's toolbar steps aside. The tile
 * keeps its size when it is named: it is drawn as it will be from the start.
 */
const TOLERANCE = 0.5;
const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - TOLERANCE && a.right > b.left + TOLERANCE && a.top < b.bottom - TOLERANCE && a.bottom > b.top + TOLERANCE;
const placeOf = (rect: DOMRect): string => `${rect.left.toFixed(1)},${rect.top.toFixed(1)} to ${rect.right.toFixed(1)},${rect.bottom.toFixed(1)}`;

/** A card of `count` values, one to a row, which fills most of the view. */
function longTemplate(count: number): StatblockTemplate {
  const fields: TemplateField[] = [{ key: 'name', label: 'Name', type: 'text' }];
  const blocks: TemplateBlock[] = [{ id: 'title001', type: 'title', field: 'name', level: 1 }];
  for (let index = 0; index < count; index++) {
    fields.push({ key: `f${index}`, label: `Field ${index + 1}`, type: 'number' });
    blocks.push({ id: `value${index}`, type: 'stat', field: `f${index}`, look: 'run-in' });
  }
  return template(blocks, fields);
}

/** Selects `after`, then adds a Value after it: from the dock, or from the capsule's menu where the card stands above the note. */
async function placeValueAfter(root: HTMLElement, after: string): Promise<{ tile: HTMLElement; popover: HTMLElement }> {
  await act(async () => { frame(after).click(); });
  await frames(2);
  const dock = root.querySelector<HTMLElement>('.atlas-te-dock [data-item="block:stat"] button');
  if (dock) await act(async () => { dock.click(); });
  else {
    // The capsule's menu opens on a real press.
    await userEvent.click(root.querySelector<HTMLElement>('.atlas-te-capsule .atlas-sb-pane-header__more')!);
    await wait(200);
    const add = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((row) => row.textContent?.includes('Add value'))!;
    await act(async () => { add.click(); });
  }
  await wait(400);
  const popover = document.querySelector<HTMLElement>('.atlas-te-naming:not([data-closing])')!;
  const id = document.querySelector('[data-te-selected="primary"]')!.getAttribute('data-block-id')!;
  return { tile: frame(id), popover };
}

function expectClearOfTile(root: HTMLElement, popover: HTMLElement, tile: HTMLElement, side: 'below' | 'above', what: string): void {
  const box = popover.querySelector('.atlas-te-naming__panel')!.getBoundingClientRect();
  const placed = tile.getBoundingClientRect();
  const view = root.getBoundingClientRect();
  const where = `${what} (${placeOf(box)}, tile ${placeOf(placed)})`;
  expect(popover.getAttribute('data-side'), where).toBe(side);
  if (side === 'below') expect(box.top, `${where}: under the tile`).toBeGreaterThan(placed.bottom);
  else expect(box.bottom, `${where}: above the tile`).toBeLessThan(placed.top);
  expect(overlaps(box, placed), `${where}: over the tile`).toBe(false);
  expect(box.left, `${where}: inside the view's left edge`).toBeGreaterThanOrEqual(view.left);
  expect(box.right, `${where}: inside the view's right edge`).toBeLessThanOrEqual(view.right);
  expect(box.top, `${where}: inside the view's top edge`).toBeGreaterThanOrEqual(view.top);
  expect(box.bottom, `${where}: inside the view's bottom edge`).toBeLessThanOrEqual(view.bottom);
  expect(document.querySelector('.atlas-te-toolbar'), `${where}: the toolbar steps aside`).toBeNull();
  expect(document.activeElement, `${where}: the input has focus`).toBe(popover.querySelector('input'));
}

describe('the name a tile just placed asks for', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('stands under the new tile where there is room, beside the note and above it', async () => {
    for (const width of [1180, 500]) {
      const root = mount(new FakeSession(sampleTemplate()), width);
      await frames(3);
      const { tile, popover } = await placeValueAfter(root, 'stat-ac1');
      expectClearOfTile(root, popover, tile, 'below', `at ${width}px`);
      cleanup();
    }
  });

  it('stands above a new tile near the view\'s foot, never over it, inside the view', async () => {
    const root = mount(new FakeSession(longTemplate(40)), 1180);
    await frames(3);
    const { tile, popover } = await placeValueAfter(root, 'value39');
    expectClearOfTile(root, popover, tile, 'above', 'after the last of 40 values');
  });

  it('is one rounded surface the name is typed into, padded evenly, the input without a frame of its own', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    await frames(3);
    const { popover } = await placeValueAfter(root, 'stat-ac1');
    const panel = popover.querySelector<HTMLElement>('.atlas-te-naming__panel')!;
    const input = panel.querySelector<HTMLElement>('input')!;
    const outer = panel.getBoundingClientRect();
    const inner = input.getBoundingClientRect();
    const border = px(getComputedStyle(panel).borderTopWidth);
    const insets = [inner.top - outer.top, outer.right - inner.right, outer.bottom - inner.bottom, inner.left - outer.left].map((inset) => inset - border);
    const padding = px(getComputedStyle(panel).paddingTop);
    for (const inset of insets) expect(inset, `insets ${insets.join(', ')} for ${padding} px of padding`).toBeCloseTo(padding, 0);
    const field = getComputedStyle(input);
    expect([field.borderTopWidth, field.backgroundColor, field.borderTopLeftRadius]).toEqual(['0px', 'rgba(0, 0, 0, 0)', '0px']);
  });

  it('draws a Table just placed at the size it has once named', async () => {
    const session = new FakeSession(sampleTemplate());
    const root = mount(session, 1180);
    await frames(3);
    await act(async () => { frame('stat-ac1').click(); });
    await frames(2);
    await act(async () => { root.querySelector<HTMLElement>('.atlas-te-dock [data-item="block:scores"] button')!.click(); });
    await wait(400);
    const id = document.querySelector('[data-te-selected="primary"]')!.getAttribute('data-block-id')!;
    const placed = frame(id).getBoundingClientRect();
    expect(frame(id).querySelectorAll('thead th')).toHaveLength(3);
    // Its row and column handles and add bars are there while it is named, as once it is.
    const chrome = (): string[] => [...frame(id).querySelectorAll('.atlas-sb-sheet-table__handle, .atlas-sb-sheet-table__add')].map((element) => element.className).sort();
    const placedChrome = chrome();
    expect(placedChrome.length).toBeGreaterThan(0);
    const input = document.querySelector<HTMLInputElement>('.atlas-te-naming input')!;
    await userEvent.type(input, 'Stress');
    await userEvent.keyboard('{Enter}');
    await wait(400);
    expect(session.template.fields.at(-1)).toMatchObject({ key: 'stress', type: 'scores' });
    const named = frame(id).getBoundingClientRect();
    expect(chrome()).toEqual(placedChrome);
    expect(Math.abs(named.width - placed.width), `width ${placed.width} then ${named.width}`).toBeLessThan(3);
    expect(Math.abs(named.height - placed.height), `height ${placed.height} then ${named.height}`).toBeLessThan(3);
  });

  it('asks in a second window as in the first: in its document, focused there, closed by a press there', async () => {
    const session = new FakeSession(sampleTemplate());
    const popout = openPopout();
    try {
      const h = React.createElement;
      render(h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin' }, h('div', { className: 'atlas-statblock-editor', style: { height: 700, width: 1000 } },
        h(TemplateEditor, { session, host: { save: async () => null, close: () => undefined }, collectionId: null })))),
      { container: popout.container, baseElement: popout.win.document.body });
      const { win } = popout;
      const doc = win.document;
      await frames(3, win);
      await act(async () => { frame('stat-ac1', doc).click(); });
      await act(async () => { doc.querySelector<HTMLElement>('.atlas-te-dock [data-item="block:stat"] button')!.click(); });
      await wait(400);
      const input = doc.querySelector<HTMLInputElement>('.atlas-te-naming input');
      expect(document.querySelector('.atlas-te-naming')).toBeNull();
      expect(input?.placeholder).toBe('Name component');
      expect(doc.activeElement).toBe(input);
      const tile = doc.querySelector('[data-te-selected="primary"]')!;
      expect(input!.closest('.atlas-te-naming')!.getBoundingClientRect().top).toBeGreaterThan(tile.getBoundingClientRect().bottom);
      const placed = tile.getAttribute('data-block-id')!;
      await act(async () => { pointer(win, 'pointerdown', pointIn(frame('stat-hp1', doc))); });
      await wait(400);
      expect(doc.querySelector('.atlas-te-naming')).toBeNull();
      // A tile left without a name goes again, leaving no step.
      expect(doc.querySelector(`[data-block-id="${placed}"]`)).toBeNull();
      expect(session.steps).toBe(0);

      await act(async () => { doc.querySelector<HTMLElement>('.atlas-te-dock [data-item="block:entries"] button')!.click(); });
      await wait(400);
      const list = doc.querySelector<HTMLInputElement>('.atlas-te-naming input')!;
      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value')!.set!;
        setValue.call(list, 'Actions');
        list.dispatchEvent(new win.Event('input', { bubbles: true }));
      });
      await act(async () => { press(list, 'Enter'); });
      await wait(400);
      expect(session.template.layout.blocks.find((block) => block.type === 'entries')).toMatchObject({ field: 'actions', heading: 'Actions' });
      expect(doc.activeElement?.getAttribute('data-block-id')).toBe(session.template.layout.blocks.find((block) => block.type === 'entries')!.id);
    } finally {
      cleanup();
      popout.close();
    }
  });
});

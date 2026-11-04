import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { FakeSession, sampleTemplate, shape } from '../unit/statblocks/template-editor/editorKit';
import { centreOf, mouse, pressAndMove } from './realMouse';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const SETTLED_MS = 260;
/** Long enough for the Options popover to open, or to fade and leave the page. */
const POPOVER_MS = 300;
type Rect = { left: number; top: number; right: number; bottom: number };
const intersects = (a: Rect, b: Rect): boolean => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
const menuItems = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
const menuRows = (): string[] => menuItems().map((row) => row.textContent ?? '');
const selected = (): string | null | undefined => document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id');
const toolbarOf = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-te-toolbar')!;
const controlsOf = (toolbar: HTMLElement): string[] => [...toolbar.querySelectorAll('button')].map((button) => button.textContent ?? '');

/** Points at a tile with the real mouse; its handle shows, whatever its glyph. */
async function handleOf(id: string): Promise<HTMLElement> {
  const { x, y } = centreOf(frame(id));
  await mouse.hover(x, y);
  await frames(2);
  const handle = document.querySelector<HTMLElement>('.atlas-sb-handle');
  if (!handle) throw new Error(`No handle for ${id}.`);
  return handle;
}

/** The ⋮⋮ handle of a tile pointed at: the one that drags it. */
async function grip(id: string): Promise<HTMLElement> {
  const handle = await handleOf(id);
  if (handle.dataset.glyph !== 'grip') throw new Error(`The handle of ${id} is no grip.`);
  return handle;
}

async function clickAt(element: Element): Promise<void> {
  const { x, y } = centreOf(element);
  await act(async () => {
    await mouse.click(x, y);
    await frames(3);
  });
}

/**
 * Handles, menus and the toolbar in the template editor's grid, with real
 * mouse input (spec §3–§5): every tile shows a ⋮⋮ handle on hover, which
 * drags it and opens its menu, and the name a lock, which only opens its
 * menu; a right-click selects and opens the same menu, whose last row
 * deletes; the toolbar sits below the selected tile, with its Options.
 */
describe('handles and menus in the template editor', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('shows a 24 × 24 handle in the gutter of the tile pointed at, covering none of its text: a grip on a tile, a lock on the name', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    for (const [id, glyph] of [['header-name', 'lock'], ['header-hp', 'lock'], ['title001', 'grip'], ['stat-ac1', 'grip'], ['stat-sp1', 'grip'], ['divider1', 'grip']] as const) {
      const handle = await handleOf(id);
      const box = handle.getBoundingClientRect();
      expect(handle.dataset.glyph, id).toBe(glyph);
      expect(box.width).toBe(24);
      expect(box.height).toBe(24);
      expect(box.right).toBeLessThanOrEqual(frame(id).getBoundingClientRect().left + 4);
      expect(handle.tabIndex).toBe(-1);
    }
  });

  it('turns the handle of a tile later in its row and hangs it above the tile\'s corner, where the row has no gutter', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const handle = await grip('stat-cr1');
    const box = handle.getBoundingClientRect();
    const tile = frame('stat-cr1').getBoundingClientRect();
    expect(handle.dataset.orientation).toBe('horizontal');
    expect(box.width).toBe(24);
    expect(box.height).toBe(24);
    expect(box.bottom).toBeLessThanOrEqual(tile.top + 4);
    expect(box.left).toBeCloseTo(tile.left, 0);
    // Never over the tile before it in the row.
    expect(intersects(box, frame('stat-sp1').getBoundingClientRect())).toBe(false);
  });

  it('moves a tile dragged by its handle to where the line showed, as one undo step', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const handle = await grip('divider1');
    const hp = frame('stat-hp1').getBoundingClientRect();
    const to = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    const connected: boolean[] = [];
    await pressAndMove(centreOf(handle), to, 20, () => connected.push(handle.isConnected));
    const line = document.querySelector<HTMLElement>('.atlas-te-drop-line');
    expect(line?.dataset.orientation).toBe('horizontal');
    const lineY = centreOf(line!).y;
    await act(async () => {
      await mouse.up(to.x, to.y);
      await wait(SETTLED_MS);
    });
    expect(connected.every(Boolean)).toBe(true);
    expect(shape(session.template.layout.blocks)).toBe('title001 stat-ac1 divider1 stat-hp1 row00001(stat-sp1 stat-cr1)');
    expect(session.steps).toBe(1);
    expect(lineY).toBeGreaterThanOrEqual(frame('stat-ac1').getBoundingClientRect().bottom - 1);
    expect(lineY).toBeLessThanOrEqual(frame('divider1').getBoundingClientRect().top + 1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('divider1');
  });

  it('never drags from a tile\'s body, a label or a sample value: the press selects', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    const to = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    await pressAndMove(centreOf(frame('divider1')), to, 16);
    expect(document.querySelector('.atlas-te-drop-line')).toBeNull();
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
    expect(session.steps).toBe(0);
  });

  it('never drags the name by its lock, whose click opens a menu that neither moves nor deletes it', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const lock = await handleOf('header-name');
    expect(lock.dataset.glyph).toBe('lock');
    const hp = frame('stat-hp1').getBoundingClientRect();
    const to = { x: hp.left + hp.width / 2, y: hp.bottom - 2 };
    await pressAndMove(centreOf(lock), to, 16);
    expect(document.querySelector('.atlas-te-drop-line')).toBeNull();
    expect(session.gestureOpen).toBe(false);
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
    expect(session.steps).toBe(0);
    expect(shape(session.template.layout.blocks)).toBe(shape(sampleTemplate().layout.blocks));

    await clickAt(await handleOf('header-name'));
    expect(menuRows().map((row) => /^(Rename|Copy property name)/.exec(row)?.[1])).toEqual(['Rename', 'Copy property name']);
  });

  it('opens the tile\'s menu by a click on its handle and by right-click, which selects first; Options is the first row of a value and Delete the last', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    await clickAt(await grip('stat-hp1'));
    expect(menuRows()[0]).toMatch(/^Options/);
    expect(menuRows().at(-1)).toMatch(/^Delete/);
    await userEvent.keyboard('{Escape}');
    await frames(2);

    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.rightClick(ac.x, ac.y);
      await frames(3);
    });
    expect(selected()).toBe('stat-ac1');
    const remove = menuItems().at(-1)!;
    expect(remove.textContent).toMatch(/^Delete/);
    await clickAt(remove);
    expect(shape(session.template.layout.blocks)).toBe('title001 stat-hp1 row00001(stat-sp1 stat-cr1) divider1');
    expect(session.steps).toBe(1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
  });

  it('sets the toolbar below the selected tile, never over it: Kind of value and Options on a value, then Add below, Delete and More', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    // A divider has nothing to configure; the name is only renamed.
    await clickAt(frame('divider1'));
    expect(toolbarOf().getAttribute('aria-label')).toBe('Divider toolbar');
    expect(controlsOf(toolbarOf())).toEqual(['Add below', 'Delete', 'More']);
    expect(toolbarOf().getBoundingClientRect().top).toBeGreaterThanOrEqual(frame('divider1').getBoundingClientRect().bottom + 8);
    await clickAt(frame('header-name'));
    expect(toolbarOf().getAttribute('aria-label')).toBe('Name toolbar');
    expect(controlsOf(toolbarOf())).toEqual(['Rename', 'More']);
    expect(intersects(toolbarOf().getBoundingClientRect(), frame('header-name').getBoundingClientRect())).toBe(false);

    for (const [id, kind] of [['stat-ac1', 'Number'], ['stat-sp1', 'Text'], ['stat-cr1', 'Rating']] as const) {
      await clickAt(frame(id));
      const toolbar = toolbarOf();
      expect(toolbar.getAttribute('aria-label')).toBe('Value toolbar');
      expect(controlsOf(toolbar)).toEqual([`Kind of value: ${kind}`, 'Options', 'Add below', 'Delete', 'More']);
      expect(toolbar.querySelector('[data-value-kind] button')).toBe(toolbar.querySelectorAll('button')[0]);
      expect(toolbar.querySelector('[data-options] button')).toBe(toolbar.querySelectorAll('button')[1]);
      const box = toolbar.getBoundingClientRect();
      const tile = frame(id).getBoundingClientRect();
      expect(box.top, id).toBeGreaterThanOrEqual(tile.bottom + 8);
      expect(intersects(box, tile), id).toBe(false);
      // A compact capsule: its chip and five controls.
      expect(box.width).toBeLessThanOrEqual(240);
    }
  });

  it('opens a tile\'s Options from the toolbar, beside the card at the tile\'s height and never over the tile', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    await clickAt(frame('stat-ac1'));
    const button = toolbarOf().querySelector<HTMLElement>('[data-options] button')!;
    await act(async () => {
      await mouse.click(centreOf(button).x, centreOf(button).y);
      await wait(POPOVER_MS);
    });
    const options = document.querySelector<HTMLElement>('.atlas-te-options')!;
    expect(options.getAttribute('role')).toBe('dialog');
    expect(options.getAttribute('aria-label')).toBe('Armor class options');
    expect(options.contains(document.activeElement)).toBe(true);
    const box = options.getBoundingClientRect();
    expect(intersects(box, frame('stat-ac1').getBoundingClientRect())).toBe(false);
    // Beside the card, at the height of their tile.
    expect(box.right).toBeLessThanOrEqual(document.querySelector('.atlas-te .atlas-sb-note-panel')!.getBoundingClientRect().left);
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeCloseTo(frame('stat-ac1').getBoundingClientRect().top, 0);
    expect(getComputedStyle(toolbarOf()).visibility).toBe('visible');
    expect(selected()).toBe('stat-ac1');
    expect(session.steps).toBe(0);
  });

  it('closes a tile\'s Options on a second click on their button, the tile still selected', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    await clickAt(frame('stat-ac1'));
    const button = toolbarOf().querySelector<HTMLElement>('[data-options] button')!;
    for (const open of [true, false]) {
      await act(async () => {
        await mouse.click(centreOf(button).x, centreOf(button).y);
        await wait(POPOVER_MS);
      });
      expect(document.querySelector('.atlas-te-options') !== null).toBe(open);
      expect(selected()).toBe('stat-ac1');
    }
  });

  it('keeps the toolbar shown and in reach while the pointer crosses the line below on its way there', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.click(ac.x, ac.y);
      await frames(3);
    });
    const toolbar = document.querySelector<HTMLElement>('.atlas-te-toolbar')!;
    const box = toolbar.getBoundingClientRect();
    const hp = frame('stat-hp1').getBoundingClientRect();
    // The toolbar stands at the block's right end, over the empty end of the line below, never its label.
    expect(box.right).toBeCloseTo(frame('stat-ac1').getBoundingClientRect().right, 0);
    expect(box.left).toBeGreaterThan(hp.left + 40);
    // Down from the block, over the line below, onto every control and the gaps between them: the toolbar stays.
    const more = centreOf(toolbar.querySelector<HTMLElement>('.atlas-te-toolbar__more button')!);
    await mouse.hover(more.x, hp.top + 1);
    await frames(2);
    for (let x = box.left + 2; x < box.right - 2; x += 4) {
      await mouse.hover(x, more.y);
      const at = document.elementFromPoint(x, more.y);
      expect(at && toolbar.contains(at)).toBe(true);
    }
    await frames(2);
    expect(getComputedStyle(toolbar).opacity).toBe('1');
    expect(getComputedStyle(toolbar).visibility).toBe('visible');
    await act(async () => {
      await mouse.click(more.x, more.y);
      await frames(3);
    });
    expect(menuRows().length).toBeGreaterThan(0);
    expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe('stat-ac1');
  });

  it('opens the menu of what a toolbar button covers on a right-click there', async () => {
    mount(new FakeSession(sampleTemplate()), 1280);
    await frames(2);
    const ac = centreOf(frame('stat-ac1'));
    await act(async () => {
      await mouse.click(ac.x, ac.y);
      await frames(3);
    });
    const blockUnder = (at: { x: number; y: number }): string | null | undefined => document.elementsFromPoint(at.x, at.y)
      .find((element) => element.closest('.atlas-te-stage [data-block-id]'))?.closest('[data-block-id]')?.getAttribute('data-block-id');
    const button = document.querySelector<HTMLElement>('.atlas-te-toolbar button')!;
    const at = centreOf(button);
    const id = blockUnder(at);
    await act(async () => {
      await mouse.rightClick(at.x, at.y);
      await frames(3);
    });
    // A line under the button gets its own menu; the card's gaps get the card's.
    expect(menuRows().length).toBeGreaterThan(0);
    if (id) {
      expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe(id);
      expect(menuRows().at(-1)).toMatch(/^Delete/);
    }
    // While a block's menu is open the toolbar keeps out of its way (§4.2).
    expect(document.querySelector('.atlas-te-toolbar')?.hasAttribute('data-hidden')).toBe(true);
  });
});

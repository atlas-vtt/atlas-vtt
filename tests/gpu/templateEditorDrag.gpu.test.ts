import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { userEvent } from 'vitest/browser';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor } from '../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { FakeSession, sampleTemplate, shape } from '../unit/statblocks/template-editor/editorKit';
import { drop, dropLine, gripOf, openPopout, pickUpAndMove, pointer, pointIn, press } from './dragHarness';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

/** Long enough for the copy to settle (180 ms) and the landing wash to start. */
const SETTLED_MS = 260;
const live = (): string => document.querySelector('.atlas-te-live')?.textContent?.trim() ?? '';
const gridShape = (session: FakeSession): string => shape(session.template.layout.blocks);

/** The handle the gutter shows for a block pointed at, whatever its glyph. */
async function handleOf(target: Element): Promise<HTMLElement> {
  const { x, y } = pointIn(target);
  pointer(window, 'pointermove', { x, y });
  await frames(2);
  const handle = document.querySelector<HTMLElement>('.atlas-sb-handle');
  if (!handle) throw new Error('No handle.');
  return handle;
}

/**
 * Drag and drop in the template editor's grid with the real stylesheet (§7.6,
 * §14.2): where the line shows is where the tile lands, only a tile's handle
 * drags it, a tile's left and right edges set tiles side by side in a row, the
 * keyboard moves tiles too, focus and announcements follow the tile.
 */
describe('dragging tiles in the template editor', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('lands a tile dragged between two rows exactly where the line showed', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), { x: hp.left + hp.width / 2, y: hp.top + 2 });
    const line = dropLine();
    expect(line?.orientation).toBe('horizontal');
    expect(live()).toBe('A row of its own, row 3 of 5.');
    // The whole drag is one gesture: nothing saves meanwhile, and a change written elsewhere is a conflict.
    expect(session.gestureOpen).toBe(true);

    await drop(window, { x: hp.left + hp.width / 2, y: hp.top + 2 });
    await wait(SETTLED_MS);
    expect(session.gestureOpen).toBe(false);
    expect(gridShape(session)).toBe('title001 stat-ac1 divider1 stat-hp1 row00001(stat-sp1 stat-cr1)');
    expect(session.steps).toBe(1);
    const ac = frame('stat-ac1').getBoundingClientRect();
    const divider = frame('divider1').getBoundingClientRect();
    expect(line!.y).toBeGreaterThanOrEqual(ac.bottom - 1);
    expect(line!.y).toBeLessThanOrEqual(divider.top + 1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('divider1');
    expect(live()).toBe('Moved Divider to a row of its own, row 3 of 5.');
    expect(document.querySelector('.atlas-te-drop-line')).toBeNull();
  });

  it('sets a tile beside another over the band along its edge, with a line down that edge, and between rows over its middle', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const ac = frame('stat-ac1').getBoundingClientRect();
    const at = { x: ac.right - Math.min(ac.width * 0.08, 20), y: ac.top + ac.height / 2 + 1 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), at);
    const line = dropLine();
    expect(line?.orientation).toBe('vertical');
    expect(line!.x).toBeGreaterThanOrEqual(ac.right - 1);
    expect(live()).toBe('Beside Armor class, on its right.');

    await drop(window, at);
    await wait(SETTLED_MS);
    expect(gridShape(session)).toMatch(/^title001 (\w+)\(stat-ac1 divider1\) stat-hp1 row00001\(stat-sp1 stat-cr1\)$/);
    expect(session.steps).toBe(1);
    const divider = frame('divider1').getBoundingClientRect();
    const placed = frame('stat-ac1').getBoundingClientRect();
    expect(divider.left).toBeGreaterThanOrEqual(placed.right - 1);

    const hp = frame('stat-hp1').getBoundingClientRect();
    const middle = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('stat-sp1'))), middle);
    expect(dropLine()?.orientation).toBe('horizontal');
    await drop(window, middle);
  });

  it('never drops into the header: a tile let go over the name lands in the first row after it', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const title = frame('header-name').getBoundingClientRect();
    const over = { x: title.left + title.width / 2, y: title.top + 3 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), over);
    expect(live()).toBe('A row of its own, row 1 of 5.');
    await drop(window, over);
    await wait(SETTLED_MS);
    expect(gridShape(session)).toBe('divider1 title001 stat-ac1 stat-hp1 row00001(stat-sp1 stat-cr1)');
    expect(session.template.header).toBeUndefined();
  });

  it('starts no drag from a press on a tile\'s body, nor from the name\'s handle: only a tile\'s handle drags it', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    await pickUpAndMove(window, pointIn(frame('divider1')), { x: hp.left + hp.width / 2, y: hp.top + 2 });
    expect(dropLine()).toBeNull();
    expect(session.gestureOpen).toBe(false);
    await drop(window, { x: hp.left + hp.width / 2, y: hp.top + 2 });
    expect(session.steps).toBe(0);
    expect((await handleOf(frame('header-name'))).getAttribute('data-glyph')).toBe('lock');
  });

  it('moves a tile with Space and the arrow keys, into a row too, and Escape puts it back', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    await userEvent.click(frame('stat-hp1'));
    await userEvent.keyboard(' ');
    expect(live()).toMatch(/^Picked up Hit points\. Choose a place with the arrow keys/);
    await wait(20);
    await userEvent.keyboard('{ArrowDown}');
    await frames(2);
    expect(live()).toBe('In a row, place 1 of 3.');
    expect(dropLine()).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    await frames(2);
    expect(session.steps).toBe(0);
    expect(live()).toBe('Cancelled. Hit points stays where it was.');
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');

    await userEvent.keyboard(' ');
    await wait(20);
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.keyboard(' ');
    await wait(SETTLED_MS);
    expect(gridShape(session)).toBe('title001 stat-ac1 row00001(stat-hp1 stat-sp1 stat-cr1) divider1');
    expect(session.steps).toBe(1);
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
    expect(live()).toBe('Moved Hit points into a row, place 1 of 3.');
  });

  it('cancels a pointer drag on Escape, also with the pressed tile selected, and the release drops nothing', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    await userEvent.click(frame('divider1'));
    const hp = frame('stat-hp1').getBoundingClientRect();
    const at = { x: hp.left + hp.width / 2, y: hp.top + 2 };
    await pickUpAndMove(window, pointIn(await gripOf(frame('divider1'))), at);
    expect(dropLine()).not.toBeNull();
    expect(session.gestureOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    await frames(2);
    expect(dropLine()).toBeNull();
    expect(session.gestureOpen).toBe(false);
    expect(live()).toBe('Cancelled. Divider stays where it was.');
    await drop(window, at);
    await wait(SETTLED_MS);
    expect(session.steps).toBe(0);
    expect(gridShape(session)).toBe(shape(sampleTemplate().layout.blocks));
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('divider1');
  });

  it('inserts a kind dragged from the dock where it is dropped and selects it, asking for its name rather than opening its label, and takes it away on Escape', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const kind = document.querySelector<HTMLElement>('.atlas-te-dock [data-item="block:stat"]')!;
    const hp = frame('stat-hp1').getBoundingClientRect();
    const at = { x: hp.left + hp.width / 2, y: hp.bottom - 2 };
    await pickUpAndMove(window, pointIn(kind), at);
    expect(document.querySelector('.atlas-te-drag-overlay .atlas-te-drag-face--item .atlas-statblock')).not.toBeNull();
    await drop(window, at);
    await act(() => wait(SETTLED_MS));
    expect(session.template.layout.blocks.map((block) => block.type)).toEqual(['title', 'stat', 'stat', 'stat', 'row', 'divider']);
    // The tile is real once it is named: until then it is no step.
    expect(session.steps).toBe(0);
    const inserted = session.template.layout.blocks[3]?.id;
    expect(document.querySelector('.atlas-te-label-input')).toBeNull();
    const name = document.querySelector<HTMLInputElement>('.atlas-te-naming input');
    expect(name?.placeholder).toBe('Name component');
    expect(document.activeElement).toBe(name);
    expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe(inserted);
    press(name!, 'Escape');
    await act(() => wait(300));
    expect(gridShape(session)).toBe(shape(sampleTemplate().layout.blocks));
    expect(session.steps).toBe(0);
  });

  it('keeps one owner of each transform: the drag slides frames, framer animates none of them', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1280);
    await frames(2);
    const hp = frame('stat-hp1').getBoundingClientRect();
    await pickUpAndMove(window, pointIn(await gripOf(frame('stat-ac1'))), { x: hp.left + hp.width / 2, y: hp.bottom - 3 });
    await wait(80);
    const slid = [...document.querySelectorAll<HTMLElement>('[data-te-shift]')];
    expect(slid.map((element) => element.dataset.blockId).sort()).toEqual(['stat-ac1', 'stat-hp1']);
    for (const element of slid) {
      expect(getComputedStyle(element).transform).not.toBe('none');
      expect(element.style.transform).toBe('');
      expect(element.getAnimations().every((animation) => animation instanceof CSSTransition)).toBe(true);
    }
    const scripted = document.getAnimations().filter((animation) => !(animation instanceof CSSTransition || animation instanceof CSSAnimation));
    const targets = scripted.map((animation) => (animation.effect as KeyframeEffect | null)?.target).filter((target) => target instanceof Element);
    expect(targets.filter((target) => target.closest('[data-te-shift], .atlas-te-drag-overlay'))).toEqual([]);
    expect(document.querySelector('.atlas-te-drag-overlay')?.getAnimations()).toEqual([]);
    await drop(window, { x: hp.left + hp.width / 2, y: hp.bottom - 3 });
    expect(document.querySelectorAll('[data-te-shift]')).toHaveLength(0);
    expect(gridShape(session)).toMatch(/^title001 stat-hp1 stat-ac1 /);
  });

  it('drags in a second window as in the first, through a change of the card mid-drag, binding nothing to the first', async () => {
    const session = new FakeSession(sampleTemplate());
    const popout = openPopout();
    // What a drag binds in the first window while it runs (a menu that mounts after the drop binds its own).
    let spies: Array<MockInstance<typeof window.addEventListener>> = [];
    const watchFirstWindow = (): void => {
      vi.restoreAllMocks();
      spies = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')];
    };
    // A tooltip's trigger (the handle's) listens once for the press's end on the global document, Radix's own; the drag binds nothing there.
    const once = (options: unknown): boolean => typeof options === 'object' && options !== null && (options as AddEventListenerOptions).once === true;
    const boundInFirstWindow = (): string[] => spies
      .flatMap((spy) => spy.mock.calls.filter(([, , options]) => !once(options)).map(([type]) => type))
      .filter((type) => /pointer|mouse|key|touch/.test(type));
    try {
      const h = React.createElement;
      const noop = (): void => undefined;
      render(h(TooltipProvider, null, h('div', { className: 'atlas-vtt-plugin' }, h('div', { className: 'atlas-statblock-editor', style: { height: 700, width: 1000 } },
        h(TemplateEditor, {
          session, host: { save: async () => null, close: noop }, collectionId: null,
        })))), { container: popout.container, baseElement: popout.win.document.body });
      const { win } = popout;
      const doc = win.document;
      await frames(3, win);
      watchFirstWindow();
      // Beside a tile nothing slides: the tiles stand where the targets are worked out.
      await pickUpAndMove(win, pointIn(await gripOf(frame('divider1', doc))), pointIn(frame('stat-ac1', doc), 0.03, 0.5));
      await wait(250);
      act(() => session.apply((template) => ({
        ...template, layout: { ...template.layout, blocks: [{ id: 'heading9', type: 'heading', text: 'Added during the drag', level: 'section' }, ...template.layout.blocks] },
      })));
      await frames(3, win);
      const hp = frame('stat-hp1', doc).getBoundingClientRect();
      pointer(win, 'pointermove', { x: hp.left + hp.width / 2, y: hp.top + 2 });
      await frames(3, win);
      const line = dropLine(doc);
      expect(boundInFirstWindow()).toEqual([]);
      expect(doc.querySelector('.atlas-te-drag-layer .atlas-te-drag-overlay')).not.toBeNull();
      expect(document.querySelector('.atlas-te-drag-layer')).toBeNull();
      await drop(win, { x: hp.left + hp.width / 2, y: hp.top + 2 });
      await wait(SETTLED_MS);
      expect(shape(session.template.layout.blocks)).toBe('heading9 title001 stat-ac1 divider1 stat-hp1 row00001(stat-sp1 stat-cr1)');
      expect(line!.y).toBeGreaterThanOrEqual(frame('stat-ac1', doc).getBoundingClientRect().bottom - 1);
      expect(line!.y).toBeLessThanOrEqual(frame('divider1', doc).getBoundingClientRect().top + 1);
      expect(doc.activeElement?.getAttribute('data-block-id')).toBe('divider1');
      expect(doc.querySelector('.atlas-te-live')?.textContent?.trim()).toBe('Moved Divider to a row of its own, row 4 of 6.');

      // The keyboard, too: Space lifts, the arrows choose, Space drops.
      watchFirstWindow();
      press(frame('stat-hp1', doc), ' ', 'Space');
      await wait(20);
      press(doc.activeElement ?? doc.body, 'ArrowDown');
      await frames(2, win);
      expect(doc.querySelector('.atlas-te-live')?.textContent?.trim()).toBe('In a row, place 1 of 3.');
      expect(boundInFirstWindow()).toEqual([]);
      press(doc.activeElement ?? doc.body, ' ', 'Space');
      await wait(SETTLED_MS);
      expect(shape(session.template.layout.blocks)).toBe('heading9 title001 stat-ac1 divider1 row00001(stat-hp1 stat-sp1 stat-cr1)');
      expect(doc.activeElement?.getAttribute('data-block-id')).toBe('stat-hp1');
    } finally {
      vi.restoreAllMocks();
      cleanup();
      popout.close();
    }
  });
});

import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { App } from 'obsidian';
import { TemplateLibrary } from '../../src/app/statblocks/library/TemplateLibrary';
import { TEMPLATE_FORMAT, TEMPLATE_VERSION } from '../../src/app/statblocks/model/templateTypes';
import { blockOf, renderPane, type PaneHarness } from '../unit/statblocks/editor/paneKit';
import { openPopout, pointer, pointIn } from './dragHarness';
import { centreOf, mouse, pressAndMove } from './realMouse';
import { frames, useEditorStyles, wait } from './sidePanesHarness';

// Dice links and the token socket reach the map view and the token link service, whose Node `events` has no browser build.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));
vi.mock('../../src/app/services/TokenStatblockLinkService', () => ({ TokenStatblockLinkService: { getInstance: () => ({}) } }));
vi.mock('../../src/app/statblocks/editor/create/createFlow', () => ({
  createStatblock: async () => null,
  startStatblockCreation: async () => null,
}));
vi.mock('../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const ACTIONS = [{ name: 'Bite', desc: 'It bites.' }, { name: 'Lash', desc: 'It lashes.' }, { name: 'Roar', desc: 'It roars.' }];
const TRAITS = [{ name: 'Amphibious', desc: 'It breathes air and water.' }];
const WARDEN = { statblock: true, 'atlas-template': 'builtin:generic-creature', name: 'Marsh Warden', hp: 14, traits: TRAITS, actions: ACTIONS };
const ACTION_LIST = 'gcaction';

const apps: App[] = [];
afterEach(() => {
  cleanup();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(frontmatter: Record<string, unknown> = WARDEN, files?: Record<string, string>): Promise<PaneHarness> {
  const harness = await renderPane({ frontmatter, ...(files && { files }) });
  apps.push(harness.app);
  await frames(2);
  return harness;
}

const live = (harness: PaneHarness): string => harness.result.container.querySelector('.atlas-sb-pane-live')?.textContent ?? '';
const abilities = (harness: PaneHarness, list = ACTION_LIST): HTMLElement[] => [...blockOf(harness.result.container, list).querySelectorAll<HTMLElement>('[data-item-key]')];

/** Points at an ability and returns its handle, which shows within a frame. */
async function handleOf(ability: HTMLElement): Promise<HTMLButtonElement> {
  const { x, y } = centreOf(ability);
  await mouse.hover(x, y);
  await frames(2);
  const handle = document.querySelector<HTMLButtonElement>('.atlas-sb-handle[data-glyph="grip"]');
  if (!handle) throw new Error('No handle showed for the ability.');
  return handle;
}

/**
 * Dragging abilities in the statblock beside its note, with real mouse input
 * (spec §7.2, M1–M3, J2–J4): the ⋮⋮ handle in the gutter drags at rest and
 * while an ability is typed, never takes focus, stays connected from press to
 * drop, and the drag is held inside its own list.
 */
describe('dragging an ability by its handle', () => {
  useEditorStyles();

  it('moves an ability at rest to where the line showed, as one move patch by its identity', async () => {
    const harness = await pane();
    const [bite, , roar] = abilities(harness);
    const handle = await handleOf(bite!);
    expect(handle.getBoundingClientRect().width).toBe(24);
    expect(handle.getBoundingClientRect().height).toBe(24);
    expect(handle.tabIndex).toBe(-1);
    expect(handle.hasAttribute('data-atlas-chrome')).toBe(true);

    const to = { x: centreOf(handle).x, y: roar!.getBoundingClientRect().bottom - 2 };
    const connected: boolean[] = [];
    await pressAndMove(centreOf(handle), to, 20, () => connected.push(handle.isConnected));
    expect(document.querySelector('.atlas-list-drag-line')).not.toBeNull();
    expect(bite!.hasAttribute('data-sb-dragging')).toBe(true);
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
    expect(connected.every(Boolean)).toBe(true);
    expect(harness.writer.writes.at(-1)?.patches).toEqual([{ op: 'move', list: 'actions', item: ACTIONS[0], after: ACTIONS[2] }]);
    expect(live(harness)).toBe('Dropped Bite at 3 of 3.');
    expect(document.querySelector('.atlas-list-drag-layer')).toBeNull();
    // A drag's release opens no menu.
    expect(document.querySelector('.atlas-ctx-menu')).toBeNull();
  });

  it('shows no handle tooltip while the ability is dragged', async () => {
    const harness = await pane();
    const [bite, , roar] = abilities(harness);
    const handle = await handleOf(bite!);
    await mouse.hover(centreOf(handle).x, centreOf(handle).y);
    await wait(500);
    const to = { x: centreOf(handle).x, y: roar!.getBoundingClientRect().bottom - 2 };
    await pressAndMove(centreOf(handle), to, 20);
    await wait(500);
    const shown = [...document.querySelectorAll('.tooltip-label')].filter((label) => label.textContent?.includes('Drag to move'));
    expect(shown).toEqual([]);
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
  });

  it('keeps the input being typed, its text and its caret through a drag, and writes the text with the move', async () => {
    const harness = await pane();
    const [, lash] = abilities(harness);
    await mouse.click(centreOf(lash!).x, centreOf(lash!).y);
    await frames(2);
    const input = document.activeElement as HTMLInputElement;
    expect(input.getAttribute('data-entry-part')).toBe('name');
    await userEvent.keyboard('{End} whip');
    expect(input.value).toBe('Lash whip');

    // One ability is typed at a time: the others stay drawn as the card draws them (§6.3).
    const rows = abilities(harness);
    expect(rows.map((row) => row.classList.contains('atlas-sb-pane-entry-editor'))).toEqual([false, true, false]);
    const handle = await handleOf(rows[2]!);
    const to = { x: centreOf(handle).x, y: rows[0]!.getBoundingClientRect().top + 2 };
    const focus: boolean[] = [];
    await pressAndMove(centreOf(handle), to, 20, () => focus.push(document.activeElement === input));
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(3);
    });
    expect(focus.every(Boolean)).toBe(true);
    expect(harness.writer.writes.at(-1)?.patches).toEqual([
      { op: 'set', path: ['actions', 1, 'name'], base: 'Lash', next: 'Lash whip' },
      { op: 'move', list: 'actions', item: ACTIONS[2], after: null },
    ]);
  });

  it('holds the drag inside its own list: pulled towards another list it stops at the list\'s end and says why once', async () => {
    const harness = await pane();
    const [bite] = abilities(harness);
    const [trait] = abilities(harness, 'gctraits');
    const handle = await handleOf(bite!);
    const list = blockOf(harness.result.container, ACTION_LIST).getBoundingClientRect();
    // The traits stand in the other column, beside the actions: the pointer goes over to them, above the actions' list.
    const to = { x: centreOf(trait!).x, y: list.top - 40 };
    const ghostTops: number[] = [];
    await pressAndMove(centreOf(handle), to, 24, () => {
      const ghost = document.querySelector('.atlas-list-drag-ghost');
      if (ghost) ghostTops.push(ghost.getBoundingClientRect().top);
    });
    expect(ghostTops.length).toBeGreaterThan(0);
    // The copy's surface stands its inset around the ability's own text.
    expect(Math.min(...ghostTops)).toBeGreaterThanOrEqual(list.top - 8);
    expect(document.querySelector('.atlas-sb-drag-hint')?.textContent).toMatch(/stays in its list\.$/);
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
    // Bite was first already: nothing moved, nothing was written, and no other list changed.
    expect(harness.writer.writes).toEqual([]);
    expect(live(harness)).toBe('Not moved.');
  });

  it('cancels on Escape, leaving the list as it was', async () => {
    const harness = await pane();
    const [bite, , roar] = abilities(harness);
    const handle = await handleOf(bite!);
    const to = { x: centreOf(handle).x, y: roar!.getBoundingClientRect().bottom - 2 };
    await pressAndMove(centreOf(handle), to, 16);
    await userEvent.keyboard('{Escape}');
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
    });
    expect(harness.writer.writes).toEqual([]);
    expect(document.querySelector('.atlas-list-drag-layer')).toBeNull();
  });

  it('clamps a list split across the card\'s two columns to its fragments and moves across them', async () => {
    const id = 'only-actions-k7m2qa';
    const long = Array.from({ length: 10 }, (_, index) => ({ name: `Act ${index + 1}`, desc: 'A long line of text. '.repeat(14).trim() }));
    const template = {
      format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id,
      fields: [{ key: 'actions', label: 'Actions', type: 'entries' }],
      layout: { maxColumns: 2, blocks: [{ id: 'acts0000', type: 'entries', field: 'actions', heading: 'Actions' }] },
    };
    // The card keeps a block whole where it can; let this one break, so its list runs through both columns.
    const split = document.head.appendChild(document.createElement('style'));
    split.textContent = '.atlas-sb-sheet .atlas-sb-columns > .atlas-sb-item { break-inside: auto; }';
    onTestFinished(() => split.remove());
    const harness = await pane({ statblock: true, 'atlas-template': id, actions: long }, {
      'Bestiary/Marsh Warden.md': '---\nstatblock: true\n---\n',
      'atlas-vtt/statblock-templates/Only actions.atlastemplate': JSON.stringify(template),
    });
    await vi.waitFor(() => expect(abilities(harness, 'acts0000')).toHaveLength(10));
    const items = abilities(harness, 'acts0000');
    const lefts = new Set(items.flatMap((item) => [...item.getClientRects()].map((rect) => Math.round(rect.left))));
    expect(lefts.size).toBe(2);
    const last = items[9]!;
    const handle = await handleOf(items[0]!);
    const target = last.getClientRects()[last.getClientRects().length - 1]!;
    const to = { x: target.left + 8, y: target.bottom - 2 };
    await pressAndMove(centreOf(handle), to, 30);
    const bounds = document.querySelectorAll('.atlas-list-drag-bound');
    expect(bounds).toHaveLength(2);
    await act(async () => {
      await mouse.up(to.x, to.y);
      await frames(2);
      await wait(20);
    });
    expect(harness.writer.writes.at(-1)?.patches).toEqual([{ op: 'move', list: 'actions', item: long[0], after: long[9] }]);
  });

  it('drags in a popout as in the main window, binding nothing to the main window', async () => {
    const popout = openPopout();
    try {
      const harness = await renderPane({ frontmatter: WARDEN, container: popout.container });
      apps.push(harness.app);
      const { win } = popout;
      const doc = win.document;
      await frames(3, win);
      const spies = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')];
      const items = [...blockOf(popout.container, ACTION_LIST).querySelectorAll<HTMLElement>('[data-item-key]')];
      pointer(win, 'pointermove', pointIn(items[0]!));
      await frames(2, win);
      const handle = doc.querySelector<HTMLElement>('.atlas-sb-handle[data-glyph="grip"]')!;
      expect(handle).not.toBeNull();
      const from = pointIn(handle);
      const to = { x: from.x, y: items[2]!.getBoundingClientRect().bottom - 2 };
      pointer(win, 'pointerdown', from);
      for (let step = 1; step <= 12; step++) {
        pointer(win, 'pointermove', { x: from.x, y: from.y + ((to.y - from.y) * step) / 12 });
        await frames(1, win);
      }
      expect(doc.querySelector('.atlas-list-drag-layer .atlas-list-drag-ghost')).not.toBeNull();
      expect(document.querySelector('.atlas-list-drag-layer')).toBeNull();
      await act(async () => {
        pointer(win, 'pointerup', to);
        await frames(2, win);
      });
      // The handle's tooltip (Radix) listens once for the press's end on the global document; the drag binds nothing there.
      const once = (options: unknown): boolean => typeof options === 'object' && options !== null && (options as AddEventListenerOptions).once === true;
      const bound = spies.flatMap((spy) => spy.mock.calls.filter(([, , options]) => !once(options)).map(([type]) => type))
        .filter((type) => /pointer|mouse|key|click/.test(type));
      expect(bound).toEqual([]);
      expect(harness.writer.writes.at(-1)?.patches).toEqual([{ op: 'move', list: 'actions', item: ACTIONS[0], after: ACTIONS[2] }]);
    } finally {
      vi.restoreAllMocks();
      cleanup();
      popout.close();
    }
  });

  it('opens no menu with a click on its handle and keeps focus where it was; a block has no handle at all', async () => {
    const harness = await pane();
    const [bite] = abilities(harness);
    const handle = await handleOf(bite!);
    const before = document.activeElement;
    await act(async () => {
      await mouse.click(centreOf(handle).x, centreOf(handle).y);
      await frames(3);
    });
    expect(document.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(before);

    const hp = blockOf(harness.result.container, 'header-hp');
    await act(async () => {
      await mouse.move(centreOf(hp).x, centreOf(hp).y);
      await frames(3);
    });
    expect(document.querySelector('.atlas-sb-handle')).toBeNull();
  });

  it('stands its grip in the card\'s padding, clear of the card\'s border and of the ability', async () => {
    const harness = await pane();
    const [bite] = abilities(harness);
    const handle = await handleOf(bite!);
    const glyph = handle.querySelector('svg')!.getBoundingClientRect();
    const card = harness.result.container.querySelector('.atlas-sb-pane-card')!.getBoundingClientRect();
    const name = bite!.querySelector('.atlas-sb-trait-name')!.getBoundingClientRect();
    // The grip's dots, not its whole box: the outer columns of Lucide's grip lie 9 and 15 of 24 across.
    const dots = { left: glyph.left + glyph.width * (8 / 24), right: glyph.left + glyph.width * (16 / 24) };
    expect(dots.left - card.left).toBeGreaterThanOrEqual(3);
    expect(name.left - dots.right).toBeGreaterThanOrEqual(3);
  });
});

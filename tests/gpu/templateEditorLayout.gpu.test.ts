import '../setup/obsidianDom';
import { act, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { FakeSession, sampleTemplate, template } from '../unit/statblocks/template-editor/editorKit';
import { pointIn } from './dragHarness';
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
 * The template editor's shell with the real stylesheet (§2, §14, §17 D):
 * the note view's row with the dock over the note column, never over the
 * card; a tile's Options under it, inside the view and never over the tile;
 * padding equals the gap, corners are concentric, only transform and opacity
 * animate, and below 720 px the card stands above the note.
 */
const TOLERANCE = 0.5;
/**
 * Elevated surfaces have a 1.5 px border (`$border-width-m`), which Chrome
 * draws 1 px wide at a device pixel ratio of 1, as here. Insets measured from
 * the outer edge are put back to the border the corners were worked out for.
 */
const BORDER = 1.5;
const drawnBorder = (element: Element): number => px(getComputedStyle(element).borderTopWidth);
const ANIMATABLE = new Set(['transform', 'opacity', 'translate', 'scale', 'rotate']);
const SIDES = ['top', 'right', 'bottom', 'left'] as const;
/** Padding on all four sides and the gaps between children, of one container. */
function spacing(element: Element): { padding: number[]; rowGap: number; columnGap: number } {
  const style = getComputedStyle(element);
  return {
    padding: [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft].map(px),
    rowGap: px(style.rowGap),
    columnGap: px(style.columnGap),
  };
}

/** The room a container leaves around its children inside its border, as drawn: a child that overflows its box or carries a margin shows here. */
function drawnInsets(element: HTMLElement): number[] {
  const outer = element.getBoundingClientRect();
  const left = outer.left + element.clientLeft;
  const top = outer.top + element.clientTop;
  const boxes = [...element.children].map((child) => child.getBoundingClientRect()).filter((box) => box.width > 0 && box.height > 0);
  return [
    Math.min(...boxes.map((box) => box.top)) - top,
    left + element.clientWidth - Math.max(...boxes.map((box) => box.right)),
    top + element.clientHeight - Math.max(...boxes.map((box) => box.bottom)),
    Math.min(...boxes.map((box) => box.left)) - left,
  ];
}

/** A container's padding equals its gaps, in its style and as its children are drawn. */
function expectUniform(element: HTMLElement, what: string, axes: Array<'rowGap' | 'columnGap'> = ['rowGap']): number {
  const { padding, ...gaps } = spacing(element);
  const [first = 0] = padding;
  for (const side of padding) expect(side, `${what}: padding on every side`).toBeCloseTo(first, 1);
  for (const axis of axes) expect(gaps[axis], `${what}: ${axis} equals padding`).toBeCloseTo(first, 1);
  expect(first, `${what}: has padding`).toBeGreaterThan(0);
  for (const [index, inset] of drawnInsets(element).entries()) {
    expect(inset, `${what}: ${inset} px drawn between its ${SIDES[index]} border and its children, ${first} px of padding`).toBeCloseTo(first, 0);
  }
  return first;
}

/** A panel's close button sits the same gap from the top and the end, its corner concentric with the panel's. */
function expectConcentricClose(panel: Element, what: string): void {
  const button = panel.querySelector('.atlas-close-btn')!;
  const outer = panel.getBoundingClientRect();
  const inner = button.getBoundingClientRect();
  const correction = BORDER - drawnBorder(panel);
  const top = inner.top - outer.top + correction;
  const end = outer.right - inner.right + correction;
  expect(top, `${what}: the same gap above and beside the close button`).toBeCloseTo(end, 0);
  const panelRadius = px(getComputedStyle(panel).borderTopRightRadius);
  const buttonRadius = px(getComputedStyle(button).borderTopRightRadius);
  expect(Math.abs(buttonRadius + end - panelRadius), `${what}: close button concentric (${buttonRadius} + ${end} vs ${panelRadius})`).toBeLessThan(TOLERANCE);
}

/**
 * What animated while `act` ran and for a moment after, on elements inside
 * `within`: the properties of Web Animations and CSS transitions, and any
 * style property a script set to more than two values on one element (a
 * tween in JS).
 */
async function animatedWhile(run: () => void | Promise<void>, within = '.atlas-vtt-plugin'): Promise<string[]> {
  const seen = new Map<Element, Map<string, Set<string>>>();
  const props = new Set<string>();
  const note = (): void => {
    for (const animation of document.getAnimations()) {
      const effect = animation.effect;
      if (!(effect instanceof KeyframeEffect) || !effect.target?.closest(within)) continue;
      if (animation instanceof CSSTransition) props.add(animation.transitionProperty);
      else for (const keyframe of effect.getKeyframes()) {
        for (const name of Object.keys(keyframe)) if (!['offset', 'computedOffset', 'easing', 'composite'].includes(name)) props.add(name);
      }
    }
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (!(record.target instanceof HTMLElement) || !record.target.closest(within)) continue;
      const style = record.target.style;
      const values = seen.get(record.target) ?? new Map<string, Set<string>>();
      seen.set(record.target, values);
      for (let index = 0; index < style.length; index++) {
        const name = style.item(index);
        if (name.startsWith('--')) continue;
        const list = values.get(name) ?? new Set<string>();
        list.add(style.getPropertyValue(name));
        values.set(name, list);
      }
    }
  });
  observer.observe(document.body, { attributes: true, attributeFilter: ['style'], subtree: true });
  await act(async () => { await run(); });
  for (let sample = 0; sample < 12; sample++) {
    note();
    await frames(2);
  }
  observer.disconnect();
  for (const values of seen.values()) for (const [name, list] of values) if (list.size > 2) props.add(name);
  return [...props].filter((name) => !ANIMATABLE.has(name));
}

const overlaps = (a: DOMRect, b: DOMRect): boolean => a.left < b.right - TOLERANCE && a.right > b.left + TOLERANCE && a.top < b.bottom - TOLERANCE && a.bottom > b.top + TOLERANCE;
const card = (): DOMRect => document.querySelector('.atlas-sb-pane-card')!.getBoundingClientRect();
const placeOf = (rect: DOMRect): string => `${rect.left.toFixed(1)},${rect.top.toFixed(1)} to ${rect.right.toFixed(1)},${rect.bottom.toFixed(1)}`;

/**
 * Obsidian clips a leaf's content, so a popover keeps inside its leaf
 * (`viewFrame`). The editor's host stands for the leaf here; without one a
 * popover is measured against the window, which is wider than the editor.
 */
function asLeaf(root: HTMLElement): void {
  root.closest('.atlas-statblock-editor')!.classList.add('workspace-leaf');
}

/** The Options shown now: those of the tile selected before may still be fading out beside them. */
const shownOptions = (): HTMLElement | null => [...document.querySelectorAll<HTMLElement>('.atlas-te-options:not([data-closing])')].at(-1) ?? null;
const optionsButton = (): HTMLElement => document.querySelector<HTMLElement>('.atlas-te-toolbar [data-options] button')!;

const OPENERS = ['button', 'key'] as const;

/** Selects a tile and opens its Options: from the toolbar's button, which they then hang from, or with Shift+Enter, where they hang from the tile. */
async function openOptions(id: string, by: typeof OPENERS[number]): Promise<HTMLElement> {
  await act(async () => { frame(id).click(); });
  await frames(2);
  await act(async () => {
    if (by === 'button') optionsButton().click();
    else frame(id).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
  });
  await wait(300);
  return shownOptions()!;
}

async function closeOptions(): Promise<void> {
  await act(async () => { document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  await wait(300);
}

/** The rows of the capsule's ⋯ menu, which opens on a real press. */
async function openCapsuleMenu(): Promise<HTMLElement[]> {
  await userEvent.click(document.querySelector<HTMLElement>('.atlas-te-capsule .atlas-sb-pane-header__more')!);
  await wait(200);
  return [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
}

const NAME: TemplateBlock = { id: 'title001', type: 'title', field: 'name', level: 1 };
const NAME_FIELD: TemplateField = { key: 'name', label: 'Name', type: 'text' };

/** One tile of every kind that has Options, under a header with a line of values. */
function kindsTemplate(): StatblockTemplate {
  const tab = (index: number): TemplateBlock => ({
    id: `tab${index}`, type: 'section', heading: `Level ${index}`, blocks: [{ id: `list${index}`, type: 'entries', field: `level${index}` }],
  });
  return template(
    [
      { id: 'line0001', type: 'line', fields: ['size'] },
      { id: 'number01', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'choice01', type: 'stat', field: 'alignment', look: 'run-in' },
      { id: 'scores01', type: 'scores', field: 'stats', orientation: 'row' },
      { id: 'actions1', type: 'entries', field: 'actions', heading: 'Actions' },
      { id: 'spells01', type: 'tabs', blocks: [tab(0), tab(1)] },
    ],
    [
      NAME_FIELD,
      { key: 'image', label: 'Art', type: 'image' },
      { key: 'size', label: 'Size', type: 'text' },
      { key: 'ac', label: 'Armor class', type: 'number' },
      { key: 'alignment', label: 'Alignment', type: 'choice', options: ['Lawful', 'Neutral', 'Chaotic'] },
      { key: 'stats', label: 'Stats', type: 'scores', slots: ['STR', 'DEX', 'CON'] },
      { key: 'actions', label: 'Actions', type: 'entries' },
      { key: 'level0', label: 'Level 0', type: 'entries' },
      { key: 'level1', label: 'Level 1', type: 'entries' },
    ],
  );
}

/** A card of `count` values, one to a row, which fills most of the view. */
function longTemplate(count: number): StatblockTemplate {
  const fields: TemplateField[] = [NAME_FIELD];
  const blocks: TemplateBlock[] = [NAME];
  for (let index = 0; index < count; index++) {
    fields.push({ key: `f${index}`, label: `Field ${index + 1}`, type: 'number' });
    blocks.push({ id: `value${index}`, type: 'stat', field: `f${index}`, look: 'run-in' });
  }
  return template(blocks, fields);
}

/** An Abilities tile with a tab per spell level: its Options list every tab. */
function spellLevelsTemplate(levels: number): StatblockTemplate {
  const fields: TemplateField[] = [NAME_FIELD];
  const tabs = Array.from({ length: levels }, (_, level): TemplateBlock => {
    fields.push({ key: `level${level}`, label: `Level ${level}`, type: 'entries' });
    return { id: `tab${level}`, type: 'section', heading: `Level ${level}`, blocks: [{ id: `list${level}`, type: 'entries', field: `level${level}` }] };
  });
  return template([NAME, { id: 'spells01', type: 'tabs', blocks: tabs }], fields);
}

describe('the template editor as the note view', () => {
  useEditorStyles();
  afterEach(cleanup);

  it('is the note view\'s row: the note on the left, the panel at its width on the right, under a capsule of one line', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    await frames(3);
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
    expect(note.right).toBeCloseTo(panel.left, 0);
    expect(panel.right).toBeCloseTo(root.getBoundingClientRect().right, 0);
    const capsule = root.querySelector<HTMLElement>('.atlas-te-capsule')!;
    const control = px(getComputedStyle(capsule).getPropertyValue('--input-height')) || 30;
    const inner = capsule.clientHeight - px(getComputedStyle(capsule).paddingTop) - px(getComputedStyle(capsule).paddingBottom);
    expect(inner, 'the capsule holds one line of controls').toBeCloseTo(control, 0);
  });

  it('ends the note\'s text before the dock, with Obsidian\'s file margins written as two values', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    root.style.setProperty('--file-margins', '32px 32px');
    await frames(3);
    const standIn = root.querySelector<HTMLElement>('.atlas-te-note__stand-in')!;
    const dock = root.querySelector('.atlas-te-dock')!.getBoundingClientRect();
    const textEnd = standIn.getBoundingClientRect().right - px(getComputedStyle(standIn).paddingInlineEnd);
    expect(root.querySelector('.atlas-te-note__line')!.getBoundingClientRect().right, 'the text itself ends there too').toBeLessThanOrEqual(textEnd + TOLERANCE);
    expect(textEnd, 'the text ends before the dock').toBeLessThanOrEqual(dock.left);
  });

  it('keeps the capsule on one line at every panel width from 320 px', async () => {
    const root = mount(new FakeSession(sampleTemplate(), { name: 'A template with a rather long name indeed' }), 1180);
    for (const width of [960, 600, 420, 360, 320]) {
      root.querySelector<HTMLElement>('.atlas-sb-note-panel')!.style.setProperty('--atlas-sb-panel-width', `${width}px`);
      root.querySelector<HTMLElement>('.atlas-sb-note-panel')!.style.width = `${width}px`;
      await wait(60);
      const capsule = root.querySelector<HTMLElement>('.atlas-te-capsule')!;
      // Centred on one line: every part's middle at the same height.
      const middles = new Set([...capsule.children].map((child) => {
        const box = child.getBoundingClientRect();
        return Math.round(box.top + box.height / 2);
      }));
      expect(middles.size, `one line at ${width}px`).toBe(1);
      expect(capsule.scrollWidth, `nothing hangs out at ${width}px`).toBeLessThanOrEqual(capsule.clientWidth + 1);
    }
  });

  it('stands the dock in the note column beside the line to the card, halfway down it, at every width that has two columns', async () => {
    for (const width of [1400, 900, 720]) {
      const root = mount(new FakeSession(sampleTemplate()), width);
      await frames(3);
      const dock = root.querySelector('.atlas-te-dock')!.getBoundingClientRect();
      const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
      const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
      expect(overlaps(dock, card()), `the dock at ${width}px`).toBe(false);
      expect(panel.left - dock.right, `the dock's room to the panel's edge at ${width}px`).toBeCloseTo(8, 0);
      expect(dock.left, `the dock inside the note column at ${width}px`).toBeGreaterThanOrEqual(note.left);
      expect((dock.top + dock.bottom) / 2, `the dock halfway down the line at ${width}px`).toBeCloseTo((panel.top + panel.bottom) / 2, 0);
      // The line is the panel's resize handle: the dock leaves it free.
      expect(overlaps(dock, root.querySelector('.atlas-sb-note-panel__handle')!.getBoundingClientRect()), `the dock over the resize handle at ${width}px`).toBe(false);
      cleanup();
    }
  });

  it('opens the dock\'s tooltips to its left, over neither its own buttons nor the card', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1280);
    await frames(3);
    const dock = root.querySelector<HTMLElement>('.atlas-te-dock')!;
    await userEvent.hover(dock.querySelector<HTMLElement>('[data-item="block:scores"] button')!);
    await expect.poll(() => document.querySelector('.tooltip-inner'), { timeout: 2000 }).not.toBeNull();
    await wait(200);
    const tip = document.querySelector('.tooltip-inner')!.getBoundingClientRect();
    expect(tip.right, 'the tooltip ends before the dock').toBeLessThanOrEqual(dock.getBoundingClientRect().left);
    expect(overlaps(tip, card())).toBe(false);
  });

  it('keeps the dock beside the panel\'s edge while the panel is resized', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1400);
    await frames(3);
    const gap = (): number => root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect().left - root.querySelector('.atlas-te-dock')!.getBoundingClientRect().right;
    const before = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect().left;
    // Held, not let go: the width follows the pointer while the edge is dragged (far enough to pass the width the room caps the panel at).
    const handle = root.querySelector<HTMLElement>('.atlas-sb-note-panel__handle')!;
    const at = pointIn(handle);
    const send = (target: EventTarget, type: string, x: number): void => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: at.y, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0 }));
    };
    await act(async () => {
      send(handle, 'pointerdown', at.x);
      send(window, 'pointermove', at.x + 320);
    });
    await frames(3);
    expect(root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect().left, 'the panel shrank').toBeGreaterThan(before + 60);
    expect(gap()).toBeCloseTo(8, 0);
    await act(async () => { send(window, 'pointerup', at.x + 320); });
  });

  it('pads the dock as much as it spaces its buttons', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    await frames(3);
    expectUniform(root.querySelector<HTMLElement>('.atlas-te-dock')!, 'dock');
  });

  it('rounds the dock\'s end buttons with its ends: a capsule, their outer corners concentric with it', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 1180);
    await frames(3);
    const dock = root.querySelector<HTMLElement>('.atlas-te-dock')!;
    const outer = dock.getBoundingClientRect();
    const style = getComputedStyle(dock);
    // Half its width or more makes a capsule: the border's width is in the radius, and the browser draws a 1.5 px border on whole pixels.
    expect(px(style.borderTopLeftRadius), 'the dock is a capsule').toBeGreaterThanOrEqual(outer.width / 2);
    expect(px(style.borderTopLeftRadius), 'the dock is a capsule').toBeLessThanOrEqual(outer.width / 2 + 1);
    const buttons = [...dock.querySelectorAll<HTMLElement>('button')];
    const ends = [
      { button: buttons[0]!, corners: ['borderTopLeftRadius', 'borderTopRightRadius'], what: 'the first button' },
      { button: buttons.at(-1)!, corners: ['borderBottomLeftRadius', 'borderBottomRightRadius'], what: 'the last button' },
    ] as const;
    for (const { button, corners, what } of ends) {
      const inner = button.getBoundingClientRect();
      const gap = inner.left - outer.left;
      // A capsule's end control caps its corner at half its own height.
      const concentric = Math.min(outer.width / 2 - gap, inner.height / 2);
      for (const corner of corners) {
        const radius = px(getComputedStyle(button)[corner]);
        expect(radius, `${what}: ${corner} ${radius} px, ${gap} px inside a ${outer.width / 2} px end`).toBeCloseTo(concentric, 0);
      }
    }
  });

  it('stands the card above the note below 720 px, with the dock\'s kinds in the capsule\'s menu', async () => {
    const root = mount(new FakeSession(sampleTemplate()), 719);
    await frames(3);
    const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
    const note = root.querySelector('.atlas-te-note')!.getBoundingClientRect();
    expect(panel.bottom).toBeLessThanOrEqual(note.top + TOLERANCE);
    expect(root.querySelector('.atlas-te-dock')).toBeNull();
    expect(card().width).toBeGreaterThanOrEqual(320);
    const rows = (await openCapsuleMenu()).map((row) => row.textContent);
    expect(rows.slice(0, 6)).toEqual(['Add value', 'Add metric', 'Add abilities', 'Add table', 'Add text', 'Add divider']);
  });

  it('keeps the block toolbar on its block when a conflict bar opens above the card and when it goes', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1180);
    await act(async () => { frame('stat-hp1').click(); });
    await frames(2);
    const toolbar = (): DOMRect => document.querySelector('.atlas-te-toolbar')!.getBoundingClientRect();
    const offset = (): number => toolbar().top - frame('stat-hp1').getBoundingClientRect().top;
    const resting = offset();
    const blockTop = frame('stat-hp1').getBoundingClientRect().top;
    await act(async () => { session.patch({ conflict: 'changed', saveState: 'conflict' }); });
    await frames(3);
    expect(frame('stat-hp1').getBoundingClientRect().top, 'the bar moved the card down').toBeGreaterThan(blockTop + 10);
    expect(offset()).toBeCloseTo(resting, 0);
    await act(async () => { session.patch({ conflict: null, saveState: 'saved' }); });
    await frames(3);
    expect(offset()).toBeCloseTo(resting, 0);
  });

  it('pads a tile\'s Options as much as they space their rows, 320 px wide, for every kind that has them', async () => {
    mount(new FakeSession(kindsTemplate()), 1180);
    await frames(3);
    for (const id of ['line0001', 'number01', 'choice01', 'scores01', 'actions1', 'spells01']) {
      const options = await openOptions(id, 'key');
      expect(options.querySelector('.atlas-te-options__panel')!.getBoundingClientRect().width, `${id}: width`).toBeCloseTo(320, 0);
      const groups = [...options.querySelectorAll<HTMLElement>('.atlas-te-group')];
      expect(groups, `${id}: one group of rows`).toHaveLength(1);
      expectUniform(groups[0]!, `the Options of ${id}`, ['rowGap', 'columnGap']);
      await closeOptions();
    }
  });

  it('stands a tile\'s Options beside the card at the tile\'s height, clear of the dock where the note\'s column has the room, from the toolbar and by key', async () => {
    for (const width of [1280, 900, 720]) {
      for (const id of ['stat-ac1', 'stat-cr1']) {
        for (const by of OPENERS) {
          const root = mount(new FakeSession(sampleTemplate()), width);
          await frames(3);
          const options = (await openOptions(id, by)).getBoundingClientRect();
          const view = root.getBoundingClientRect();
          const panel = root.querySelector('.atlas-sb-note-panel')!.getBoundingClientRect();
          const dock = root.querySelector('.atlas-te-dock')!.getBoundingClientRect();
          const what = `the Options of ${id} at ${width}px, by ${by} (${placeOf(options)})`;
          expect(options.width, `${what}: one width`).toBeCloseTo(320, 0);
          expect(options.right, `${what}: left of the card`).toBeLessThanOrEqual(panel.left);
          expect(options.top, `${what}: at the tile's height`).toBeCloseTo(frame(id).getBoundingClientRect().top, 0);
          expect(options.left, `${what}: inside the view's left edge`).toBeGreaterThanOrEqual(view.left);
          expect(options.bottom, `${what}: inside the view's bottom edge`).toBeLessThanOrEqual(view.bottom);
          // The rule: left of the dock where 320 px and its margins fit there, over the dock where they do not.
          const roomBesideDock = dock.left - 8 - options.width >= view.left + 8;
          expect(overlaps(options, dock), `${what}: over the dock`).toBe(!roomBesideDock);
          cleanup();
        }
      }
    }
  });

  it('puts the Options below the tile and its toolbar where the card stands above the note, inside the view', async () => {
    for (const width of [500, 340]) {
      for (const id of ['stat-ac1', 'stat-cr1']) {
        for (const by of OPENERS) {
          const root = mount(new FakeSession(sampleTemplate()), width);
          await frames(3);
          const options = (await openOptions(id, by)).getBoundingClientRect();
          const view = root.getBoundingClientRect();
          const what = `the Options of ${id} at ${width}px, by ${by} (${placeOf(options)})`;
          expect(options.top, `${what}: below the tile`).toBeGreaterThanOrEqual(frame(id).getBoundingClientRect().bottom);
          expect(overlaps(options, document.querySelector('.atlas-te-toolbar')!.getBoundingClientRect()), `${what}: over the toolbar`).toBe(false);
          expect(options.left, `${what}: inside the view's left edge`).toBeGreaterThanOrEqual(view.left);
          expect(options.right, `${what}: inside the view's right edge`).toBeLessThanOrEqual(view.right);
          expect(options.bottom, `${what}: inside the view's bottom edge`).toBeLessThanOrEqual(view.bottom);
          cleanup();
        }
      }
    }
  });

  it('shows the Options whole, without scrolling, for every tile down a long card: they slide up rather than leave the view', async () => {
    for (const id of ['value0', 'value10', 'value17', 'value19']) {
      for (const by of OPENERS) {
        const root = mount(new FakeSession(longTemplate(20)), 1180);
        await frames(3);
        const shown = await openOptions(id, by);
        const options = shown.getBoundingClientRect();
        const panel = shown.querySelector<HTMLElement>('.atlas-te-options__panel')!;
        const tile = frame(id).getBoundingClientRect();
        const view = root.getBoundingClientRect();
        const what = `the Options of ${id}, by ${by} (${placeOf(options)})`;
        expect(tile.bottom, `${id} shows without scrolling`).toBeLessThan(view.bottom);
        expect(overlaps(options, tile), `${what}, over their tile (${placeOf(tile)})`).toBe(false);
        expect(options.top, `${what}: inside the view's top edge`).toBeGreaterThanOrEqual(view.top);
        expect(options.bottom, `${what}: inside the view's bottom edge`).toBeLessThanOrEqual(view.bottom);
        expect(panel.scrollHeight, `${what}: nothing to scroll`).toBeLessThanOrEqual(panel.clientHeight);
        cleanup();
      }
    }
  });

  it('shows ten tabs\' Options whole, and scrolls down, never sideways, only where they are taller than the editor, their border whole', async () => {
    const whole = mount(new FakeSession(spellLevelsTemplate(10)), 1180);
    await frames(3);
    const ten = (await openOptions('spells01', 'button')).querySelector<HTMLElement>('.atlas-te-options__panel')!;
    expect(ten.scrollHeight, 'ten tabs fit the editor').toBeLessThanOrEqual(ten.clientHeight);
    expect(ten.getBoundingClientRect().bottom).toBeLessThanOrEqual(whole.getBoundingClientRect().bottom);
    cleanup();

    const root = mount(new FakeSession(spellLevelsTemplate(24)), 1180);
    await frames(3);
    const options = await openOptions('spells01', 'button');
    const panel = options.querySelector<HTMLElement>('.atlas-te-options__panel')!;
    const view = root.getBoundingClientRect();
    const border = panel.getBoundingClientRect();
    expect(panel.scrollHeight, 'twenty-four tabs are taller than the editor').toBeGreaterThan(view.height);
    expect(border.top, 'its top border shows inside the editor').toBeGreaterThanOrEqual(view.top);
    expect(border.bottom, `its bottom border (${border.bottom}) shows inside the editor (${view.bottom})`).toBeLessThanOrEqual(view.bottom);
    expect(border.height, 'it takes the editor\'s whole height before it scrolls').toBeCloseTo(view.height - 16, 0);
    expect(options.getBoundingClientRect().width, 'the scrollbar runs inside the border').toBeCloseTo(border.width, 0);
    expect(panel.scrollWidth, 'nothing to scroll sideways').toBeLessThanOrEqual(panel.clientWidth);
    expect(getComputedStyle(panel).overflowX).toBe('hidden');
    // The last tab is reached by scrolling down.
    panel.scrollTop = panel.scrollHeight;
    await frames(2);
    const last = [...panel.querySelectorAll<HTMLElement>('input')].at(-1)!.getBoundingClientRect();
    expect(last.bottom, 'the last tab\'s name shows once scrolled').toBeLessThanOrEqual(border.bottom);
  });

  it('shows every option of a select in the Options, whole and on top: below its trigger, or above it for a tile near the editor\'s foot', async () => {
    for (const id of ['value0', 'value19']) {
      const root = mount(new FakeSession(longTemplate(20)), 1180);
      asLeaf(root);
      await frames(3);
      const options = await openOptions(id, 'key');
      const trigger = options.querySelector<HTMLElement>('.atlas-select-trigger')!;
      const placedAt = options.getBoundingClientRect().top;
      await userEvent.click(trigger);
      await wait(250);
      const list = options.querySelector<HTMLElement>('.atlas-select-content')!;
      const view = root.getBoundingClientRect();
      const rows = [...list.querySelectorAll<HTMLElement>('[role="option"]')];
      expect(rows.length, `${id}: the kinds`).toBe(7);
      expect(list.scrollHeight, `${id}: the list shows without scrolling`).toBeLessThanOrEqual(list.clientHeight);
      for (const row of rows) {
        const box = row.getBoundingClientRect();
        const what = `${id}: ${row.textContent} (${placeOf(box)})`;
        expect(box.top, `${what} inside the editor's top`).toBeGreaterThanOrEqual(view.top);
        expect(box.bottom, `${what} inside the editor's foot`).toBeLessThanOrEqual(view.bottom);
        // Nothing clips or covers it: what is drawn at its middle is the row itself.
        const drawn = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
        expect(drawn !== null && row.contains(drawn), `${what} is what shows there`).toBe(true);
      }
      const up = list.getBoundingClientRect().bottom <= trigger.getBoundingClientRect().top;
      expect(up, `${id}: the list opens ${id === 'value19' ? 'above' : 'below'} its trigger`).toBe(id === 'value19');
      // The Options stay where they were: a list opening moves nothing under the pointer.
      expect(shownOptions()!.getBoundingClientRect().top).toBeCloseTo(placedAt, 0);
      cleanup();
    }
  });

  it('animates only transform and opacity: the toolbar, the Options, a tile added from the dock, the save dialog', async () => {
    mount(new FakeSession(sampleTemplate()), 1180);
    await frames(2);
    expect(await animatedWhile(() => frame('stat-ac1').click()), 'selecting a tile').toEqual([]);
    expect(await animatedWhile(() => optionsButton().click()), 'the Options opening').toEqual([]);
    expect(shownOptions(), 'the Options are open').not.toBeNull();
    expect(await animatedWhile(() => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    }), 'the Options closing').toEqual([]);
    expect(shownOptions(), 'the Options are closed').toBeNull();
    const addValue = document.querySelector<HTMLElement>('.atlas-te-dock [data-item="block:stat"] button')!;
    expect(await animatedWhile(() => addValue.click()), 'a tile added from the dock').toEqual([]);
    // A tile exists once named: named, it makes Save the capsule's to press. The dialog's own motion: the button behind it leaves its pressed look meanwhile.
    await userEvent.keyboard('Strength{Enter}');
    await frames(2);
    const save = document.querySelector<HTMLElement>('.atlas-te-capsule__save')!;
    expect(await animatedWhile(() => save.click(), '.atlas-te-dialog-overlay'), 'the save dialog opening').toEqual([]);
    expect(document.querySelector('.atlas-te-dialog')).not.toBeNull();
  });

  it('puts Save beside ⋯ at the capsule\'s end, the name alone at its start', async () => {
    mount(new FakeSession(sampleTemplate()), 1180);
    await frames(2);
    const capsule = document.querySelector<HTMLElement>('.atlas-te-capsule')!.getBoundingClientRect();
    const name = document.querySelector<HTMLElement>('.atlas-te-capsule__name')!.getBoundingClientRect();
    const save = document.querySelector<HTMLElement>('.atlas-te-capsule__save')!.getBoundingClientRect();
    const more = document.querySelector<HTMLElement>('.atlas-te-capsule .atlas-sb-pane-header__more')!.getBoundingClientRect();
    const gap = Number.parseFloat(getComputedStyle(document.querySelector<HTMLElement>('.atlas-te-capsule')!).paddingRight);
    expect(more.right).toBeCloseTo(capsule.right - gap - 1, 0);
    expect(more.left - save.right).toBeCloseTo(gap, 0);
    expect(save.height).toBeCloseTo(more.height, 0);
    expect(save.top).toBeCloseTo(more.top, 0);
    expect(save.left - name.right).toBeGreaterThan(gap);
  });

  it('keeps the save dialog\'s close button concentric', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session, 1180);
    await frames(2);
    act(() => session.apply((current) => ({ ...current, description: 'Changed' })));
    await act(async () => { document.querySelector<HTMLElement>('.atlas-te-capsule__save')!.click(); });
    await wait(400);
    expectConcentricClose(document.querySelector('.atlas-te-dialog')!, 'Save Test template');
  });
});

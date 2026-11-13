// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { groupable, ungroupable } from '../../../src/app/annotations/annotationGroups';
import type { DrawingInput, TextInput } from '../../../src/app/annotations/annotationTypes';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import { getHistoryStore } from '../../../src/app/stores/history';
import { drawScene, type DrawScene } from '../../helpers/drawScene';

const openContextMenuGlobal = vi.hoisted(() => vi.fn<(entries: ContextMenuEntry[], at: { x: number; y: number }) => boolean>(() => true));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));
// jsdom draws no glyphs: the turn handle's never arrives
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));

type Point = { x: number; y: number };
const pt = (x: number, y: number): Point => ({ x, y });
const line = (y: number, more: Partial<DrawingInput> = {}): DrawingInput => ({ type: 'pen', points: [pt(100, y), pt(300, y)], color: '#ffffff', width: 4, opacity: 1, ...more });
const label = (y: number, more: Partial<TextInput> = {}): TextInput => ({ x: 500, y, text: 'Vault', fontSize: 24, fontFamily: 'Arial', color: '#ffffff', ...more });

let current: DrawScene | undefined;
beforeEach(() => openContextMenuGlobal.mockClear());
afterEach(() => {
  current?.destroy();
  current = undefined;
});

/** A scene in the Draw tool's Select mode holding what `fill` adds, its history empty. */
function scene(fill: (s: DrawScene) => string[]): { s: DrawScene; ids: string[] } {
  const s = current = drawScene();
  const ids = fill(s);
  getHistoryStore(s.store)!.getState().clear();
  s.store.getState().clearSelection();
  s.tool({ mode: 'select' });
  return { s, ids };
}

const steps = (s: DrawScene): number => getHistoryStore(s.store)!.getState().pastStates.length;
const undo = (s: DrawScene): void => getHistoryStore(s.store)!.getState().undo();
const groupOf = (s: DrawScene, id: string): string | undefined => (s.store.getState().objects.drawings[id] ?? s.store.getState().objects.texts[id])?.group;
const choose = (name: string): void => {
  const entry = (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? []).find((row) => row.type === 'item' && row.label === name);
  if (entry?.type === 'item' && !entry.disabled) entry.onClick();
};
const offered = (name: string): boolean => (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? []).some((row) => row.type === 'item' && row.label === name && !row.disabled);

describe('grouping drawings and texts', () => {
  it('says when there is something to group and to ungroup', () => {
    expect(groupable([{}, {}])).toBe(true);
    expect(groupable([{}])).toBe(false);
    expect(groupable([{ group: 'a' }, { group: 'a' }])).toBe(false);
    expect(groupable([{ group: 'a' }, { group: 'b' }])).toBe(true);
    expect(groupable([{ group: 'a' }, {}])).toBe(true);
    expect(groupable([{}, { locked: true }])).toBe(false);
    expect(ungroupable([{}, {}])).toBe(false);
    expect(ungroupable([{ group: 'a' }])).toBe(true);
    expect(ungroupable([{ group: 'a', locked: true }, {}])).toBe(false);
  });

  it('gives what is selected one new group, merging the groups it held, in one undo step', () => {
    const { s, ids } = scene((made) => {
      const { addDrawing, addText } = made.store.getState();
      return [addDrawing(line(100, { group: 'walls' })), addDrawing(line(200, { group: 'walls' })), addDrawing(line(300, { group: 'doors' })), addText(label(400))];
    });
    s.store.getState().groupAnnotations(ids);
    const group = groupOf(s, ids[0]!);
    expect(group).toMatch(/^group_/);
    expect(ids.map((id) => groupOf(s, id))).toEqual([group, group, group, group]);
    expect(steps(s)).toBe(1);
    // One group already: nothing to write.
    s.store.getState().groupAnnotations(ids);
    expect(steps(s)).toBe(1);
    undo(s);
    expect(ids.map((id) => groupOf(s, id))).toEqual(['walls', 'walls', 'doors', undefined]);
  });

  it('takes the group off again, in one undo step', () => {
    const { s, ids } = scene((made) => [made.store.getState().addDrawing(line(100, { group: 'room' })), made.store.getState().addText(label(200, { group: 'room' })), made.store.getState().addDrawing(line(300))]);
    s.store.getState().ungroupAnnotations(ids);
    expect(ids.map((id) => groupOf(s, id))).toEqual([undefined, undefined, undefined]);
    expect(s.store.getState().objects.drawings[ids[0]!]).not.toHaveProperty('group');
    expect(steps(s)).toBe(1);
    s.store.getState().ungroupAnnotations(ids);
    expect(steps(s)).toBe(1);
    undo(s);
    expect(groupOf(s, ids[1]!)).toBe('room');
  });

  it('leaves a locked one as it is, and needs two others to make a group', () => {
    const { s, ids } = scene((made) => [made.store.getState().addDrawing(line(100, { group: 'old', locked: true })), made.store.getState().addDrawing(line(200, { group: 'old' })), made.store.getState().addDrawing(line(300))]);
    s.store.getState().groupAnnotations(ids.slice(0, 2));
    expect(steps(s)).toBe(0);
    s.store.getState().groupAnnotations(ids);
    expect(groupOf(s, ids[0]!)).toBe('old');
    expect(groupOf(s, ids[1]!)).toBe(groupOf(s, ids[2]!));
    expect(groupOf(s, ids[1]!)).not.toBe('old');
    s.store.getState().ungroupAnnotations(ids);
    expect(ids.map((id) => groupOf(s, id))).toEqual(['old', undefined, undefined]);
    expect(steps(s)).toBe(2);
  });

  it('groups and ungroups from the menu, each offered only where it changes something', () => {
    const { s, ids } = scene((made) => [made.store.getState().addDrawing(line(100)), made.store.getState().addDrawing(line(200))]);
    s.press(200, 100, { button: 2 });
    expect([offered('Group'), offered('Ungroup')]).toEqual([false, false]);
    s.store.getState().setSelection(ids);
    s.press(200, 100, { button: 2 });
    expect([offered('Group'), offered('Ungroup')]).toEqual([true, false]);
    choose('Group');
    expect(groupOf(s, ids[0]!)).toBe(groupOf(s, ids[1]!));
    expect(steps(s)).toBe(1);
    // A right-click on one member of the group finds both.
    s.store.getState().clearSelection();
    s.press(200, 200, { button: 2 });
    expect([...s.store.getState().selectedIds].sort()).toEqual([...ids].sort());
    expect([offered('Group'), offered('Ungroup')]).toEqual([false, true]);
    choose('Ungroup');
    expect(groupOf(s, ids[0]!)).toBeUndefined();
    expect(steps(s)).toBe(2);
  });

  it('selects, moves, hides, layers, orders, copies and deletes a group as one', () => {
    const { s, ids } = scene((made) => {
      const { addDrawing, addText } = made.store.getState();
      return [addDrawing(line(100)), addText(label(100)), addDrawing(line(300))];
    });
    const [stroke, text, other] = ids as [string, string, string];
    s.store.getState().groupAnnotations([stroke, text]);
    s.store.getState().clearSelection();
    const before = steps(s);
    // A press on the stroke takes the text with it, and a drag moves both in one step.
    s.pull([[200, 100], [220, 130], [240, 160]]);
    expect(s.store.getState().selectedIds).toEqual([stroke, text]);
    expect(s.store.getState().objects.drawings[stroke]!.points[0]).toEqual(pt(140, 160));
    expect(s.store.getState().objects.texts[text]).toMatchObject({ x: 540, y: 160 });
    expect(s.store.getState().objects.drawings[other]!.points[0]).toEqual(pt(100, 300));
    expect(steps(s)).toBe(before + 1);
    // The menu's rows change both.
    s.press(240, 160, { button: 2 });
    choose('Hide from players');
    s.press(240, 160, { button: 2 });
    choose('On the map');
    for (const entry of [s.store.getState().objects.drawings[stroke]!, s.store.getState().objects.texts[text]!]) expect(entry).toMatchObject({ hidden: true, layer: 'map' });
    s.press(240, 160, { button: 2 });
    choose('To back');
    const order = (id: string): number => (s.store.getState().objects.drawings[id] ?? s.store.getState().objects.texts[id])!.order ?? 0;
    expect(Math.max(order(stroke), order(text))).toBeLessThan(order(other));
    // Copies are a group of their own.
    s.press(240, 160, { button: 2 });
    choose('Duplicate');
    const copies = s.store.getState().selectedIds;
    expect(copies).toHaveLength(2);
    const copied = copies.map((id) => groupOf(s, id));
    expect(copied[0]).toBe(copied[1]);
    expect(copied[0]).not.toBe(groupOf(s, stroke));
    // Deleted from one press on one of them.
    s.store.getState().clearSelection();
    s.press(240, 160, { button: 2 });
    choose('Delete');
    expect(s.store.getState().objects.drawings[stroke]).toBeUndefined();
    expect(s.store.getState().objects.texts[text]).toBeUndefined();
    expect(s.store.getState().objects.drawings[other]).toBeDefined();
  });
});

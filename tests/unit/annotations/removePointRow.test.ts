// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DrawingInput } from '../../../src/app/annotations/annotationTypes';
import type { ContextMenuEntry } from '../../../src/app/react/root/ContextMenuContext';
import { getHistoryStore } from '../../../src/app/stores/history';
import { drawScene, type DrawScene } from '../../helpers/drawScene';

const openContextMenuGlobal = vi.hoisted(() => vi.fn<(entries: ContextMenuEntry[], at: { x: number; y: number }) => boolean>(() => true));
vi.mock('../../../src/app/react/root/ContextMenuContext', () => ({ openContextMenuGlobal }));
vi.mock('../../../src/app/pixi/rotateHandleLook', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/app/pixi/rotateHandleLook')>()),
  rotateIconTexture: () => new Promise(() => undefined),
}));
// The device's pointer: the test's to change.
const device = vi.hoisted(() => ({ coarse: false }));
vi.mock('../../../src/app/platform/deviceProfile', async (original) => {
  const actual = await original<typeof import('../../../src/app/platform/deviceProfile')>();
  return { ...actual, deviceProfile: () => ({ ...actual.deviceProfile(), pointer: device.coarse ? 'coarse' as const : 'fine' as const }) };
});

type Point = { x: number; y: number };
const pt = (x: number, y: number): Point => ({ x, y });
const line = (points: Point[]): DrawingInput => ({ type: 'line', points, color: '#ffffff', width: 4, opacity: 1 });

let current: DrawScene | undefined;
beforeEach(() => openContextMenuGlobal.mockClear());
afterEach(() => {
  current?.destroy();
  current = undefined;
  device.coarse = false;
});

/** A line of three points, selected with the move tool in hand: it shows its points. */
function scene(points: Point[] = [pt(100, 100), pt(300, 100), pt(300, 300)]): DrawScene {
  const s = current = drawScene();
  const id = s.store.getState().addDrawing(line(points));
  getHistoryStore(s.store)!.getState().clear();
  s.store.getState().setActiveTool('move');
  s.store.getState().setSelection([id]);
  return s;
}

const rows = (): string[] => (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? []).flatMap((entry) => (entry.type === 'item' ? [entry.label] : []));
const choose = (name: string): void => {
  const row = (openContextMenuGlobal.mock.calls.at(-1)?.[0] ?? []).find((entry) => entry.type === 'item' && entry.label === name);
  if (row?.type === 'item') void row.onClick?.();
};

describe('a line\'s point under a finger', () => {
  it('goes by the first row of the menu a long press on it opens, in one undo step', () => {
    device.coarse = true;
    const s = scene();
    expect(s.press(300, 100, { button: 2 })).toBe(true);
    expect(rows()[0]).toBe('Remove point');
    choose('Remove point');
    expect(s.drawings()[0]?.points).toEqual([pt(100, 100), pt(300, 300)]);
    expect(getHistoryStore(s.store)!.getState().pastStates).toHaveLength(1);
  });

  it('has no such row beside its points, nor where the line has no point to spare', () => {
    device.coarse = true;
    const s = scene();
    s.press(200, 100, { button: 2 });
    expect(rows()).not.toContain('Remove point');
    s.destroy();
    const two = scene([pt(100, 100), pt(300, 100)]);
    two.press(300, 100, { button: 2 });
    expect(rows().length).toBeGreaterThan(0);
    expect(rows()).not.toContain('Remove point');
  });

  it('is not offered to a mouse, which has the double click and Delete', () => {
    const s = scene();
    s.press(300, 100, { button: 2 });
    expect(rows().length).toBeGreaterThan(0);
    expect(rows()).not.toContain('Remove point');
  });
});

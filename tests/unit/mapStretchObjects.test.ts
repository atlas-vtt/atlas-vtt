import { beforeEach, describe, expect, it } from 'vitest';
import { objectsMovedWithMap } from '../../src/app/grid/mapStretchObjects';
import { movedWithMap, NO_STRETCH } from '../../src/app/grid/mapStretch';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import type { GridState } from '../../src/app/types/gridTypes';

const GRID: GridState = { enabled: true, visible: true, type: 'square', size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 };
/** A map drawn 10 % wider: every point's x grows by a tenth. */
const WIDER = movedWithMap({ width: 1000, height: 1000 }, NO_STRETCH, { x: 1.1, y: 1 });

describe('objects on a map that is drawn another way', () => {
  let store: ViewAtlasStore;

  beforeEach(() => {
    store = createViewAtlasStore(createInMemoryApp().app, 'map-stretch-objects-test');
    store.getState().setPersistenceEnabled(false);
    store.getState().setGrid(GRID);
  });

  it('moves every kind of object with the map and leaves its other fields alone', () => {
    const s = store.getState();
    const token = s.addToken({ x: 100, y: 200, imagePath: 'a.png', size: 2 } as Parameters<typeof s.addToken>[0]);
    const wall = s.addWall({ type: 'door', p1: { x: 100, y: 0 }, p2: { x: 200, y: 50 }, closed: true });
    const light = s.addLight({ x: 300, y: 300, emission: { bright: 10, dim: 20, color: '#ffffff', intensity: 1, animation: 'none' } } as Parameters<typeof s.addLight>[0]);
    const zone = s.addLightZone({ polygon: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], ambient: 0.2 } as Parameters<typeof s.addLightZone>[0]);
    const stroke = s.addFogOperation({ type: 'brush', isErasing: false, points: [{ x: 10, y: 10 }, { x: 20, y: 30 }], brushRadius: 40, offsetX: 5, offsetY: 7 });
    const rect = s.addFogOperation({ type: 'rectangle', isErasing: true, x: 100, y: 100, width: 200, height: 50 });

    const moved = objectsMovedWithMap(store.getState().objects, WIDER);

    expect(moved.tokens[token]).toMatchObject({ x: 110, y: 200, size: 2, imagePath: 'a.png' });
    expect(moved.walls[wall]).toMatchObject({ type: 'door', closed: true, p1: { x: 110, y: 0 }, p2: { x: 220, y: 50 } });
    expect(moved.lights[light]).toMatchObject({ x: 330, y: 300 });
    expect(moved.lightZones![zone]!.polygon.map((p) => p.x)).toEqual([0, 110, 110].map((x) => expect.closeTo(x, 9)));
    // A dragged fog shape lies at its points plus its offset, and is moved as it lies.
    const brush = moved.fog[stroke]!;
    expect(brush).toMatchObject({ type: 'brush', brushRadius: 40, points: [{ x: expect.closeTo(16.5, 9), y: 17 }, { x: expect.closeTo(27.5, 9), y: 37 }] });
    expect(brush.offsetX).toBeUndefined();
    expect(moved.fog[rect]).toMatchObject({ type: 'rectangle', isErasing: true, x: expect.closeTo(110, 9), y: expect.closeTo(100, 9), width: expect.closeTo(220, 9), height: expect.closeTo(50, 9) });
    // The scene's own objects are untouched.
    expect(store.getState().objects.tokens[token]).toMatchObject({ x: 100, y: 200 });
  });

  it('leaves a scene without light zones without them', () => {
    expect('lightZones' in objectsMovedWithMap(store.getState().objects, WIDER)).toBe(false);
  });

  it('aligns the grid and moves the objects in one undo step', () => {
    const s = store.getState();
    const token = s.addToken({ x: 100, y: 200, imagePath: 'a.png' } as Parameters<typeof s.addToken>[0]);
    const before = store.temporal.getState().pastStates.length;
    const aligned: GridState = { ...GRID, type: 'hex-vertical', size: 64, mapStretch: { x: 1.1, y: 1 } };

    store.getState().alignGrid(aligned, WIDER);

    expect(store.getState().grid).toEqual(aligned);
    expect(store.getState().objects.tokens[token]).toMatchObject({ x: 110, y: 200 });
    expect(store.temporal.getState().pastStates.length).toBe(before + 1);

    store.temporal.getState().undo();
    expect(store.getState().grid).toEqual(GRID);
    expect(store.getState().objects.tokens[token]).toMatchObject({ x: 100, y: 200 });

    store.temporal.getState().redo();
    expect(store.getState().grid).toEqual(aligned);
    expect(store.getState().objects.tokens[token]).toMatchObject({ x: 110, y: 200 });
  });

  it('sets the grid alone where the map stays as it is drawn', () => {
    const s = store.getState();
    const token = s.addToken({ x: 100, y: 200, imagePath: 'a.png' } as Parameters<typeof s.addToken>[0]);
    const objects = store.getState().objects;

    store.getState().alignGrid({ ...GRID, size: 64 });

    expect(store.getState().grid?.size).toBe(64);
    expect(store.getState().objects).toBe(objects);
    expect(store.getState().objects.tokens[token]).toMatchObject({ x: 100, y: 200 });
  });
});

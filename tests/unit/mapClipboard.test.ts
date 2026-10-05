import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { waitFor } from '@testing-library/react';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { getDataFilePath } from '../../src/app/utils/dataFileMigration';
import { copySelection, cutSelection, duplicateSelection, pasteClipboard } from '../../src/app/clipboard/mapClipboardActions';
import type { GridState } from '../../src/app/types/gridTypes';
import type { TokenEntity } from '../../src/app/types';

const SQUARE: GridState = { enabled: true, type: 'square', size: 50, offsetX: 0, offsetY: 0, opacity: 1 };
const HEX: GridState = { enabled: true, type: 'hex-vertical', size: 60, offsetX: 0, offsetY: 0, opacity: 1 };
const NO_GRID: GridState = { ...SQUARE, enabled: false };

let systemClipboard = '';

beforeEach(() => {
  systemClipboard = '';
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: {
      writeText: async (text: string) => { systemClipboard = text; },
      readText: async () => systemClipboard,
    },
  });
});
afterEach(() => vi.unstubAllGlobals());

let storeCount = 0;
function createStore(grid: GridState = SQUARE) {
  const { app, files } = createInMemoryApp();
  const store = createViewAtlasStore(app, `clipboard-test-${storeCount++}`);
  store.getState().setGrid(grid);
  return { store, files };
}

function addGoblin(store: ReturnType<typeof createStore>['store'], x: number, y: number): string {
  return store.getState().addToken({ kind: 'character', x, y, imagePath: 'goblin.png', name: 'Goblin', resources: { hp: { current: 7, max: 7 } }, conditions: ['prone'] } as never);
}

function tokenAt(store: ReturnType<typeof createStore>['store'], id: string): TokenEntity {
  return store.getState().objects.tokens[id]!;
}

function undoSteps(store: ReturnType<typeof createStore>['store']): number {
  return getHistoryStore(store)!.getState().pastStates.length;
}

describe('map copy, paste and duplicate', () => {
  it('duplicates a group one cell away as a single undo step and selects the copies', () => {
    const { store } = createStore();
    const a = addGoblin(store, 25, 25);
    const b = addGoblin(store, 125, 75);
    store.getState().setSelection([a, b]);
    const steps = undoSteps(store);

    const copies = duplicateSelection(store);

    expect(copies).toHaveLength(2);
    expect(store.getState().selectedIds).toEqual(copies);
    expect(copies.map((id) => [tokenAt(store, id).x, tokenAt(store, id).y])).toEqual([[75, 75], [175, 125]]);
    expect(copies.map((id) => tokenAt(store, id).instanceNumber)).toEqual([3, 4]);
    expect(tokenAt(store, copies[0]!)).toMatchObject({ name: 'Goblin', resources: { hp: { current: 7, max: 7 } }, conditions: ['prone'] });
    expect(undoSteps(store)).toBe(steps + 1);

    getHistoryStore(store)!.getState().undo();
    expect(Object.keys(store.getState().objects.tokens).sort()).toEqual([a, b].sort());
  });

  it('keeps duplicates of the same originals from stacking on top of each other', () => {
    const { store } = createStore();
    const a = addGoblin(store, 25, 25);
    const [first] = store.getState().duplicateMapObjects([a]);
    const [second] = store.getState().duplicateMapObjects([a]);
    expect([tokenAt(store, first!).x, tokenAt(store, second!).x]).toEqual([75, 125]);
  });

  it('steps along the hex lattice so duplicates stay on hex centres', () => {
    const { store } = createStore(HEX);
    const a = addGoblin(store, 30, 60 / Math.sqrt(3));
    const [copy] = store.getState().duplicateMapObjects([a]);
    const origin = tokenAt(store, a);
    const moved = tokenAt(store, copy!);
    expect(Math.hypot(moved.x - origin.x, moved.y - origin.y)).toBeCloseTo(60);
  });

  it('pastes a copied group centred on the target, snapped to the grid, with its layout intact', async () => {
    const { store } = createStore();
    const a = addGoblin(store, 25, 25);
    const b = addGoblin(store, 125, 25);
    store.getState().setSelection([a, b]);
    expect(await copySelection(store)).toBe(true);
    expect(systemClipboard).toBe('Goblin\nGoblin');

    const pasted = await pasteClipboard(store, { x: 510, y: 490 });

    expect(pasted.map((id) => [tokenAt(store, id).x, tokenAt(store, id).y])).toEqual([[475, 475], [575, 475]]);
    expect(store.getState().selectedIds).toEqual(pasted);
  });

  it('pastes into another map, and repeated pastes at one spot fan out', async () => {
    const source = createStore().store;
    const target = createStore().store;
    const a = addGoblin(source, 25, 25);
    source.getState().setSelection([a]);
    await copySelection(source);

    const [first] = await pasteClipboard(target, { x: 260, y: 260 });
    const [second] = await pasteClipboard(target, { x: 260, y: 260 });

    expect([tokenAt(target, first!).x, tokenAt(target, first!).y]).toEqual([275, 275]);
    expect([tokenAt(target, second!).x, tokenAt(target, second!).y]).toEqual([325, 325]);
    expect(Object.keys(source.getState().objects.tokens)).toEqual([a]);
  });

  it('leaves pins to scenes of another collection behind when pasting into a map of a different collection', async () => {
    const source = createStore().store;
    const sameCollection = createStore().store;
    const otherCollection = createStore().store;
    source.setState({ mapPath: 'atlas-vtt/collections/Realm/scenes/Town.atlasmap' });
    sameCollection.setState({ mapPath: 'atlas-vtt/collections/Realm/scenes/Keep.atlasmap' });
    otherCollection.setState({ mapPath: 'atlas-vtt/collections/Other/scenes/Crypt.atlasmap' });
    const note = source.getState().addNotePin(0, 0, 'Notes/Tavern.md');
    const scene = source.getState().addNotePin(50, 0, 'atlas-vtt/collections/Realm/scenes/Keep.atlasmap');
    source.getState().setSelection([note, scene]);
    await copySelection(source);

    const links = (store: typeof source, ids: string[]): string[] => ids.map((id) => store.getState().objects.pins[id]!.notePath);
    expect(links(sameCollection, await pasteClipboard(sameCollection, { x: 100, y: 100 }))).toEqual(['Notes/Tavern.md', 'atlas-vtt/collections/Realm/scenes/Keep.atlasmap']);
    expect(links(otherCollection, await pasteClipboard(otherCollection, { x: 100, y: 100 }))).toEqual(['Notes/Tavern.md']);
  });

  it('cuts in one undo step and pastes the cut objects back', async () => {
    const { store } = createStore();
    const a = addGoblin(store, 25, 25);
    const drawing = store.getState().addDrawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], color: '#fff', width: 2, opacity: 1 });
    store.getState().setSelection([a, drawing]);
    const steps = undoSteps(store);

    expect(await cutSelection(store)).toBe(true);
    expect(store.getState().objects.tokens).toEqual({});
    expect(store.getState().objects.drawings).toEqual({});
    expect(store.getState().selectedIds).toEqual([]);
    expect(undoSteps(store)).toBe(steps + 1);

    const pasted = await pasteClipboard(store, { x: 25, y: 25 });
    expect(pasted).toHaveLength(2);
    expect(Object.keys(store.getState().objects.drawings)).toHaveLength(1);
  });

  it('ignores a stale copy once something else was copied outside Atlas', async () => {
    const { store } = createStore();
    store.getState().setSelection([addGoblin(store, 25, 25)]);
    await copySelection(store);
    systemClipboard = 'copied from a note';

    expect(await pasteClipboard(store, { x: 300, y: 300 })).toEqual([]);
    expect(Object.keys(store.getState().objects.tokens)).toHaveLength(1);
  });

  it('still pastes between maps when the system clipboard is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const { store } = createStore();
    store.getState().setSelection([addGoblin(store, 25, 25)]);
    await copySelection(store);
    expect(await pasteClipboard(store, { x: 300, y: 300 })).toHaveLength(1);
  });

  it('copies pins with fresh sequence labels and leaves the player view read-only', async () => {
    const { store } = createStore(NO_GRID);
    const pin = store.getState().addNotePin(10, 10, 'Notes/Room.md', 'number');
    const [copy] = store.getState().duplicateMapObjects([pin]);
    expect(store.getState().objects.pins[copy!]).toMatchObject({ x: 30, y: 30, notePath: 'Notes/Room.md', label: '2' });

    const { app } = createInMemoryApp();
    const player = createViewAtlasStore(app, `clipboard-player-${storeCount++}`, undefined, true);
    expect(await pasteClipboard(player, { x: 0, y: 0 })).toEqual([]);
  });

  it('leaves the wall tool alone and deletes selected texts and pins like cut does', async () => {
    const { store } = createStore();
    const token = addGoblin(store, 25, 25);
    const text = store.getState().addText({ x: 0, y: 0, text: 'Gate', fontSize: 16, fontFamily: 'serif', color: '#fff' });
    const pin = store.getState().addNotePin(10, 10, 'Notes/Room.md');
    const fog = store.getState().addFogOperation({ type: 'rect', points: [], isErasing: false } as never);
    store.getState().setSelection([token, text, pin, fog]);
    await copySelection(store);

    store.setState({ activeTool: 'wall' }); // the tool is behind a feature flag
    expect(await pasteClipboard(store, { x: 300, y: 300 })).toEqual([]);

    store.getState().deleteSelected();
    const { objects, selectedIds } = store.getState();
    expect([objects.tokens[token], objects.texts[text], objects.pins[pin]]).toEqual([undefined, undefined, undefined]);
    expect(selectedIds).toEqual([fog]);
  });

  it('saves pasted tokens to the map file', async () => {
    const { store, files } = createStore();
    const path = 'maps/clipboard.atlasmap';
    store.setState({ mapPath: path, mapLoaded: true });
    store.getState().setSelection([addGoblin(store, 25, 25)]);
    await copySelection(store);
    const [pasted] = await pasteClipboard(store, { x: 300, y: 300 });

    await store.flushStorage();
    await waitFor(() => expect(files.has(getDataFilePath(path))).toBe(true));
    const saved = JSON.parse(files.get(getDataFilePath(path))!);
    expect(saved.state.objects.tokens[pasted!]).toMatchObject({ x: 325, y: 325, name: 'Goblin', instanceNumber: 2 });
  });
});

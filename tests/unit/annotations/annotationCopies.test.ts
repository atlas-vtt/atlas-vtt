// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_DRAWINGS, MAX_TEXTS } from '../../../src/app/annotations/annotationTypes';
import { annotationsLeftOut } from '../../../src/app/annotations/annotationList';
import { duplicateSelection, copySelection, pasteClipboard } from '../../../src/app/clipboard/mapClipboardActions';
import { copyDragSelection } from '../../../src/app/pixi/token-renderer/dragCopy';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { DrawingStroke, TextElement } from '../../../src/app/types';
import { drawScene, type DrawScene } from '../../helpers/drawScene';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const notices: string[] = [];
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: (text: string) => notices.push(text) }));

let systemClipboard = '';
beforeEach(() => {
  notices.length = 0;
  systemClipboard = '';
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (text: string) => { systemClipboard = text; }, readText: async () => systemClipboard } });
});
afterEach(() => vi.unstubAllGlobals());

const stroke = (id: string): DrawingStroke => ({ id, kind: 'drawing', timestamp: 1, type: 'pen', points: [{ x: 10, y: 10 }, { x: 60, y: 10 }], color: '#ffffff', width: 4, opacity: 1 });
const label = (id: string): TextElement => ({ id, kind: 'text', x: 100, y: 100, text: 'Vault', fontSize: 24, fontFamily: 'Arial', color: '#ffffff' });

let made = 0;
/** A view whose level holds `drawings` drawings and `texts` texts, as a file would bring them. */
function holding(drawings: number, texts: number): ReturnType<typeof createViewAtlasStore> {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `copies-test-${made++}`);
  store.getState().setGrid({ enabled: true, type: 'square', size: 50, offsetX: 0, offsetY: 0, opacity: 1 });
  store.setState({
    objects: {
      ...store.getState().objects,
      drawings: Object.fromEntries(Array.from({ length: drawings }, (_, i) => [`d${i}`, stroke(`d${i}`)])),
      texts: Object.fromEntries(Array.from({ length: texts }, (_, i) => [`t${i}`, label(`t${i}`)])),
    },
  });
  getHistoryStore(store)!.getState().clear();
  return store;
}

const counts = (store: ReturnType<typeof createViewAtlasStore>): [number, number] => [Object.keys(store.getState().objects.drawings).length, Object.keys(store.getState().objects.texts).length];

describe('copies of drawings and texts on a level that is nearly full', () => {
  it('duplicates as many as the level has room for, and says that it is full', () => {
    const store = holding(MAX_DRAWINGS - 1, 3);
    store.getState().setSelection(['d0', 'd1', 'd2', 't0']);
    const copies = duplicateSelection(store);
    expect(counts(store)).toEqual([MAX_DRAWINGS, 4]);
    expect(copies).toHaveLength(2);
    expect(store.getState().selectedIds).toEqual(copies);
    expect(notices).toEqual(['A map can hold 2,000 drawings. Erase some to draw more.']);
    // Every drawing in the store is one the map shows.
    expect(annotationsLeftOut(store.getState().objects)).toEqual({ drawings: 0, texts: 0 });
  });

  it('pastes no text onto a level that holds as many as it may, and leaves no undo step', async () => {
    const store = holding(2, MAX_TEXTS);
    store.getState().setSelection(['t0']);
    await copySelection(store);
    expect(await pasteClipboard(store, { x: 300, y: 300 })).toEqual([]);
    expect(counts(store)).toEqual([2, MAX_TEXTS]);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
    expect(notices).toEqual([`A map can hold ${MAX_TEXTS} texts. Delete one to add another.`]);
  });

  it('copies the tokens of an Alt-drag and leaves the drawings selected with them, saying why', () => {
    const store = holding(MAX_DRAWINGS, 0);
    const token = store.getState().addToken({ kind: 'character', x: 100, y: 100, imagePath: 'goblin.png', name: 'Goblin' } as never);
    store.getState().setSelection([token, 'd0']);
    const copies = copyDragSelection(store, [token], { [token]: { x: 100, y: 100 } });
    expect(copies?.ids).toHaveLength(1);
    expect(Object.keys(store.getState().objects.tokens)).toHaveLength(2);
    expect(counts(store)).toEqual([MAX_DRAWINGS, 0]);
    expect(notices).toEqual(['A map can hold 2,000 drawings. Erase some to draw more.']);
  });

  it('writes none past the level\'s room whoever asks', () => {
    const store = holding(MAX_DRAWINGS - 2, MAX_TEXTS - 1);
    const ids = store.getState().insertMapObjects({ tokens: [], pins: [], levelLinks: [], drawings: [stroke('a'), stroke('b'), stroke('c')], texts: [label('x'), label('y')] });
    expect(ids).toHaveLength(3);
    expect(counts(store)).toEqual([MAX_DRAWINGS, MAX_TEXTS]);
  });
});

describe('a level that holds more drawings or texts than are shown', () => {
  let scene: DrawScene | undefined;
  afterEach(() => {
    scene?.destroy();
    scene = undefined;
  });

  /** Loads a scene whose level holds `drawings` drawings and `texts` texts. */
  function load(s: DrawScene, drawings: number, texts: number): void {
    s.store.setState({ isMapLoading: true });
    s.store.setState({
      objects: {
        ...s.store.getState().objects,
        drawings: Object.fromEntries(Array.from({ length: drawings }, (_, i) => [`d${i}`, stroke(`d${i}`)])),
        texts: Object.fromEntries(Array.from({ length: texts }, (_, i) => [`t${i}`, label(`t${i}`)])),
      },
    });
    s.store.setState({ isMapLoading: false });
  }

  it('counts what the reader passes over', () => {
    const drawings = Object.fromEntries(Array.from({ length: MAX_DRAWINGS + 7 }, (_, i) => [`d${i}`, stroke(`d${i}`)]));
    // One that is no drawing is not among those left out.
    Reflect.set(drawings, 'broken', { id: 'broken', kind: 'drawing' });
    expect(annotationsLeftOut({ drawings, texts: { t: label('t') } })).toEqual({ drawings: 7, texts: 0 });
    expect(annotationsLeftOut({})).toEqual({ drawings: 0, texts: 0 });
  });

  it('tells the GM once when it is loaded, and again only at the next load', () => {
    scene = drawScene();
    load(scene, MAX_DRAWINGS + 5, 2);
    expect(scene.full.mock.calls).toEqual([['drawingsLeftOut']]);
    // Nothing is removed, and no later change tells again.
    expect(scene.drawings()).toHaveLength(MAX_DRAWINGS + 5);
    scene.store.getState().setSelection(['d0']);
    scene.store.getState().deleteAnnotations(['d1']);
    expect(scene.full).toHaveBeenCalledTimes(1);
    load(scene, 3, MAX_TEXTS + 1);
    expect(scene.full.mock.calls).toEqual([['drawingsLeftOut'], ['textsLeftOut']]);
    load(scene, 3, 3);
    expect(scene.full).toHaveBeenCalledTimes(2);
  });

  it('tells nobody on a players\' own view', () => {
    scene = drawScene({ playerView: true });
    load(scene, MAX_DRAWINGS + 5, 2);
    expect(scene.full).not.toHaveBeenCalled();
  });
});

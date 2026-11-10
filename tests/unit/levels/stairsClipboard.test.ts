import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copySelection, cutSelection, duplicateSelection, pasteClipboard } from '../../../src/app/clipboard/mapClipboardActions';
import { copiedLevelLink, placedLevelLink } from '../../../src/app/levels/levelLinkCopies';
import { levelLinkList } from '../../../src/app/levels/levelLinks';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { GridState } from '../../../src/app/types/gridTypes';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { showNotice } from '../../../src/app/ui/notice';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const level = (id: string, n: number): SceneLevel => ({ id, name: id, elevation: { bottom: n * 10, top: n * 10 + 10 }, background: null });
const LEVELS = [level('cellar', 0), level('ground', 1), level('upper', 2), level('roof', 3)];
const GRID: GridState = { enabled: true, type: 'square', size: 50, offsetX: 0, offsetY: 0, opacity: 1 };
const SQUARE = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }];
const link = (levels: LevelLink['levels'], direction?: LevelLink['direction']): LevelLink => ({ id: 'stairs', kind: 'level-link', polygon: SQUARE, levels, ...(direction && { direction }) });

let systemClipboard = '';
beforeEach(() => {
  systemClipboard = '';
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: async (text: string) => { systemClipboard = text; }, readText: async () => systemClipboard } });
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.mocked(showNotice).mockClear();
});

describe('copied stairs as they land', () => {
  it('join the levels that lie the same way from where they land', () => {
    const copy = copiedLevelLink(link(['ground', 'upper'], 'up'), 'ground', LEVELS)!;
    expect(copy.steps).toEqual([0, 1]);
    expect(placedLevelLink(copy, 'ground', LEVELS)).toEqual({ polygon: SQUARE, levels: ['ground', 'upper'], direction: 'up' });
    expect(placedLevelLink(copy, 'cellar', LEVELS)).toMatchObject({ levels: ['cellar', 'ground'], direction: 'up' });
  });

  it('join the level below where no level lies above, and drop a way that would lead nowhere', () => {
    const copy = copiedLevelLink(link(['ground', 'upper'], 'up'), 'ground', LEVELS)!;
    expect(placedLevelLink(copy, 'roof', LEVELS)).toEqual({ polygon: SQUARE, levels: ['roof', 'upper'] });
  });

  it('keep an elevator to every level one, and land nowhere in a scene of one level', () => {
    const copy = copiedLevelLink(link('all'), 'upper', LEVELS)!;
    expect(placedLevelLink(copy, 'cellar', LEVELS)).toMatchObject({ levels: 'all' });
    expect(placedLevelLink(copy, 'ground', [LEVELS[0]!])).toBeNull();
    expect(copiedLevelLink(link(['ground', 'upper']), 'ground', undefined)).toBeNull();
  });
});

function stairsStore(): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `stairs-clipboard-${Math.random()}`);
  store.getState().setGrid(GRID);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false, isGMView: true, levels: LEVELS, viewedLevel: 'ground', activeTool: 'stairs',
    objects: { ...store.getState().objects, levelLinks: { stairs: link(['ground', 'upper']) } },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

const links = (store: ViewAtlasStore): LevelLink[] => levelLinkList(store.getState().objects.levelLinks);

describe('stairs in copy, paste, duplicate and cut', () => {
  it('duplicate the stairs whose popover is open one cell away, as one undo step, and open the copy', () => {
    const store = stairsStore();
    store.getState().openLevelLinkPopover('stairs');

    const [copy] = duplicateSelection(store);

    const placed = links(store).find((candidate) => candidate.id === copy);
    expect(placed).toMatchObject({ levels: ['ground', 'upper'], polygon: SQUARE.map(({ x, y }) => ({ x: x + 50, y: y + 50 })) });
    expect(store.getState().levelLinkPopover).toBe(copy);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    getHistoryStore(store)!.getState().undo();
    expect(links(store).map((candidate) => candidate.id)).toEqual(['stairs']);
  });

  it('paste on another level joining the levels the same way from there', async () => {
    const store = stairsStore();
    store.getState().openLevelLinkPopover('stairs');
    expect(await copySelection(store)).toBe(true);
    store.getState().setViewedLevel('upper');

    const [copy] = await pasteClipboard(store, { x: 500, y: 500 });

    expect(links(store).find((candidate) => candidate.id === copy)).toMatchObject({ levels: ['upper', 'roof'], polygon: [{ x: 450, y: 450 }, { x: 550, y: 450 }, { x: 550, y: 550 }, { x: 450, y: 550 }] });
  });

  it('cut the stairs in one undo step, and the popover closes', async () => {
    const store = stairsStore();
    store.getState().openLevelLinkPopover('stairs');
    expect(await cutSelection(store)).toBe(true);
    expect(links(store)).toHaveLength(0);
    expect(store.getState().levelLinkPopover).toBeNull();
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });

  it('copy nothing in the stairs tool while no stairs are open, though tokens are selected', async () => {
    const store = stairsStore();
    const token = store.getState().addToken({ kind: 'token', x: 25, y: 25, imagePath: 'a.png' } as never);
    store.getState().setSelection([token]);
    expect(await copySelection(store)).toBe(false);
  });

  it('tell the GM why stairs pasted into a scene of one level do not land', async () => {
    const store = stairsStore();
    store.getState().openLevelLinkPopover('stairs');
    await copySelection(store);
    store.setState({ levels: undefined, activeTool: 'move' });

    expect(await pasteClipboard(store, { x: 0, y: 0 })).toEqual([]);
    expect(showNotice).toHaveBeenCalledWith('Stairs join the levels of a scene, and this scene has only one.');
  });
});

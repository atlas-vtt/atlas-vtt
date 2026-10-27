import { beforeEach, describe, expect, it, vi } from 'vitest';
import { replacementFit } from '../../../src/app/levels/levelImageReplace';
import { levelImagePlacement } from '../../../src/app/levels/levelAlignment';
import { levelsForFile, sceneFileVersion } from '../../../src/app/levels/levelFile';
import { replaceMapImage } from '../../../src/app/react/components/levels/replaceMapImage';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import type { GridState } from '../../../src/app/types/gridTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const sizes = vi.hoisted(() => new Map<string, { width: number; height: number }>());
vi.mock('../../../src/app/pixi/mapImage/mapImageSize', () => ({ mapImageSize: async (_app: unknown, path: string) => sizes.get(path) ?? null }));
const notices = vi.hoisted(() => [] as string[]);
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: (text: string) => notices.push(text) }));

const GRID = { type: 'square', size: 70, offsetX: 0, offsetY: 0, visible: true, snapToGrid: true } as GridState;
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/still.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png' },
];

beforeEach(() => {
  sizes.clear();
  notices.length = 0;
  sizes.set('maps/still.png', { width: 2000, height: 1000 });
  sizes.set('maps/upper.png', { width: 2000, height: 1000 });
  sizes.set('maps/animated.webm', { width: 4000, height: 2000 });
  sizes.set('maps/gridless.png', { width: 2000, height: 1000 });
  sizes.set('maps/square.png', { width: 2000, height: 2000 });
  sizes.set('maps/close.png', { width: 3990, height: 2000 });
});

function sceneStore(levels?: SceneLevel[]): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `replace-map-${Math.random()}`);
  store.setState({ persistenceEnabled: false, mapPath: 'scenes/castle.atlasmap', mapLoaded: true, background: 'maps/still.png', grid: GRID, levels, viewedLevel: levels ? 'ground' : null });
  getHistoryStore(store)?.getState().clear();
  return store;
}

const worldWidth = (store: ViewAtlasStore, levelId: string | null, image: { width: number }): number => {
  const placement = levelImagePlacement(store.getState(), levelId);
  return image.width * placement.x + (placement.offset?.x ?? 0);
};

describe('how a replacing image fits', () => {
  const scene = { levels: LEVELS, grid: GRID };

  it('takes an image of the same size as it is, and scales one of the same shape onto the old one', () => {
    expect(replacementFit(scene, 'ground', { width: 2000, height: 1000 }, { width: 2000, height: 1000 })).toEqual({ kind: 'same' });
    const fit = replacementFit(scene, 'ground', { width: 2000, height: 1000 }, { width: 4000, height: 2000 });
    expect(fit).toEqual({ kind: 'scaled', alignment: { offset: { x: 0, y: 0 }, scale: 0.5, stretch: { x: 1, y: 1 } } });
  });

  it('allows one per cent of difference in shape, and refuses more', () => {
    expect(replacementFit(scene, 'ground', { width: 2000, height: 1000 }, { width: 3990, height: 2000 }).kind).toBe('scaled');
    expect(replacementFit(scene, 'ground', { width: 2000, height: 1000 }, { width: 3900, height: 2000 }).kind).toBe('aspect');
  });

  it('keeps a fitted level\'s offset and stretch, and draws a frame level as the scene\'s grid alignment does', () => {
    const fitted = { ...scene, levelAlignments: { upper: { offset: { x: 35, y: 70 }, scale: 1.2, stretch: { x: 1.1, y: 1 } } } };
    expect(replacementFit(fitted, 'upper', { width: 2000, height: 1000 }, { width: 1000, height: 500 })).toEqual({
      kind: 'scaled', alignment: { offset: { x: 35, y: 70 }, scale: 2.4, stretch: { x: 1.1, y: 1 } },
    });
    const stretched = { ...scene, grid: { ...GRID, mapStretch: { x: 1.04, y: 1 } } };
    const frame = replacementFit(stretched, 'ground', { width: 2000, height: 1000 }, { width: 4000, height: 2000 });
    expect(frame.kind === 'scaled' && frame.alignment.stretch).toEqual({ x: 1.04, y: 1 });
  });
});

describe('replacing a map image', () => {
  it('on the first level is one undo step, and the new image covers the old one\'s world', async () => {
    const store = sceneStore(LEVELS);
    const before = worldWidth(store, 'ground', { width: 2000 });
    await replaceMapImage(createInMemoryApp().app, store, 'ground', 'maps/animated.webm');

    expect(store.getState().background).toBe('maps/animated.webm');
    expect(worldWidth(store, 'ground', { width: 4000 })).toBe(before);
    const history = getHistoryStore(store)!.getState();
    expect(history.pastStates).toHaveLength(1);
    history.undo();
    expect(store.getState().background).toBe('maps/still.png');
    expect(store.getState().levelAlignments).toBeUndefined();
  });

  it('on a scene without levels gives it its one level, which carries the fit, and is one undo step', async () => {
    const store = sceneStore();
    await replaceMapImage(createInMemoryApp().app, store, null, 'maps/animated.webm');

    const { levels, background } = store.getState();
    expect(levels).toHaveLength(1);
    expect(background).toBe('maps/animated.webm');
    expect(worldWidth(store, levels![0]!.id, { width: 4000 })).toBe(2000);
    // An older Atlas would draw the larger image at its own size under the grid: the file says it is newer.
    expect(sceneFileVersion(levelsForFile(levels, background, store.getState().levelAlignments))).toBe(5);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });

  it('of the same size swaps the image alone', async () => {
    const store = sceneStore(LEVELS);
    await replaceMapImage(createInMemoryApp().app, store, 'ground', 'maps/gridless.png');
    expect(store.getState().background).toBe('maps/gridless.png');
    expect(store.getState().levelAlignments).toBeUndefined();
  });

  it('on another level writes the image and its fit as level settings, and lets go of the history that fitted the old one', async () => {
    const store = sceneStore(LEVELS);
    store.getState().setGridVisible(false);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    await replaceMapImage(createInMemoryApp().app, store, 'upper', 'maps/animated.webm');
    expect(store.getState().levels?.[1]?.background).toBe('maps/animated.webm');
    expect(store.getState().levelAlignments?.upper?.scale).toBe(0.5);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(0);
  });

  it('refuses an image of another shape with a sentence, and changes nothing', async () => {
    const store = sceneStore(LEVELS);
    await replaceMapImage(createInMemoryApp().app, store, 'ground', 'maps/square.png');
    expect(store.getState().background).toBe('maps/still.png');
    expect(notices).toEqual(['This image is 2000 × 2000 pixels, which is not the shape of the map it would replace (2000 × 1000). Replace a map only with another version of it: gridless or gridded, animated, a larger export.']);
  });
});

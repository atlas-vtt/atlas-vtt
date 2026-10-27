// @vitest-environment jsdom
import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import { NotePinTool } from '../../../src/app/tools/NotePinTool';
import { pinSceneLevel } from '../../../src/app/levels/pinSceneLevel';
import { linkedSceneLevels } from '../../../src/app/services/linkedSceneLevels';
import { pinSceneLevelEntry } from '../../../src/app/pixi/pinSceneLevelMenu';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { NotePin } from '../../../src/app/types';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'maps/ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'maps/upper.png' },
];
const TOWER = 'atlas-vtt/collections/c/scenes/Tower.atlasmap';
const CAVE = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const pin = (notePath: string, sceneLevel?: string): NotePin => ({ id: 'pin', kind: 'pin', x: 10, y: 10, notePath, ...(sceneLevel !== undefined && { sceneLevel }) });
const sceneFile = (levels?: SceneLevel[]): string => JSON.stringify({ state: { schema: 'atlas-vtt', version: 5, background: 'maps/ground.png', ...(levels && { levels }), objects: { tokens: {} } }, version: 5 });

describe('the level a pin opens', () => {
  it('is the level it names, the first where its scene no longer has it, and none where it names none', () => {
    expect(pinSceneLevel(pin(TOWER, 'upper'), LEVELS)).toBe('upper');
    expect(pinSceneLevel(pin(TOWER, 'gone'), LEVELS)).toBe('ground');
    expect(pinSceneLevel(pin(TOWER), LEVELS)).toBeNull();
    expect(pinSceneLevel(pin(TOWER, 'upper'), undefined)).toBeNull();
  });

  it('reads the linked scene\'s levels from its file, or the view\'s own for a pin on the same scene', async () => {
    const { app } = createInMemoryApp({ files: { [TOWER]: sceneFile(LEVELS), [CAVE]: sceneFile() } });
    expect((await linkedSceneLevels(app, { mapPath: CAVE }, TOWER))?.map((level) => level.id)).toEqual(['ground', 'upper']);
    expect(await linkedSceneLevels(app, { mapPath: TOWER }, CAVE)).toBeNull();
    const own: SceneLevel[] = [LEVELS[0]!, { ...LEVELS[1]!, id: 'attic' }];
    expect(await linkedSceneLevels(app, { mapPath: TOWER, levels: own }, TOWER)).toBe(own);
    expect(await linkedSceneLevels(app, { mapPath: CAVE }, 'Notes/Lore.md')).toBeNull();
  });

  it('never reads a scene of another collection: such a pin opens no level', async () => {
    const other = 'atlas-vtt/collections/d/scenes/Tower.atlasmap';
    const { app } = createInMemoryApp({ files: { [other]: sceneFile(LEVELS) } });
    expect(await linkedSceneLevels(app, { mapPath: CAVE }, other)).toBeNull();
  });

  it('is chosen in the pin\'s menu, top floor first, one undo step each', () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `pin-level-${Math.random()}`);
    store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, pins: { pin: pin(TOWER) } } });
    getHistoryStore(store)?.getState().clear();
    const entry = pinSceneLevelEntry(store, pin(TOWER), LEVELS);
    if (entry?.type !== 'submenu' || !Array.isArray(entry.children)) throw new Error('no level menu');
    expect(entry.children.map((child) => (child.type === 'item' ? [child.label, child.checked] : null))).toEqual([
      ['The level last shown', true], ['Upper', false], ['Ground', false],
    ]);
    const upper = entry.children[1]!;
    if (upper.type === 'item') upper.onClick();
    expect(store.getState().objects.pins.pin!.sceneLevel).toBe('upper');
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
    expect(pinSceneLevelEntry(store, pin(TOWER), [LEVELS[0]!])).toBeNull();
  });
});

describe('a pin to another level of its own scene', () => {
  it('shows that level and opens nothing', () => {
    const { app } = createInMemoryApp({ files: { [TOWER]: sceneFile(LEVELS) } });
    const setViewState = vi.fn();
    Object.assign(app.workspace, { getLeavesOfType: () => [{ setViewState }], getLeaf: () => ({ setViewState }) });
    const store = createViewAtlasStore(app, `pin-own-level-${Math.random()}`);
    store.setState({ persistenceEnabled: false, mapPath: TOWER, levels: LEVELS, viewedLevel: 'ground' });
    const tool = new NotePinTool(new EventEmitter(), app, store);
    try {
      tool.openLinkedNote(pin(TOWER, 'upper'));
      expect(store.getState().viewedLevel).toBe('upper');
      expect(setViewState).not.toHaveBeenCalled();
    } finally {
      tool.destroy();
    }
  });
});

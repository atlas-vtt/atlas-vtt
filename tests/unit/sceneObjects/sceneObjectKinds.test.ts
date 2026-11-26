import { describe, expect, it } from 'vitest';
import type { ViewAtlasState, ViewAtlasStore } from '../../../src/app/storeFactory';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { openStore, type History } from '../../helpers/historyScenes';

/**
 * What adding, changing and removing every kind of scene object does to the store: where it is
 * placed, what a change writes, what its removal takes with it (the selection, an open popover,
 * a token's auras, spatial audio), and that one undo puts back exactly what each took.
 */

type Collection = Exclude<keyof ViewAtlasState['objects'], 'fog'>;
type Popover = 'lightPopover' | 'lightZonePopover' | 'levelLinkPopover' | 'levelSurfacePopover' | 'measurePopover';

/** How one removal path of a kind treats what is around the object it takes. */
interface Removal {
  run: (store: ViewAtlasStore, id: string) => void;
  /** It takes the object out of the selection. */
  deselects: boolean;
  /** It closes the kind's popover on the object. */
  closesPopover: boolean;
  /** It tells spatial audio to work out again. */
  heard: boolean;
}

interface Kind {
  collection: Collection;
  tag: string;
  add: (store: ViewAtlasStore) => string;
  /** Where an object added on the second of two levels is placed. */
  placed: Record<string, unknown>;
  /** Adding it tells spatial audio to work out again. */
  addHeard: boolean;
  /** A change that sets `set` and takes `gone` away (given as undefined). */
  patch?: { run: (store: ViewAtlasStore, id: string) => void; set: Record<string, unknown>; gone: string; keepsGone: boolean; heard: boolean };
  popover?: Popover;
  removals: Record<string, Removal>;
}

const SQUARE = [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 70 }, { x: 0, y: 70 }];
const LEVEL = 'upper';

const removal = (run: Removal['run'], deselects: boolean, closesPopover: boolean, heard: boolean): Removal => ({ run, deselects, closesPopover, heard });
const s = (store: ViewAtlasStore): ViewAtlasState => store.getState();

const KINDS: Kind[] = [
  {
    collection: 'tokens', tag: 'token', placed: { level: LEVEL }, addHeard: false,
    add: (store) => s(store).addTokens([{ x: 0, y: 0, imagePath: 'art/a.png', statblockPath: 'notes/a.md' }])[0]!,
    patch: { run: (store, id) => s(store).updateToken(id, { name: 'Renamed', statblockPath: undefined }), set: { name: 'Renamed' }, gone: 'statblockPath', keepsGone: true, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, true) },
  },
  {
    collection: 'pins', tag: 'pin', placed: { level: LEVEL }, addHeard: false,
    add: (store) => s(store).addNotePin(10, 10, 'notes/inn.md', undefined, { showName: true }),
    patch: { run: (store, id) => s(store).patchObject('pins', id, { hex: true, showName: undefined }), set: { hex: true }, gone: 'showName', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, false) },
  },
  {
    collection: 'drawings', tag: 'drawing', placed: { level: LEVEL }, addHeard: false,
    add: (store) => s(store).addDrawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], color: '#ffffff', width: 2, opacity: 1, group: 'g' }),
    patch: { run: (store, id) => s(store).updateAnnotations([id], { color: '#ff0000', group: undefined }), set: { color: '#ff0000' }, gone: 'group', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, false) },
  },
  {
    collection: 'texts', tag: 'text', placed: { level: LEVEL }, addHeard: false,
    add: (store) => s(store).addText({ x: 0, y: 0, text: 'Gate', fontSize: 16, fontFamily: 'serif', color: '#ffffff', bold: true }),
    patch: { run: (store, id) => s(store).updateText(id, { text: 'Door', bold: undefined }), set: { text: 'Door' }, gone: 'bold', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, false) },
  },
  {
    collection: 'walls', tag: 'wall', placed: { levels: [LEVEL] }, addHeard: true,
    add: (store) => s(store).addObject('walls', { type: 'door', p1: { x: 0, y: 0 }, p2: { x: 70, y: 0 }, direction: 'left' }),
    patch: { run: (store, id) => s(store).patchObject('walls', id, { closed: false, direction: undefined }), set: { closed: false }, gone: 'direction', keepsGone: false, heard: true },
    removals: {
      removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, true),
      editWalls: removal((store, id) => s(store).editWalls([id], []), true, false, true),
    },
  },
  {
    collection: 'lights', tag: 'light', placed: { levels: [LEVEL] }, addHeard: false, popover: 'lightPopover',
    add: (store) => s(store).addObject('lights', { x: 10, y: 10, rotation: 90, emission: { bright: 20, dim: 40, color: '#ffffff', intensity: 1 } }),
    patch: { run: (store, id) => s(store).patchObject('lights', id, { hidden: true, rotation: undefined }), set: { hidden: true }, gone: 'rotation', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, true, false) },
  },
  {
    collection: 'lightZones', tag: 'light-zone', placed: { levels: [LEVEL] }, addHeard: false, popover: 'lightZonePopover',
    add: (store) => s(store).addObject('lightZones', { polygon: SQUARE, ambient: 0.2, name: 'Cave' }),
    patch: { run: (store, id) => s(store).patchObject('lightZones', id, { ambient: 0.6, name: undefined }), set: { ambient: 0.6 }, gone: 'name', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, true, false) },
  },
  {
    collection: 'audios', tag: 'audio', placed: { levels: [LEVEL] }, addHeard: true,
    add: (store) => s(store).addObject('audios', { x: 10, y: 10, innerRadius: 20, outerRadius: 60, volume: 1, soundId: 'fire', loop: true }),
    patch: { run: (store, id) => s(store).patchObject('audios', id, { volume: 0.2, levels: undefined }), set: { volume: 0.2 }, gone: 'levels', keepsGone: false, heard: true },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, true) },
  },
  {
    collection: 'levelLinks', tag: 'level-link', placed: {}, addHeard: false, popover: 'levelLinkPopover',
    add: (store) => s(store).addObject('levelLinks', { polygon: SQUARE, levels: ['ground', LEVEL], direction: 'up' }),
    patch: { run: (store, id) => s(store).patchObject('levelLinks', id, { polygon: SQUARE.slice(0, 3), direction: undefined }), set: { polygon: SQUARE.slice(0, 3) }, gone: 'direction', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, true, false) },
  },
  {
    collection: 'levelSurfaces', tag: 'level-surface', placed: { level: LEVEL }, addHeard: false, popover: 'levelSurfacePopover',
    add: (store) => s(store).addObject('levelSurfaces', { polygon: SQUARE, open: true }),
    patch: { run: (store, id) => s(store).patchObject('levelSurfaces', id, { open: false, level: undefined }), set: { open: false }, gone: 'level', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, true, false) },
  },
  {
    collection: 'mapFeatures', tag: 'map-feature', placed: { level: LEVEL }, addHeard: false,
    add: (store) => s(store).addMapFeatures([{ polygon: SQUARE, name: 'Rubble', terrain: { difficult: true } }])[0]!,
    patch: { run: (store, id) => s(store).patchObject('mapFeatures', id, { name: 'Bridge', terrain: undefined }), set: { name: 'Bridge' }, gone: 'terrain', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, false) },
  },
  {
    collection: 'liquids', tag: 'liquid', placed: { level: LEVEL }, addHeard: false,
    add: (store) => s(store).addLiquids([{ liquid: 'water', polygon: SQUARE }])[0]!,
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, false, false) },
  },
  {
    collection: 'measures', tag: 'measure', placed: { level: LEVEL }, addHeard: false, popover: 'measurePopover',
    add: (store) => s(store).addMeasure({ shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], hidden: true })!,
    patch: { run: (store, id) => s(store).patchObject('measures', id, { color: '#ff0000', hidden: undefined }), set: { color: '#ff0000' }, gone: 'hidden', keepsGone: false, heard: false },
    removals: { removeObjects: removal((store, id) => s(store).removeObjects([id]), true, true, false) },
  },
];

const level = (id: string, bottom: number): SceneLevel => ({ id, elevation: { bottom, top: bottom + 10 }, background: null });

/** A scene of two levels, the view on the upper one, with token `keep` selected. */
function scene(): { store: ViewAtlasStore; history: History; keep: string } {
  const { store, history } = openStore();
  s(store).setLevels([level('ground', 0), level(LEVEL, 10)]);
  s(store).setViewedLevel(LEVEL);
  const keep = s(store).addTokens([{ x: 200, y: 200, imagePath: 'art/keep.png' }])[0]!;
  return { store, history, keep };
}

const objectOf = (store: ViewAtlasStore, collection: Collection, id: string): Record<string, unknown> | undefined =>
  (s(store).objects[collection] as Record<string, Record<string, unknown>> | undefined)?.[id];

const undo = (store: ViewAtlasStore): void => store.temporal.getState().undo();

describe.each(KINDS)('$collection', (kind) => {
  it('is added on the level shown, in one undo step', () => {
    const { store, history } = scene();
    store.setState({ _audioDirty: false });
    const before = history().pastStates.length;

    const id = kind.add(store);

    expect(objectOf(store, kind.collection, id)).toMatchObject({ id, kind: kind.tag, ...kind.placed });
    expect(s(store)._audioDirty).toBe(kind.addHeard);
    expect(history().pastStates).toHaveLength(before + 1);
    undo(store);
    expect(objectOf(store, kind.collection, id)).toBeUndefined();
  });

  it.runIf(kind.patch)('is changed in one undo step, a field given as undefined taken away', () => {
    const patch = kind.patch!;
    const { store, history } = scene();
    const id = kind.add(store);
    const added = objectOf(store, kind.collection, id);
    store.setState({ _audioDirty: false });

    patch.run(store, id);

    const changed = objectOf(store, kind.collection, id)!;
    expect(changed).toMatchObject(patch.set);
    expect(changed[patch.gone]).toBeUndefined();
    expect(Object.hasOwn(changed, patch.gone)).toBe(patch.keepsGone);
    expect(s(store)._audioDirty).toBe(patch.heard);
    const steps = history().pastStates.length;
    undo(store);
    expect(history().pastStates).toHaveLength(steps - 1);
    expect(objectOf(store, kind.collection, id)).toEqual(added);
  });

  describe.each(Object.entries(kind.removals))('removed by %s', (_path, way) => {
    it('takes what it should with it, and one undo puts back all it took', () => {
      const { store, history, keep } = scene();
      const id = kind.add(store);
      const objects = s(store).objects;
      store.setState({ selectedIds: [id, keep], _audioDirty: false, ...(kind.popover && { [kind.popover]: id }) });
      const steps = history().pastStates.length;

      way.run(store, id);

      expect(objectOf(store, kind.collection, id)).toBeUndefined();
      expect(s(store).selectedIds).toEqual(way.deselects ? [keep] : [id, keep]);
      if (kind.popover) expect(s(store)[kind.popover]).toBe(way.closesPopover ? null : id);
      expect(s(store)._audioDirty).toBe(way.heard);
      expect(history().pastStates).toHaveLength(steps + 1);
      undo(store);
      expect(s(store).objects).toEqual(objects);
    });
  });
});

describe('a token removed', () => {
  it.each(Object.keys(KINDS[0]!.removals))('by %s takes the auras that follow it, and undo brings them back', (path) => {
    const { store, keep } = scene();
    const id = KINDS[0]!.add(store);
    s(store).setTokenAuras([{ tokenId: id, aura: 10, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] }, { tokenId: keep, aura: 10, points: [{ x: 200, y: 200 }, { x: 270, y: 200 }] }]);
    const aura = (tokenId: string): string | undefined => Object.values(s(store).objects.measures ?? {}).find((measure) => measure.follows === tokenId)?.id;
    const own = aura(id)!;
    const objects = s(store).objects;
    store.setState({ measurePopover: own });

    KINDS[0]!.removals[path]!.run(store, id);

    expect(aura(id)).toBeUndefined();
    expect(aura(keep)).toBeDefined();
    expect(s(store).measurePopover).toBeNull();
    undo(store);
    expect(s(store).objects).toEqual(objects);
  });
});

describe('a locked drawing or text', () => {
  it('stays, and stays selected, when it is removed by id', () => {
    const { store, keep } = scene();
    const drawing = s(store).addDrawing({ type: 'line', points: [{ x: 0, y: 0 }, { x: 50, y: 0 }], color: '#ffffff', width: 2, opacity: 1, locked: true });
    const text = s(store).addText({ x: 0, y: 0, text: 'Gate', fontSize: 16, fontFamily: 'serif', color: '#ffffff', locked: true });
    store.setState({ selectedIds: [drawing, text, keep] });

    s(store).removeObjects([drawing, text, keep]);

    expect(objectOf(store, 'drawings', drawing)).toBeDefined();
    expect(objectOf(store, 'texts', text)).toBeDefined();
    expect(s(store).selectedIds).toEqual([drawing, text]);
  });
});

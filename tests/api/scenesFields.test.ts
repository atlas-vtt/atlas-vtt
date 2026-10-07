// @vitest-environment node
// Reading an image header needs Blob.arrayBuffer, which jsdom lacks.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { savedMapText } from '../../src/api/savedMap';
import type { SavedMap } from '../../src/api/types/scenes';
import { AssetService } from '../../src/app/services/AssetService';
import { DEFAULT_TOKEN_SETTINGS } from '../../src/app/storeFactory';
import { emptyMap, MAP_PATH, PNG, withScene, type Fixture } from './scenesFixture';

const FIELDS = ['pins', 'walls', 'lights', 'lightZones', 'camera', 'tokenSettings', 'initiativeTrackerOpen'] as const;
const FOLDER = 'atlas-vtt/collections/Imported/Cave';

/** Writes Cave's file again at `path` with `change` applied to its state, and reads it back. */
async function variant(fixture: Fixture, path: string, change: (state: Record<string, unknown>) => void): Promise<SavedMap> {
  const file = JSON.parse(await fixture.vault.app.vault.adapter.read(MAP_PATH)) as { state: Record<string, unknown> };
  change(file.state);
  await fixture.vault.app.vault.create(path, JSON.stringify(file));
  return (await fixture.scenes.readMap(path))!;
}

const pick = (map: SavedMap): Partial<SavedMap> => Object.fromEntries(FIELDS.map((field) => [field, map[field]]));

beforeEach(() => { AssetService.resetInstance(); });
afterEach(() => vi.restoreAllMocks());

describe('the optional fields of a saved map', () => {
  it('C-scenes-2: a readMap result handed to addToCollection keeps pins, walls, lights, light zones, camera, token settings and the tracker', async () => {
    const fixture = await withScene();
    const rich = await variant(fixture, 'atlas-vtt/collections/source/scenes/Rich.atlasmap', (state) => {
      Object.assign(state.objects as object, {
        lights: { l1: { id: 'l1', kind: 'light', x: 1, y: 2, bright: 10, dim: 20 } },
        lightZones: { z1: { id: 'z1', kind: 'light-zone', polygon: [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 0, y: 9 }], ambient: 0.4 } },
      });
    });
    const { mapPath } = await fixture.scenes.addToCollection({ collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER, map: rich, images: [] });
    const copy = (await fixture.scenes.readMap(mapPath))!;
    expect(pick(copy)).toEqual(pick(rich));
    expect(copy.lightZones).toHaveProperty('z1');
    expect(copy.initiativeTrackerOpen).toBe(true);
    // Token settings are written as Atlas's own save writes them, with the bar switches.
    const saved = JSON.parse(await fixture.vault.app.vault.adapter.read(mapPath)) as { state: { tokenSettings: Record<string, unknown> } };
    expect(saved.state.tokenSettings).toMatchObject({ showHPBars: false, showStressBars: true });
  });

  it('C-scenes-2: a malformed pin, camera or token setting throws and leaves nothing behind', async () => {
    const fixture = await withScene();
    const bad = [
      { pins: { p: { id: 'p', kind: 'pin', x: 0, y: 0, notePath: '../outside.md' } } },
      { pins: { p: { id: 'p', kind: 'pin', x: Number.NaN, y: 0, notePath: 'Notes/a.md' } } },
      { camera: { x: 0, y: 0, scale: 0 } },
      { tokenSettings: { tokenRingSize: 'big' } },
      { walls: [] },
      { lightZones: 'none' },
    ];
    for (const fields of bad) {
      const input = { collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER, map: emptyMap(fields as never), images: [{ path: 'bg.webp', data: new ArrayBuffer(4) }] };
      await expect(fixture.scenes.addToCollection(input)).rejects.toThrow(/\[Atlas API\]/);
      expect(await fixture.vault.app.vault.adapter.exists(FOLDER)).toBe(false);
      expect((await fixture.assets.getCollections()).map((collection) => collection.id)).not.toContain('Imported');
      expect((await fixture.assets.getAssets(undefined, 'scene')).map((scene) => scene.name)).toEqual(['Cave']);
    }
  });

  it('C-scenes-2: a grid Atlas could never finish drawing throws and leaves nothing behind, a plain map included', async () => {
    const fixture = await withScene();
    const grid = { enabled: true, type: 'square' as const, size: 70, offsetX: 0, offsetY: 0, opacity: 0.5 };
    // PNG() is 320 x 200: a size of 0.1 gives 3,200 cells along its width.
    const bad = [{ ...grid, size: -1 }, { ...grid, size: Number.NaN }, { ...grid, size: 0.1 }, { ...grid, type: 'triangle' }, { ...grid, lineType: 'wavy' }, { ...grid, offsetY: Infinity }, { ...grid, size: 38.52, offsetX: 5.53816e87 }];
    for (const value of bad) {
      const input = { collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER, map: emptyMap({ background: 'bg.png', grid: value as never }), images: [{ path: 'bg.png', data: PNG() }] };
      await expect(fixture.scenes.addToCollection(input)).rejects.toThrow(/\[Atlas API\] scenes.addToCollection: the map's .*grid/);
      expect(await fixture.vault.app.vault.adapter.exists(FOLDER)).toBe(false);
      expect((await fixture.assets.getAssets(undefined, 'scene')).map((scene) => scene.name)).toEqual(['Cave']);
    }
    const fine = { collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER, map: emptyMap({ background: 'bg.png', grid: { ...grid, size: 4 } }), images: [{ path: 'bg.png', data: PNG() }] };
    await expect(fixture.scenes.addToCollection(fine)).resolves.toMatchObject({ mapPath: expect.any(String) });
  });

  it('C-scenes-2: a grid as Atlas saves it, read with readMap, is added as it is', async () => {
    const fixture = await withScene();
    // A collection's own unit and the fields a new scene gets; no offsets or opacity in an older file.
    const saved = { enabled: true, visible: true, type: 'hex-vertical', size: 64, unitType: 'custom', unitDistance: 5, lineType: 'dashed', autoDetect: true };
    const read = await variant(fixture, 'atlas-vtt/collections/source/scenes/Hex.atlasmap', (state) => { state.grid = saved; });
    const { mapPath } = await fixture.scenes.addToCollection({ collection: { name: 'Imported' }, name: 'Hex', folder: FOLDER, map: read, images: [] });
    expect((await fixture.scenes.readMap(mapPath))!.grid).toMatchObject({ size: 64, unitType: 'custom', type: 'hex-vertical' });
  });

  it("C-scenes-2: a pin's notePath is a vault path, never rewritten as an image path", async () => {
    const fixture = await withScene();
    const pins = { p: { id: 'p', kind: 'pin' as const, x: 0, y: 0, notePath: 'bg.webp' } };
    const { mapPath } = await fixture.scenes.addToCollection({
      collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER, map: emptyMap({ background: 'bg.webp', pins }), images: [{ path: 'bg.webp', data: new ArrayBuffer(4) }],
    });
    const map = (await fixture.scenes.readMap(mapPath))!;
    expect(map.background).toBe(`${FOLDER}/bg.webp`);
    expect(map.pins?.p?.notePath).toBe('bg.webp');
  });

  it('C-scenes-2: a map without the optional fields writes the same file as before them', async () => {
    const fixture = await withScene();
    const { mapPath } = await fixture.scenes.addToCollection({
      collection: { name: 'Imported' }, name: 'Cave', folder: FOLDER, map: emptyMap({ background: 'bg.webp' }), images: [{ path: 'bg.webp', data: new ArrayBuffer(4) }],
    });
    expect(await fixture.vault.app.vault.adapter.read(mapPath)).toBe(savedMapText(emptyMap({ background: `${FOLDER}/bg.webp` }), mapPath, 'Cave'));
  });

  it('C-scenes-3: readMap falls back for a camera or token settings it cannot read, and drops unknown token settings', async () => {
    const fixture = await withScene();
    const map = await variant(fixture, 'atlas-vtt/collections/source/scenes/Odd.atlasmap', (state) => {
      Object.assign(state, { camera: { x: 'a', y: 0, scale: 1 }, tokenSettings: { showNameplates: true, tokenRingSize: 'big', extra: 1 } });
    });
    expect(map.camera).toEqual({ x: 0, y: 0, scale: 1 });
    expect(map.tokenSettings).toEqual({ ...DEFAULT_TOKEN_SETTINGS, showNameplates: true });
  });
});
